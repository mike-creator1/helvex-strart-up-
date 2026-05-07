/*! CreateX custom dark dropdown — replaces native <select.ctrl-sel> with a
    HelveX-style menu. Keeps original <select> for value & change events. */
(function () {
  var CSS = ''
    + '.cx-dd{position:relative;display:inline-block}'
    + '.cx-dd > select{display:none !important}'
    + '.cx-dd-btn{cursor:pointer;text-align:left;min-width:160px;font-family:Inter,sans-serif;display:inline-flex;align-items:center;justify-content:space-between;gap:8px;background-image:none !important;padding-right:14px !important}'
    + '.cx-dd-btn::after{content:"";width:7px;height:7px;border-right:1.5px solid rgba(255,255,255,.45);border-bottom:1.5px solid rgba(255,255,255,.45);transform:rotate(45deg) translateY(-2px);margin-left:2px;flex-shrink:0;transition:transform .18s}'
    + '.cx-dd.open .cx-dd-btn::after{transform:rotate(-135deg) translateY(0)}'
    + '.cx-dd-menu{position:absolute;bottom:calc(100% + 8px);left:0;min-width:240px;background:#0c0e15;border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:5px;box-shadow:0 -10px 44px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.04);display:none;z-index:9999;animation:cxDdIn .14s ease}'
    + '@keyframes cxDdIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}'
    + '.cx-dd-menu.open{display:block}'
    + '.cx-dd-head{font-size:9.5px;font-weight:900;letter-spacing:.12em;color:rgba(255,255,255,.34);text-transform:uppercase;padding:8px 12px 6px;font-family:Inter,sans-serif}'
    + '.cx-dd-item{display:flex;justify-content:space-between;align-items:center;width:100%;padding:9px 12px;border:none;background:none;color:rgba(255,255,255,.78);font:700 12.5px/1.3 Inter,sans-serif;cursor:pointer;text-align:left;border-radius:8px;gap:18px;transition:background .12s,color .12s}'
    + '.cx-dd-item:hover{background:rgba(255,255,255,.06);color:#fff}'
    + '.cx-dd-item.active{background:rgba(24,215,255,.1);color:#65efff}'
    + '.cx-dd-item .sub{font-size:11px;color:rgba(255,255,255,.38);font-weight:600;flex-shrink:0}'
    + '.cx-dd-item.active .sub{color:rgba(101,239,255,.65)}'
    + '.cx-dd-item .check{width:13px;height:13px;flex-shrink:0;color:#65efff;opacity:0}'
    + '.cx-dd-item.active .check{opacity:1}';

  function buildOne(sel) {
    if (sel.dataset.cx) return;
    sel.dataset.cx = '1';
    var label = sel.getAttribute('data-label') || '';
    var wrap = document.createElement('div');
    wrap.className = 'cx-dd';
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = sel.className + ' cx-dd-btn';
    var labelSpan = document.createElement('span');
    labelSpan.className = 'cx-dd-btn-label';
    labelSpan.textContent = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : '';
    btn.appendChild(labelSpan);
    wrap.appendChild(btn);

    var menu = document.createElement('div');
    menu.className = 'cx-dd-menu';
    if (label) {
      var h = document.createElement('div');
      h.className = 'cx-dd-head';
      h.textContent = label;
      menu.appendChild(h);
    }

    Array.prototype.forEach.call(sel.options, function (o) {
      var it = document.createElement('button');
      it.type = 'button';
      it.className = 'cx-dd-item' + (o.selected ? ' active' : '');
      var parts = o.text.split(' · ');
      var left = '<span class="lbl">' + parts[0] + '</span>';
      var right = parts[1] ? '<span class="sub">' + parts[1] + '</span>' : '<svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>';
      it.innerHTML = left + right;
      it.addEventListener('click', function (e) {
        e.stopPropagation();
        sel.value = o.value;
        labelSpan.textContent = o.text;
        menu.querySelectorAll('.cx-dd-item').forEach(function (x) { x.classList.remove('active'); });
        it.classList.add('active');
        wrap.classList.remove('open');
        menu.classList.remove('open');
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      });
      menu.appendChild(it);
    });
    wrap.appendChild(menu);

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = !menu.classList.contains('open');
      document.querySelectorAll('.cx-dd-menu.open').forEach(function (x) { x.classList.remove('open'); x.parentNode.classList.remove('open'); });
      if (willOpen) { menu.classList.add('open'); wrap.classList.add('open'); }
    });
  }

  function init() {
    var s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
    document.querySelectorAll('select.ctrl-sel').forEach(buildOne);
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.cx-dd')) {
        document.querySelectorAll('.cx-dd-menu.open').forEach(function (x) { x.classList.remove('open'); x.parentNode.classList.remove('open'); });
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.cx-dd-menu.open').forEach(function (x) { x.classList.remove('open'); x.parentNode.classList.remove('open'); });
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
