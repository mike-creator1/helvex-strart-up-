/* ═══════════════════════════════════════════════════════════════════
   HelveX OS · shared shell
   Renders the left icon rail (desktop) + bottom tab bar (mobile),
   wires the theme (dark by default), command palette, and active state.
   Each page sets <body data-section="chat|projects|agents|knowledge|
   deploy|settings"> and (optionally) data-no-panel.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* Theme bootstrap — DARK FIRST. Honour a stored preference, else dark. */
  try {
    var t = localStorage.getItem('hxos.theme') || 'dark';
    if (t === 'system') t = (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) { document.documentElement.setAttribute('data-theme', 'dark'); }

  var ICONS = {
    chat:      '<path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9.5 9.5 0 0 1-4-.9L3 20l1.9-5a8.38 8.38 0 0 1-.9-3.5A8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z"/>',
    projects:  '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
    agents:    '<circle cx="12" cy="8" r="4"/><path d="M5.5 21a7 7 0 0 1 13 0"/><path d="M12 2v1.5M16.5 5.5l-1 1M19 12h-1.5"/>',
    knowledge: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5H6.5A2.5 2.5 0 0 0 4 21z"/><path d="M4 5.5A2.5 2.5 0 0 0 6.5 8H20"/>',
    deploy:    '<path d="M12 2.5l8 4.5v9L12 20.5 4 16V7z"/><path d="M4 7l8 4.5 8-4.5M12 11.5V20.5"/>',
    settings:  '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.05.05a2 2 0 1 1-2.83 2.83l-.05-.05a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.56 1.7 1.7 0 0 0-1.87.34l-.05.05a2 2 0 1 1-2.83-2.83l.05-.05a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.87l-.05-.05A2 2 0 1 1 7.04 3.75l.05.05a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.56V2a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05a1.7 1.7 0 0 0-.34 1.87V8.5a1.7 1.7 0 0 0 1.56 1H22a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"/>',
    search:    '<circle cx="11" cy="11" r="7.5"/><line x1="21" y1="21" x2="16.8" y2="16.8"/>',
    plus:      '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    menu:      '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>'
  };

  /* Primary navigation — the entire IA. Six sections, nothing else.
     Mobile collapses Knowledge into Projects per the mobile spec. */
  var NAV = [
    { id: 'chat',      label: 'Chat',      href: 'index.html',     mobile: true },
    { id: 'projects',  label: 'Projects',  href: 'projects.html',  mobile: true },
    { id: 'agents',    label: 'Agents',    href: 'agents.html',    mobile: true },
    { id: 'knowledge', label: 'Knowledge', href: 'knowledge.html', mobile: false },
    { id: 'deploy',    label: 'Deploy',    href: 'deploy.html',    mobile: true },
    { id: 'settings',  label: 'Settings',  href: 'settings.html',  mobile: true }
  ];

  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>';
  }

  var active = document.body.getAttribute('data-section') || 'chat';

  /* ---- Left rail (desktop) ---- */
  function renderRail() {
    var h = '';
    h += '<a class="os-rail-brand" href="index.html" title="HelveX"><img src="../helvex-logo.png" alt="HelveX"></a>';
    NAV.forEach(function (n) {
      h += '<a class="os-navlink" href="' + n.href + '" data-label="' + n.label + '"' +
           (n.id === active ? ' aria-current="page"' : '') + '>' + icon(n.id) + '</a>';
    });
    h += '<div class="os-rail-spacer"></div>';
    h += '<button class="os-rail-avatar" id="os-avatar" title="Account">A</button>';
    var el = document.createElement('nav');
    el.className = 'os-rail';
    el.innerHTML = h;
    return el;
  }

  /* ---- Bottom nav (mobile) ---- */
  function renderBottomNav() {
    var h = '';
    NAV.filter(function (n) { return n.mobile; }).forEach(function (n) {
      h += '<a class="os-tab" href="' + n.href + '"' + (n.id === active ? ' aria-current="page"' : '') + '>' +
           icon(n.id) + '<span>' + n.label + '</span></a>';
    });
    var el = document.createElement('nav');
    el.className = 'os-bottomnav';
    el.innerHTML = h;
    return el;
  }

  function mount() {
    var app = document.querySelector('.os-app');
    if (!app) return;
    app.insertBefore(renderRail(), app.firstChild);
    document.body.appendChild(renderBottomNav());
    requestAnimationFrame(function () { app.classList.add('ready'); });

    /* Mobile: a hamburger in any .os-topbar opens the contextual panel drawer */
    document.querySelectorAll('[data-panel-toggle]').forEach(function (b) {
      b.addEventListener('click', function () { app.classList.toggle('panel-open'); });
    });
    document.addEventListener('click', function (e) {
      if (app.classList.contains('panel-open') && !e.target.closest('.os-panel') && !e.target.closest('[data-panel-toggle]')) {
        app.classList.remove('panel-open');
      }
    });

    /* Command palette (⌘K / Ctrl+K) */
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
      if (e.key === 'Escape') closePalette();
    });
    var avatar = document.getElementById('os-avatar');
    if (avatar) avatar.addEventListener('click', function () { window.location.href = 'settings.html'; });
  }

  /* ---- Command palette ---- */
  function openPalette() {
    if (document.getElementById('os-palette')) return;
    var wrap = document.createElement('div');
    wrap.id = 'os-palette';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:200;display:flex;align-items:flex-start;justify-content:center;padding-top:14vh;background:rgba(0,0,0,.55);backdrop-filter:blur(3px)';
    var rows = NAV.map(function (n) {
      return '<a href="' + n.href + '" class="osp-row"><span class="osp-ic">' + icon(n.id) + '</span>Go to ' + n.label + '</a>';
    }).join('') +
      '<a href="index.html?new=1" class="osp-row"><span class="osp-ic">' + icon('plus') + '</span>New chat</a>';
    wrap.innerHTML =
      '<div style="width:min(560px,92vw);background:var(--surface-1);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--shadow-lg);overflow:hidden">' +
      '<div style="display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line-soft)">' +
      '<span style="color:var(--text-dim)">' + icon('search') + '</span>' +
      '<input class="field" id="osp-input" placeholder="Search or jump to…" style="border:none;background:none;height:auto;padding:0;box-shadow:none" autofocus></div>' +
      '<div id="osp-list" style="max-height:50vh;overflow:auto;padding:8px">' + rows + '</div></div>';
    document.body.appendChild(wrap);
    var style = document.getElementById('osp-style');
    if (!style) {
      style = document.createElement('style'); style.id = 'osp-style';
      style.textContent = '.osp-row{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:var(--r-sm);color:var(--text);font-size:13.5px}.osp-row:hover{background:var(--surface-2)}.osp-ic{color:var(--text-dim);display:grid;place-items:center}.osp-ic svg{width:17px;height:17px}';
      document.head.appendChild(style);
    }
    wrap.addEventListener('click', function (e) { if (e.target === wrap) closePalette(); });
    var input = document.getElementById('osp-input');
    input.addEventListener('input', function () {
      var q = input.value.toLowerCase();
      document.querySelectorAll('#osp-list .osp-row').forEach(function (r) {
        r.style.display = r.textContent.toLowerCase().indexOf(q) > -1 ? '' : 'none';
      });
    });
  }
  function closePalette() { var p = document.getElementById('os-palette'); if (p) p.remove(); }

  /* expose minimal helpers for pages */
  window.OS = { icon: icon, openPalette: openPalette };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
