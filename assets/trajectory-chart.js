/* Canonical trajectory chart — renders window.SOVEREIGN_TIMELINE[graph] into [data-graph].
   Safe DOM construction only (no innerHTML with data). */
(function () {
  "use strict";
  function cssVar(n, fb) {
    try { var v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return v || fb; }
    catch (e) { return fb; }
  }
  var TEAL = cssVar("--accent-teal", "#0d9488"), AMBER = cssVar("--accent-amber", "#d97706"),
      VIOLET = cssVar("--accent-violet", "#7c3aed"), BLUE = cssVar("--accent-blue", "#2563eb"),
      ROSE = cssVar("--accent-rose", "#e11d48"), DIM = cssVar("--text-dim", "#94a3b8"),
      /* axis ticks + rotated Y-title use the PRIMARY (near-black) text colour so
         they are genuinely legible — the old --text-secondary slate read faint. */
      AXIS = cssVar("--text-primary", "#1a202c"),
      LINE = cssVar("--border-subtle", "#e2e8f0");
  var SIDE = { demand: BLUE, supply: VIOLET, policy: AMBER, shock: ROSE };

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }
  function link(href, txt) {
    var a = el("a", null, txt);
    a.setAttribute("href", href); a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener");
    return a;
  }
  function yearFrac(s) {
    var m = String(s).match(/(\d{4})(?:-(\d{1,2}))?/); if (!m) return NaN;
    return parseInt(m[1], 10) + (m[2] ? (parseInt(m[2], 10) - 1) / 12 : 0);
  }
  /* Fritsch–Carlson monotone tangents — a cumulative running sum is monotone
     non-decreasing, so the rendered curve must never overshoot below the data
     floor (the old Catmull-Rom undershot below zero at the flat→steep bend). */
  function monoTangents(X, Y) {
    var n = X.length, d = [], m = [], i;
    for (i = 0; i < n - 1; i++) { var dx = X[i + 1] - X[i]; d[i] = dx ? (Y[i + 1] - Y[i]) / dx : 0; }
    m[0] = d[0] || 0; m[n - 1] = d[n - 2] || 0;
    for (i = 1; i < n - 1; i++) m[i] = (d[i - 1] * d[i] <= 0) ? 0 : (d[i - 1] + d[i]) / 2;
    for (i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      var a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { var t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    return m;
  }
  /* monotone cubic Hermite at xf (data space) — markers sit exactly on the rendered curve */
  function hermite(X, Y, M, xf) {
    var n = X.length;
    if (xf <= X[0]) return Y[0];
    if (xf >= X[n - 1]) return Y[n - 1];
    for (var i = 0; i < n - 1; i++) if (xf >= X[i] && xf <= X[i + 1]) {
      var h = X[i + 1] - X[i], t = (xf - X[i]) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * Y[i] + (t3 - 2 * t2 + t) * h * M[i]
           + (-2 * t3 + 3 * t2) * Y[i + 1] + (t3 - t2) * h * M[i + 1];
    }
    return Y[n - 1];
  }
  function smooth(ctx, pts) {
    if (pts.length < 2) return;
    if (pts.length === 2) { ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); return; }
    var X = pts.map(function (p) { return p.x; }), Y = pts.map(function (p) { return p.y; });
    var m = monoTangents(X, Y);
    ctx.moveTo(X[0], Y[0]);
    for (var i = 0; i < pts.length - 1; i++) {
      var h = X[i + 1] - X[i];
      ctx.bezierCurveTo(X[i] + h / 3, Y[i] + m[i] * h / 3,
                        X[i + 1] - h / 3, Y[i + 1] - m[i + 1] * h / 3, X[i + 1], Y[i + 1]);
    }
  }
  /* round an axis maximum up to a clean value whose /4 step is a round number
     (e.g. 230 -> 250 so ticks are 0/62.5.. -> 0/63 becomes 0/50/100/150/200/250-style). */
  function niceStep(rough) {
    var pow = Math.pow(10, Math.floor(Math.log(rough) / Math.LN10));
    var f = rough / pow;
    var nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return nf * pow;
  }
  function niceMax(vmaxRaw, ticks) {
    if (!(vmaxRaw > 0)) return 1;
    var step = niceStep(vmaxRaw / ticks);
    return { max: step * ticks, step: step };
  }
  function fmtTick(v) {
    if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (v % 1 === 0) return String(v);
    return String(Math.round(v * 10) / 10);
  }
  function modalBack() {
    var b = document.getElementById("tjxModalBack");
    if (b) return b;
    b = el("div", "tjx-modal-back"); b.id = "tjxModalBack";
    var box = el("div", "tjx-modal"); box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true");
    b.appendChild(box);
    b.addEventListener("click", function (e) { if (e.target === b) b.classList.remove("on"); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") b.classList.remove("on"); });
    document.body.appendChild(b);
    return b;
  }
  function openModal(m) {
    var b = modalBack(), box = b.querySelector(".tjx-modal"), col = SIDE[m.side] || TEAL;
    while (box.firstChild) box.removeChild(box.firstChild);
    var x = el("button", "tjx-modal-x", "×"); x.setAttribute("aria-label", "Close");
    x.addEventListener("click", function () { b.classList.remove("on"); });
    box.appendChild(x);
    var head = el("div", "tjx-modal-head");
    var badge = el("div", "tjx-modal-badge", String(m.n)); badge.style.background = col;
    var meta = el("div");
    var side = el("div", "tjx-modal-side", (m.side || "") + " · " + (m.date || "")); side.style.color = col;
    meta.appendChild(side); meta.appendChild(el("div", "tjx-modal-title", m.title));
    head.appendChild(badge); head.appendChild(meta); box.appendChild(head);
    /* narrative renders as bullets when authored as an array (or a string with
       newline / " • " separators) — no dense paragraph blob in the modal.
       Safe DOM construction only; never innerHTML with data. */
    var body = el("div", "tjx-modal-body");
    var items = Array.isArray(m.narrative)
      ? m.narrative
      : String(m.narrative || "").split(/\n+|\s+•\s+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (items.length > 1) {
      var ul = el("ul", "tjx-modal-list");
      items.forEach(function (it) { ul.appendChild(el("li", null, it)); });
      body.appendChild(ul);
    } else {
      body.appendChild(document.createTextNode(items[0] || ""));
    }
    box.appendChild(body);
    if (m.src) {
      var s = el("div", "tjx-modal-src"); s.appendChild(document.createTextNode("Source: "));
      s.appendChild(link(m.src, m.src.replace(/^https?:\/\//, "").slice(0, 64)));
      box.appendChild(s);
    }
    b.classList.add("on");
  }

  function render(host) {
    var key = host.getAttribute("data-graph");
    var T = window.SOVEREIGN_TIMELINE && window.SOVEREIGN_TIMELINE[key];
    while (host.firstChild) host.removeChild(host.firstChild);
    if (!T || !T.trajectory || !T.trajectory.length) {
      var warn = el("div", null, '[trajectory chart: timeline data for "' + key + '" not found — failing loud, not blank]');
      warn.style.cssText = "padding:24px;font-family:var(--font-mono);font-size:.8rem;color:" + ROSE;
      host.appendChild(warn); return;
    }
    var wrap = el("div", "tjx-wrap"), canvas = el("canvas", "tjx-canvas");
    wrap.appendChild(canvas); host.appendChild(wrap);
    var legend = el("div", "tjx-legend");
    function lg(swcls, label) { var s = el("span"); s.appendChild(el("span", swcls)); s.appendChild(document.createTextNode(label)); return s; }
    legend.appendChild(lg("tjx-swatch", "Actual"));
    legend.appendChild(lg("tjx-swatch proj", "Projected"));
    legend.appendChild(el("span", null, "● hover or click a marker — inflection points"));
    host.appendChild(legend);
    /* Always-visible honesty caption: surfaces the "announced, not disbursed"
       caveat the persona-audit flagged as hidden in a collapsed <details>.
       Wording is pulled verbatim from the timeline JSON's authored
       methodology_caption (fall back to the long axis.y prose) — never
       invented here. `*emphasis*` markers are rendered as <em> via safe DOM
       node construction (no innerHTML with data). */
    var capTxt = (typeof T.methodology_caption === "string" && T.methodology_caption.trim())
                 ? T.methodology_caption.trim()
                 : (T.axis && typeof T.axis.y === "string" ? T.axis.y.trim() : "");
    if (capTxt) {
      var cap = el("p", "tjx-caption"); cap.setAttribute("role", "note");
      capTxt.split(/(\*[^*]+\*)/).forEach(function (seg) {
        if (!seg) return;
        if (seg.charAt(0) === "*" && seg.charAt(seg.length - 1) === "*" && seg.length > 2)
          cap.appendChild(el("em", null, seg.slice(1, -1)));
        else cap.appendChild(document.createTextNode(seg));
      });
      host.appendChild(cap);
    }
    /* sources are authored in the section markup (tight, bulleted, Rule #4/#2) — chart renders chart+legend+honesty caption only */

    var traj = T.trajectory.map(function (d) { return { x: parseFloat(d.period), v: +d.value, proj: d.kind === "projected" }; })
                           .sort(function (a, b) { return a.x - b.x; });
    var xs = traj.map(function (d) { return d.x; }), vs = traj.map(function (d) { return d.v; });
    var xmin = Math.min.apply(null, xs), xmax = Math.max.apply(null, xs);
    var DX = xs, DV = vs, DM = monoTangents(DX, DV);   /* shared by curve + markers */
    var GTICKS = 5;
    var nm = niceMax((Math.max.apply(null, vs) * 1.08) || 1, GTICKS);
    var vmax = nm.max, vstep = nm.step;
    /* axis titles: short chart labels (T.axis_label); fall back to legacy T.axis if absent */
    var AX = (T.axis_label && typeof T.axis_label === "object") ? T.axis_label
           : (T.axis && typeof T.axis === "object") ? T.axis : {};
    var yTitle = AX.y || "", xTitle = AX.x || "";
    /* extra gutter so the rotated Y title + X label fit without overlapping ticks */
    var M = { t: 46, r: 26, b: xTitle ? 64 : 46, l: yTitle ? 86 : 64 };

    function draw() {
      var dpr = window.devicePixelRatio || 1, cssW = wrap.clientWidth || 900,
          cssH = Math.min(Math.round(cssW * 0.34), 360);
      canvas.style.width = cssW + "px"; canvas.style.height = cssH + "px";
      canvas.width = cssW * dpr; canvas.height = cssH * dpr;
      var ctx = canvas.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      var X = function (x) { return M.l + (x - xmin) / (xmax - xmin || 1) * (cssW - M.l - M.r); };
      var Y = function (v) { return cssH - M.b - v / vmax * (cssH - M.t - M.b); };
      var MONO = cssVar("--font-mono", "monospace"), DISP = cssVar("--font-display", "system-ui,'Helvetica Neue',Arial,sans-serif");
      /* axis text: 13px / 600 weight in the near-black AXIS colour — clearly
         legible, comfortably above the >=12px floor. */
      var AXFONT = "600 13px " + DISP;
      ctx.font = AXFONT;
      ctx.strokeStyle = LINE; ctx.fillStyle = AXIS; ctx.lineWidth = 1;
      /* gridlines at round vstep increments (0, vstep, 2·vstep … vmax) */
      for (var gv = 0; gv <= vmax + 1e-9; gv += vstep) {
        var gy = Y(gv);
        ctx.beginPath(); ctx.moveTo(M.l, gy); ctx.lineTo(cssW - M.r, gy); ctx.stroke();
        ctx.textAlign = "right"; ctx.fillText(fmtTick(gv), M.l - 8, gy + 3);
      }
      ctx.textAlign = "center";
      var step = Math.ceil(traj.length / 8);
      traj.forEach(function (d, i) { if (i % step === 0 || i === traj.length - 1) ctx.fillText(String(Math.round(d.x)), X(d.x), cssH - M.b + 18); });
      /* axis identification — same near-black AXIS colour, 13px/600, as ticks */
      if (xTitle) {
        ctx.textAlign = "center"; ctx.fillStyle = AXIS; ctx.font = AXFONT;
        ctx.fillText(xTitle, M.l + (cssW - M.l - M.r) / 2, cssH - 6);
      }
      if (yTitle) {
        var axH = cssH - M.t - M.b;          /* rotated text runs along plot height */
        ctx.font = AXFONT;
        var fpx = 13;
        if (ctx.measureText(yTitle).width > axH - 8)        /* shrink-to-fit, floor 12px (never sub-12) */
          fpx = Math.max(12, Math.floor(13 * (axH - 8) / ctx.measureText(yTitle).width));
        ctx.save();
        ctx.translate(16, M.t + axH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = "center"; ctx.fillStyle = AXIS; ctx.font = "600 " + fpx + "px " + DISP;
        ctx.fillText(yTitle, 0, 0);
        ctx.restore();
      }
      var pts = traj.map(function (d) { return { x: X(d.x), y: Y(d.v), proj: d.proj }; });
      var si = pts.findIndex(function (p) { return p.proj; }); if (si < 0) si = pts.length;
      var actual = pts.slice(0, Math.min(si + 1, pts.length)), proj = pts.slice(Math.max(si - 1, 0));
      if (actual.length > 1) {
        var grd = ctx.createLinearGradient(0, M.t, 0, cssH - M.b);
        grd.addColorStop(0, "rgba(13,148,136,.16)"); grd.addColorStop(1, "rgba(13,148,136,0)");
        ctx.beginPath(); smooth(ctx, actual);
        ctx.lineTo(actual[actual.length - 1].x, cssH - M.b); ctx.lineTo(actual[0].x, cssH - M.b);
        ctx.closePath(); ctx.fillStyle = grd; ctx.fill();
      }
      ctx.lineWidth = 3; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.setLineDash([]); ctx.strokeStyle = TEAL; smooth(ctx, actual); ctx.stroke();
      if (proj.length > 1) { ctx.beginPath(); ctx.setLineDash([7, 6]); ctx.strokeStyle = AMBER; smooth(ctx, proj); ctx.stroke(); ctx.setLineDash([]); }
      wrap.querySelectorAll(".tjx-marker").forEach(function (n) { n.remove(); });
      /* marker diameter is responsive (26px desktop / 22px mobile). Read it once
         so the de-collision separation matches the actual rendered size. */
      var DIAM = (cssW <= 640) ? 22 : 26;
      var SEP = DIAM + 5;                       /* min centre-to-centre gap > diameter */
      var padX = M.l + DIAM / 2 + 2, maxX = cssW - M.r - DIAM / 2 - 2;
      var padY = M.t + DIAM / 2 + 2, maxYc = cssH - M.b - DIAM / 2 - 2;
      var mk = [];
      (T.inflection_markers || []).forEach(function (m) {
        var xf = yearFrac(m.date); if (isNaN(xf)) return;
        var xfC = Math.max(xmin, Math.min(xmax, xf));
        /* ax/ay = the EXACT point on the rendered monotone curve this marker
           annotates. The marker badge floats just above it, and a thin
           connector stem (drawn after de-collision) ties badge → curve so the
           reader can trace marker → data point and read its value off Y. */
        var ax = X(xfC), ay = Y(hermite(DX, DV, DM, xfC));
        var cx = Math.max(padX, Math.min(maxX, ax));
        var cy = Math.max(padY, Math.min(maxYc, ay - (DIAM / 2 + 11)));
        mk.push({ m: m, cx: cx, cy: cy, x0: cx, ax: ax, ay: ay });
      });
      /* De-collision: any two markers whose centres are closer than SEP get
         pushed apart. We resolve mostly along Y (vertical stagger/fan) so the
         number still reads near its true x, falling back to an X nudge when a
         pair shares almost the same x. Iterate to settle the whole cluster,
         re-clamping to the plot box each pass so none clip the edges. */
      var pass, i, j, a, b, it;
      for (pass = 0; pass < 60; pass++) {
        var moved = false;
        for (i = 0; i < mk.length; i++) for (j = i + 1; j < mk.length; j++) {
          a = mk[i]; b = mk[j];
          var dx = b.cx - a.cx, dy = b.cy - a.cy;
          var dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          if (dist >= SEP) continue;
          moved = true;
          var overlap = (SEP - dist) / 2;
          if (Math.abs(dx) < 6) {                /* near-identical x → fan vertically */
            a.cy -= overlap + 0.5; b.cy += overlap + 0.5;
          } else {                               /* push along the separating axis */
            var ux = dx / dist, uy = dy / dist;
            a.cx -= ux * overlap; a.cy -= uy * overlap;
            b.cx += ux * overlap; b.cy += uy * overlap;
          }
          a.cx = Math.max(padX, Math.min(maxX, a.cx));
          a.cy = Math.max(padY, Math.min(maxYc, a.cy));
          b.cx = Math.max(padX, Math.min(maxX, b.cx));
          b.cy = Math.max(padY, Math.min(maxYc, b.cy));
        }
        if (!moved) break;
      }
      /* Connector stems + on-curve anchor dots: now that de-collision has
         settled every badge centre, draw a thin leader from each badge edge to
         the exact (ax,ay) point on the line, plus a small filled dot seated on
         the curve. This makes every marker value-readable (trace stem down to
         the curve, read across to the Y axis) instead of floating free. */
      mk.forEach(function (p) {
        var col = SIDE[p.m.side] || TEAL;
        var vx = p.ax - p.cx, vy = p.ay - p.cy, vl = Math.sqrt(vx * vx + vy * vy) || 1;
        /* start the stem at the badge edge, not its centre, so it reads as a
           leader rather than crossing through the number */
        var sx = p.cx + vx / vl * (DIAM / 2), sy = p.cy + vy / vl * (DIAM / 2);
        ctx.save();
        ctx.beginPath(); ctx.setLineDash([]);
        ctx.moveTo(sx, sy); ctx.lineTo(p.ax, p.ay);
        ctx.lineWidth = 1.5; ctx.strokeStyle = col; ctx.globalAlpha = 0.55; ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(p.ax, p.ay, 3.5, 0, 2 * Math.PI);
        ctx.fillStyle = col; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = "#fff"; ctx.stroke();
        ctx.restore();
      });
      mk.forEach(function (p) {
        var btn = el("button", "tjx-marker", String(p.m.n)); btn.type = "button";
        btn.style.left = p.cx + "px"; btn.style.top = p.cy + "px";
        btn.style.background = SIDE[p.m.side] || TEAL;
        btn.setAttribute("aria-label", p.m.title);
        btn.setAttribute("title", p.m.title);
        /* hover signposting: tooltip is the discoverable title (revealed on
           hover, not only on click) + CSS hover ring/scale on .tjx-marker */
        btn.appendChild(el("span", "tjx-mtip", p.m.title));
        btn.addEventListener("click", (function (mm) { return function () { openModal(mm); }; })(p.m));
        btn.addEventListener("keydown", (function (mm) { return function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal(mm); }
        }; })(p.m));
        wrap.appendChild(btn);
      });
    }
    draw();
    var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(draw, 150); });
    /* methodology caption + sources rendered by the section markup, not the chart module */
  }
  function init() {
    document.querySelectorAll("[data-graph]").forEach(function (host) {
      try { render(host); } catch (e) {
        while (host.firstChild) host.removeChild(host.firstChild);
        var d = el("div", null, "[chart error: " + (e && e.message) + "]");
        d.style.cssText = "padding:20px;color:#e11d48;font-family:monospace;font-size:.78rem";
        host.appendChild(d);
      }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
