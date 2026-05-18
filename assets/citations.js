/* =============================================================================
   COMPACT CITATION SYSTEM — Sovereign AI Thesis
   For every <section>, walk its <a class="ds-src" href="…">verbose label</a>
   anchors, dedupe by href, replace the inline visible text with a numbered
   superscript chip, and append ONE collapsed click-to-expand
   <details class="ds-details ds-cites-details"> at the END of the section
   (the site's canonical collapsible). No marginalia rail; no reserved space;
   full width stays with the matrices/charts. Sources are out of the way until
   the reader chooses to expand them — every source stays clickable.

   Idempotent: re-running won't double-transform.
   Non-destructive: preserves the original label in a hidden span (a11y).
   Pipeline-safe: assemble.py emits ds-src anchors with hrefs; this runs once
   on DOMContentLoaded and again on hashchange.
============================================================================= */
(function(){
  'use strict';

  function domain(href){
    try{ return new URL(href).hostname.replace(/^www\./,''); }
    catch(_){ return ''; }
  }

  function compactLabel(text, href){
    var t = (text||'').trim().replace(/\s+/g,' ');
    if (!t) return domain(href);
    t = t.replace(/[.,;:]\s*$/,'');
    if (t.length > 140) t = t.slice(0,138) + '…';
    return t;
  }

  function transformSection(section){
    if (section.dataset.citesTransformed === '1') return;

    var anchors = section.querySelectorAll('a.ds-src');
    if (!anchors.length) return;

    var map = new Map();   // href -> {num, label, dom, anchors:[…]}
    var order = [];

    anchors.forEach(function(a){
      var href = a.getAttribute('href') || '';
      if (!href) return;
      var rec = map.get(href);
      if (!rec){
        rec = { num: order.length+1,
                label: compactLabel(a.textContent, href),
                dom: domain(href),
                anchors: [] };
        map.set(href, rec);
        order.push(href);
      }
      rec.anchors.push(a);
    });

    if (!order.length) return;

    // Transform each anchor → small numeric chip; keep label hidden for a11y.
    order.forEach(function(href){
      var rec = map.get(href);
      rec.anchors.forEach(function(a){
        if (!a.querySelector('.ds-src-label')){
          var span = document.createElement('span');
          span.className = 'ds-src-label';
          while (a.firstChild) span.appendChild(a.firstChild);
          a.appendChild(span);
        }
        a.setAttribute('data-cite-num', rec.num);
        a.setAttribute('data-cite-label', rec.label + (rec.dom ? ' · ' + rec.dom : ''));
        a.setAttribute('aria-describedby', section.id + '-cite-' + rec.num);
        a.setAttribute('rel', 'noopener');
        a.setAttribute('target', '_blank');
      });
    });

    // ONE collapsed, click-to-expand sources block at the section's end.
    var det = document.createElement('details');
    det.className = 'ds-details ds-cites-details';

    var sum = document.createElement('summary');
    sum.textContent = 'Sources · this section (' + order.length + ')';
    det.appendChild(sum);

    var ol = document.createElement('ol');
    ol.className = 'ds-cites';
    order.forEach(function(href){
      var rec = map.get(href);
      var li = document.createElement('li');
      li.id = section.id + '-cite-' + rec.num;
      var num = document.createElement('span');
      num.className = 'n';
      num.textContent = rec.num;
      var body = document.createElement('span');
      var link = document.createElement('a');
      link.setAttribute('href', href);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener');
      link.textContent = rec.label;
      body.appendChild(link);
      if (rec.dom){
        var dm = document.createElement('span');
        dm.className = 'dom';
        dm.textContent = rec.dom;
        body.appendChild(dm);
      }
      li.appendChild(num);
      li.appendChild(body);
      ol.appendChild(li);
    });
    det.appendChild(ol);

    var host = section.querySelector('.ds-section') || section;
    host.appendChild(det);

    section.dataset.citesTransformed = '1';
  }

  function transformAll(){
    document.querySelectorAll('body > section').forEach(transformSection);
    document.querySelectorAll('[data-cite-section]').forEach(transformSection);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', transformAll);
  } else {
    transformAll();
  }
})();
