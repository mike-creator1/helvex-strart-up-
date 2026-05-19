/* ═══════════════════════════════════════════════════════════
   HelveX · Client Portal · shared sidebar + top-bar injector
   Each platform page sets <body data-active="dashboard"> to
   highlight the current item and render the right breadcrumb.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // Theme + language bootstrap — applied before paint so there's no flash.
  // Settings page persists to user_settings *and* localStorage; this reads
  // localStorage so every platform page picks up the user's preference.
  (function applyStoredTheme() {
    try {
      var theme = localStorage.getItem('hx.theme') || 'system';
      var resolved = theme;
      if (theme === 'system') {
        resolved = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      document.documentElement.setAttribute('data-theme', resolved);
      document.documentElement.style.colorScheme = resolved;
    } catch (e) {}
    try {
      var lang = localStorage.getItem('hx.language');
      if (lang) document.documentElement.setAttribute('lang', lang);
    } catch (e) {}
  })();

  // ── Sidebar nav, post-audit ─────────────────────────────────────────
  // Audit-driven rebuild: 28 items → 19 items. Cuts:
  //   • Models, Business Assistant, Monitoring, Pricing → DEAD/duplicate
  //   • Credits/Subscriptions/Invoices/Billing → one /billing surface
  //   • Profile → folded into Settings
  // Every remaining item earns its slot (returned-to-weekly use-case).
  var NAV_GROUPS = [
    {
      label: 'Workspace',
      items: [
        { id: 'dashboard',  href: '/dashboard.html',  label: 'Overview',   icon: 'home' },
        { id: 'chat',       href: '/chat.html',       label: 'Chat',       icon: 'chat' },
        { id: 'workbench',  href: '/workbench.html',  label: 'Workbench',  icon: 'workbench' },
        { id: 'memory',     href: '/memory.html',     label: 'Memory',     icon: 'memory' },
        { id: 'projects',   href: '/projects.html',   label: 'Projects',   icon: 'folder' },
        { id: 'services',   href: '/services.html',   label: 'Services',   icon: 'grid' },
        { id: 'consulting', href: '/consulting.html', label: 'Consulting', icon: 'briefcase' }
      ]
    },
    {
      label: 'Toolkit',
      items: [
        // Removed: Business Assistant (duplicate of Chat with a persona dropdown).
        { id: 'app-crm',         href: '/app-crm',         label: 'CRM',             icon: 'contacts' },
        { id: 'app-marketing',   href: '/app-marketing',   label: 'Marketing Tools', icon: 'megaphone' },
        { id: 'app-automation',  href: '/app-automation',  label: 'Automation',      icon: 'flow' }
      ]
    },
    {
      label: 'Build',
      items: [
        // Removed: Models (vanity catalog; chat already picks model).
        { id: 'workflows',   href: '/workflows.html',   label: 'Workflows',   icon: 'zap' },
        { id: 'deployments', href: '/deployments.html', label: 'Deployments', icon: 'cloud' }
      ]
    },
    {
      label: 'Observability',
      items: [
        // Removed: Monitoring (re-derived from deployments + usage_events —
        // same data, no new view).
        { id: 'activity',   href: '/activity.html',   label: 'Activity',   icon: 'pulse' },
        { id: 'usage',      href: '/usage.html',      label: 'Usage',      icon: 'chart' },
        { id: 'logs',       href: '/logs.html',       label: 'Logs',       icon: 'terminal' }
      ]
    },
    {
      label: 'Developer',
      items: [
        { id: 'api-keys',     href: '/api-keys.html',     label: 'API Keys',     icon: 'key' },
        { id: 'integrations', href: '/integrations.html', label: 'Integrations', icon: 'plug' },
        { id: 'domains',      href: '/domains.html',      label: 'Domains',      icon: 'globe' }
      ]
    },
    {
      label: 'Billing',
      items: [
        // Merged: 5 sidebar items → one /billing surface with tabs
        // (Plan · Credits · Invoices · Payment). Pricing dropped —
        // belongs on the marketing site, not the workspace.
        { id: 'billing', href: '/billing.html', label: 'Billing & Plan', icon: 'card' }
      ]
    },
    {
      label: 'Account',
      items: [
        // Profile merged into Settings (was 5 fields the user touched
        // once at signup and never again).
        { id: 'team',     href: '/team.html',     label: 'Team',     icon: 'users'  },
        { id: 'security', href: '/security.html', label: 'Security', icon: 'shield' },
        { id: 'settings', href: '/settings.html', label: 'Settings', icon: 'cog'    },
        { id: 'support',  href: '/support.html',  label: 'Support',  icon: 'help'   }
      ]
    }
  ];

  var ICONS = {
    home:     '<path d="M3 12l9-9 9 9M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"/>',
    chat:     '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    folder:   '<path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    workbench:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 17.9V21h3.1l6.2-6.2a4 4 0 0 0 5.4-5.4l-3 3-1.4-1.4 3-3z"/>',
    memory:   '<path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0-3 3v1a3 3 0 0 0-1 5.83V18a3 3 0 0 0 3 3h1.5a2.5 2.5 0 0 0 5 0H16a3 3 0 0 0 3-3v-2.17A3 3 0 0 0 18 10V9a3 3 0 0 0-3-3V5a3 3 0 0 0-3-3z"/><path d="M12 7v10"/>',
    grid:     '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    briefcase:'<rect x="2.5" y="7.5" width="19" height="13" rx="2"/><path d="M16 21V5.5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2V21"/><line x1="2.5" y1="13" x2="21.5" y2="13"/>',
    cpu:      '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>',
    zap:      '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    cloud:    '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
    pulse:    '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    chart:    '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="3" y1="20" x2="21" y2="20"/>',
    terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
    heart:    '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    key:      '<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
    plug:     '<path d="M9 2v4M15 2v4M5.25 6h13.5l-1.41 14.22A2 2 0 0 1 15.35 22h-6.7a2 2 0 0 1-1.99-1.78L5.25 6z"/>',
    globe:    '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    coin:     '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 9.5h4a1.5 1.5 0 0 1 0 3h-2a1.5 1.5 0 0 0 0 3h4"/>',
    tag:      '<path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5"/>',
    refresh:  '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
    doc:      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>',
    card:     '<rect x="2" y="6" width="20" height="14" rx="2"/><line x1="2" y1="11" x2="22" y2="11"/><line x1="6" y1="16" x2="10" y2="16"/>',
    user:     '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users:    '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    shield:   '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    cog:      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    help:     '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    logout:   '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    chev:     '<polyline points="6 9 12 15 18 9"/>',
    search:   '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    contacts: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    megaphone:'<path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    flow:     '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 6h7M6 8.5v7M18 8.5v7M8.5 18h7"/>',
    sparkle:  '<path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z"/><path d="M19 17l.6 2 2 .6-2 .6L19 22l-.6-1.8-2-.6 2-.6z"/>'
  };

  function svg(name, opts) {
    var stroke = (opts && opts.stroke) || 'currentColor';
    var sw = (opts && opts.sw) || 1.7;
    return '<svg viewBox="0 0 24 24" fill="none" stroke="' + stroke + '" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }

  function findActive(activeId) {
    for (var g = 0; g < NAV_GROUPS.length; g++) {
      var grp = NAV_GROUPS[g];
      for (var i = 0; i < grp.items.length; i++) {
        if (grp.items[i].id === activeId) return grp.items[i];
      }
    }
    return null;
  }

  function buildSidebar(activeId) {
    var html = '';
    html += '<a href="/dashboard.html" class="hx-sidebar-brand" aria-label="HelveX dashboard">';
    html +=   '<img src="/helvex-logo.png" alt="HelveX" />';
    html += '</a>';

    // Workspace pill — clickable, opens a Vercel-style dropdown with
    // workspace switcher + account actions (settings, billing, sign-out).
    html += '<div class="hx-workspace-wrap">';
    html +=   '<button type="button" class="hx-workspace" id="hx-workspace-btn" title="Open workspace menu" aria-haspopup="true" aria-expanded="false">';
    html +=     '<span class="hx-workspace-avatar" id="hx-workspace-avatar">·</span>';
    html +=     '<span class="hx-workspace-info">';
    html +=       '<span class="hx-workspace-name" id="hx-workspace-name">Loading…</span>';
    html +=       '<span class="hx-workspace-plan" id="hx-workspace-plan">Free</span>';
    html +=     '</span>';
    html +=     '<svg class="hx-workspace-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="8 9 12 5 16 9"/><polyline points="8 15 12 19 16 15"/></svg>';
    html +=   '</button>';
    // The menu itself — hidden until the pill is clicked.
    html +=   '<div class="hx-workspace-menu" id="hx-workspace-menu" role="menu" aria-label="Workspace menu">';
    html +=     '<div class="hx-workspace-menu-head">';
    html +=       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" style="color:var(--hx-text-dim);"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
    html +=       '<input type="text" id="hx-workspace-search" placeholder="Find workspace…" autocomplete="off" />';
    html +=       '<span class="esc">Esc</span>';
    html +=     '</div>';
    html +=     '<div class="hx-workspace-menu-section">Workspace</div>';
    html +=     '<button type="button" class="hx-workspace-menu-item is-current" data-action="current">';
    html +=       '<span class="hx-workspace-avatar" style="width:18px;height:18px;font-size:9px;" id="hx-workspace-menu-avatar">·</span>';
    html +=       '<span id="hx-workspace-menu-name">Loading…</span>';
    html +=       '<svg class="chk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>';
    html +=     '</button>';
    html +=     '<div class="hx-workspace-menu-sep"></div>';
    html +=     '<div class="hx-workspace-menu-section">Account</div>';
    html +=     '<a class="hx-workspace-menu-item" href="/settings.html"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>Settings</a>';
    html +=     '<a class="hx-workspace-menu-item" href="/billing.html"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="14" rx="2"/><line x1="2" y1="11" x2="22" y2="11"/><line x1="6" y1="16" x2="10" y2="16"/></svg>Billing &amp; Plan</a>';
    html +=     '<a class="hx-workspace-menu-item" href="/team.html"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>Team</a>';
    html +=     '<a class="hx-workspace-menu-item" href="/api-keys.html"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>API Keys</a>';
    html +=     '<div class="hx-workspace-menu-sep"></div>';
    html +=     '<button type="button" class="hx-workspace-menu-item" data-action="theme"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>Toggle theme</button>';
    html +=     '<a class="hx-workspace-menu-item" href="/support.html"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Help &amp; support</a>';
    html +=     '<div class="hx-workspace-menu-sep"></div>';
    html +=     '<button type="button" class="hx-workspace-menu-item is-danger" data-action="signout"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>Sign out</button>';
    html +=   '</div>';
    html += '</div>';

    html += '<button type="button" class="hx-sidebar-find" id="hx-sidebar-find" aria-label="Search">';
    html +=   svg('search', { sw: 1.8 });
    html +=   '<span class="hx-sidebar-find-text">Find…</span>';
    html +=   '<span class="hx-sidebar-find-kbd">⌘K</span>';
    html += '</button>';

    NAV_GROUPS.forEach(function (group) {
      html += '<div class="hx-nav-section">';
      html +=   '<div class="hx-nav-label">' + group.label + '</div>';
      group.items.forEach(function (item) {
        var activeClass = (item.id === activeId) ? ' active' : '';
        var badge = item.badge ? '<span class="hx-nav-badge">' + item.badge + '</span>' : '';
        html += '<a href="' + item.href + '" class="hx-nav-item' + activeClass + '">' + svg(item.icon) + '<span>' + item.label + '</span>' + badge + '</a>';
      });
      html += '</div>';
    });

    html += '<div class="hx-sidebar-foot">';
    html +=   '<div class="hx-user-card" id="hx-user-card" title="Account">';
    html +=     '<div class="hx-user-avatar" id="hx-user-avatar">·</div>';
    html +=     '<div class="hx-user-meta">';
    html +=       '<div class="hx-user-name" id="hx-user-name">Loading…</div>';
    html +=       '<div class="hx-user-email" id="hx-user-email">&nbsp;</div>';
    html +=     '</div>';
    html +=     '<button type="button" class="hx-user-action" title="Sign out" data-action="signout" aria-label="Sign out">' + svg('logout') + '</button>';
    html +=   '</div>';
    html += '</div>';
    return html;
  }

  function buildTopbar(activeItem) {
    var pageLabel = activeItem ? activeItem.label : 'Platform';
    var html = '';
    html += '<button type="button" class="hx-menu-toggle" aria-label="Open menu" id="hx-menu-toggle">';
    html +=   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>';
    html += '</button>';
    html += '<nav class="hx-breadcrumb" aria-label="Breadcrumb">';
    html +=   '<a href="/dashboard.html" id="hx-crumb-workspace">Workspace</a>';
    html +=   '<span class="crumb-sep">/</span>';
    html +=   '<span class="crumb-current">' + pageLabel + '</span>';
    html += '</nav>';
    html += '<label class="hx-cmdk" id="hx-cmdk-wrap" aria-label="Search">';
    html +=   svg('search', { sw: 1.8 });
    html +=   '<input id="hx-cmdk" class="hx-cmdk-input" type="text" placeholder="Search…" autocomplete="off" spellcheck="false" />';
    html +=   '<span class="hx-cmdk-kbd">⌘K</span>';
    html += '</label>';
    return html;
  }

  function loadAuthScript() {
    if (window.HX && window.HX.supabase) return;
    if (document.querySelector('script[data-hx-auth]')) return;
    var s = document.createElement('script');
    s.src = '/auth.js';
    s.setAttribute('data-hx-auth', '1');
    document.head.appendChild(s);
  }

  function initials(first, last, email) {
    var a = (first || '').trim();
    var b = (last || '').trim();
    if (a || b) return ((a[0] || '') + (b[0] || '')).toUpperCase();
    var e = (email || '').trim();
    return e ? e[0].toUpperCase() : '·';
  }

  function hydrateUser() {
    var sb = window.HX && window.HX.supabase;
    if (!sb) return;
    sb.auth.getUser().then(function (res) {
      var user = res && res.data ? res.data.user : null;
      if (!user) return;
      var meta = user.user_metadata || {};
      var nameEl = document.getElementById('hx-user-name');
      var mailEl = document.getElementById('hx-user-email');
      var avEl   = document.getElementById('hx-user-avatar');
      var fullName = (meta.first_name || '').trim() + ' ' + (meta.last_name || '').trim();
      fullName = fullName.trim() || (user.email ? user.email.split('@')[0] : 'Account');
      if (nameEl) nameEl.textContent = fullName;
      if (mailEl) mailEl.textContent = user.email || '';
      if (avEl)   avEl.textContent   = initials(meta.first_name, meta.last_name, user.email);

      var wsName = (meta.company || '').trim();
      if (!wsName && user.email) {
        var domain = user.email.split('@')[1] || '';
        wsName = domain ? domain.split('.')[0].replace(/^./, function (c) { return c.toUpperCase(); }) : 'Workspace';
      }
      var wsNameEl = document.getElementById('hx-workspace-name');
      var wsAvEl   = document.getElementById('hx-workspace-avatar');
      var wsMenuNameEl = document.getElementById('hx-workspace-menu-name');
      var wsMenuAvEl   = document.getElementById('hx-workspace-menu-avatar');
      var label = wsName || 'Personal';
      var initial = label.slice(0, 1).toUpperCase();
      if (wsNameEl)     wsNameEl.textContent     = label;
      if (wsAvEl)       wsAvEl.textContent       = initial;
      if (wsMenuNameEl) wsMenuNameEl.textContent = label;
      if (wsMenuAvEl)   wsMenuAvEl.textContent   = initial;
    });
  }

  /* ─── Workspace dropdown — clicks open the Vercel-style menu, Esc
         and outside-clicks close it, and the menu's data-action items
         drive theme toggle + sign-out without duplicating logic. ─── */
  function wireWorkspaceMenu() {
    var btn  = document.getElementById('hx-workspace-btn');
    var menu = document.getElementById('hx-workspace-menu');
    var input = document.getElementById('hx-workspace-search');
    if (!btn || !menu) return;

    function open() {
      menu.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      // Defer focus so the input grabs caret after the show.
      setTimeout(function () { if (input) input.focus(); }, 30);
    }
    function close() {
      menu.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      if (input) input.value = '';
    }
    function toggle() { menu.classList.contains('open') ? close() : open(); }

    btn.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
    document.addEventListener('click', function (e) {
      if (!menu.classList.contains('open')) return;
      if (e.target.closest('#hx-workspace-menu')) return;
      close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('open')) close();
    });

    // Action wiring for the data-action menu items.
    menu.addEventListener('click', function (e) {
      var item = e.target.closest('[data-action]');
      if (!item) return;
      var action = item.getAttribute('data-action');
      if (action === 'current') { close(); return; } // already on this workspace
      if (action === 'theme') {
        try {
          var current = localStorage.getItem('hx.theme') || 'system';
          var next = current === 'dark' ? 'light' : (current === 'light' ? 'system' : 'dark');
          localStorage.setItem('hx.theme', next);
          var resolved = next === 'system'
            ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
            : next;
          document.documentElement.setAttribute('data-theme', resolved);
          document.documentElement.style.colorScheme = resolved;
        } catch (_) {}
        close();
        return;
      }
      if (action === 'signout') {
        close();
        try {
          if (window.HX && window.HX.supabase) {
            window.HX.supabase.auth.signOut().finally(function () { window.location.href = '/signup'; });
          } else { window.location.href = '/signup'; }
        } catch (_) { window.location.href = '/signup'; }
      }
    });
  }

  /* ─── Premium sidebar reveal — staggered fade-in as sections enter
         the sidebar viewport on scroll. Reduced-motion users get an
         instant reveal (matches the CSS @media query). ─── */
  function setupSidebarReveal(sidebar) {
    var sections = sidebar.querySelectorAll('.hx-nav-section');
    if (!sections.length) return;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) {
      sections.forEach(function (s) { s.classList.add('is-revealed'); });
      return;
    }
    // Stagger only when revealing on initial mount; once user scrolls,
    // sections appear as soon as they enter view.
    var firstWave = true;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && !entry.target.classList.contains('is-revealed')) {
          if (firstWave) {
            var idx = Array.prototype.indexOf.call(sections, entry.target);
            setTimeout(function () { entry.target.classList.add('is-revealed'); }, Math.min(idx * 70, 420));
          } else {
            entry.target.classList.add('is-revealed');
          }
          io.unobserve(entry.target);
        }
      });
    }, { root: sidebar, threshold: 0.10, rootMargin: '0px 0px -20px 0px' });
    sections.forEach(function (s) { io.observe(s); });
    // Flip firstWave off after the initial cascade window so later
    // reveals (from user scrolling) don't get artificially delayed.
    setTimeout(function () { firstWave = false; }, 600);
  }

  function injectShell() {
    var body = document.body;
    if (!body) return;
    var activeId = body.getAttribute('data-active') || '';
    var activeItem = findActive(activeId);

    var sidebar = document.querySelector('.hx-sidebar');
    if (sidebar) {
      sidebar.innerHTML = buildSidebar(activeId);
      setupSidebarReveal(sidebar);
      wireWorkspaceMenu();           // workspace pill → dropdown
    }

    var topbar = document.querySelector('.hx-topbar');
    if (topbar) topbar.innerHTML = buildTopbar(activeItem);

    // Mobile backdrop overlay — injected once. Sidebar open/close also
    // toggles a body class so the page itself stops scrolling while the
    // menu is up (a real-product touch that prevents iOS rubber-banding).
    var backdrop = document.querySelector('.hx-mobile-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'hx-mobile-backdrop';
      document.body.appendChild(backdrop);
    }
    function setMenuOpen(open) {
      if (!sidebar) return;
      sidebar.classList.toggle('open', open);
      document.body.classList.toggle('hx-menu-open', open);
    }
    var toggle = document.getElementById('hx-menu-toggle');
    if (toggle && sidebar) {
      toggle.addEventListener('click', function () { setMenuOpen(!sidebar.classList.contains('open')); });
    }
    backdrop.addEventListener('click', function () { setMenuOpen(false); });
    if (sidebar) {
      // Close on outside click (desktop's existing behaviour).
      document.addEventListener('click', function (e) {
        if (window.innerWidth > 900) return;
        if (!sidebar.classList.contains('open')) return;
        if (sidebar.contains(e.target) || (toggle && toggle.contains(e.target)) || e.target === backdrop) return;
        setMenuOpen(false);
      });
      // Close after the user navigates to a new section.
      sidebar.addEventListener('click', function (e) {
        if (window.innerWidth > 900) return;
        if (e.target.closest && e.target.closest('a')) setMenuOpen(false);
      });
      // Snap shut when crossing back to desktop width.
      window.addEventListener('resize', function () {
        if (window.innerWidth > 900) setMenuOpen(false);
      });
    }

    // Sidebar "Find…" + topbar Cmd+K + ⌘K shortcut all open the real
    // command palette. Behaviour lives at the bottom of this file in
    // mountCommandPalette() — opens on demand, lazy-loads Supabase
    // data, supports arrow / Enter / Escape, no focus-only theatre.
    var sidebarFind = document.getElementById('hx-sidebar-find');
    var cmdkInput   = document.getElementById('hx-cmdk');
    if (sidebarFind) sidebarFind.addEventListener('click', function () { openCommandPalette(); });
    if (cmdkInput) {
      // Focusing the topbar input opens the palette and hands focus to
      // the palette's own input — that way every keystroke after the
      // first click ends up in the palette, results render below, and
      // the topbar input visually keeps the user's query in sync.
      cmdkInput.addEventListener('focus', function () { openCommandPalette(cmdkInput.value); });
      cmdkInput.addEventListener('click', function () { openCommandPalette(cmdkInput.value); });
      cmdkInput.addEventListener('input', function () { openCommandPalette(cmdkInput.value); });
    }
    document.addEventListener('keydown', function (e) {
      var meta = e.metaKey || e.ctrlKey;
      if (meta && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        openCommandPalette();
      }
    });
    mountCommandPalette();

    loadAuthScript();
    if (window.HX && window.HX.supabase) hydrateUser();
    else document.addEventListener('hx:auth-ready', hydrateUser, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectShell);
  } else {
    injectShell();
  }

  /* ─── Client-side error capture ─────────────────────────────────
     Forwards window.onerror / unhandledrejection to /api/log-error.
     Throttled to 6 reports per page-load so a tight error loop can't
     hammer the endpoint. Anonymous errors are dropped server-side. */
  (function () {
    if (window.__hxErrInit) return;
    window.__hxErrInit = true;
    var sent = 0;
    var LIMIT = 6;

    async function sendError(payload) {
      if (sent >= LIMIT) return;
      sent++;
      try {
        var headers = { 'Content-Type': 'application/json' };
        var sb = window.HX && window.HX.supabase;
        if (sb) {
          try {
            var r = await sb.auth.getSession();
            var s = r && r.data && r.data.session;
            if (s && s.access_token) headers['Authorization'] = 'Bearer ' + s.access_token;
          } catch (_) {}
        }
        await fetch('/api/log-error', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(payload),
          keepalive: true,
        });
      } catch (_) { /* swallow */ }
    }

    window.addEventListener('error', function (e) {
      sendError({
        type: 'error',
        message: (e && e.message) || 'unknown',
        stack: (e && e.error && e.error.stack) || '',
        url: (e && e.filename) || location.href,
        line: e && e.lineno,
        column: e && e.colno,
        page: location.pathname,
      });
    });

    window.addEventListener('unhandledrejection', function (e) {
      var reason = e && e.reason;
      sendError({
        type: 'unhandledrejection',
        message: (reason && (reason.message || String(reason))) || 'unhandled rejection',
        stack: (reason && reason.stack) || '',
        url: location.href,
        page: location.pathname,
      });
    });
  })();

  /* ─── Command palette ───────────────────────────────────────────
     Single overlay mounted lazily on first ⌘K. Search providers:
       • Quick actions  (always shown when query is empty)
       • Pages          (static catalogue, filtered)
       • Projects       (public.projects, debounced ilike)
       • Memories       (public.memories,  debounced ilike)
       • Artifacts      (public.artifacts, debounced ilike)
       • Leads          (public.leads,     debounced ilike)
     Selection moves with ↑/↓, Enter executes, Esc closes.
     Recent jumps are cached in localStorage so the top of the
     palette feels personalised after the first few uses. */
  var hxCmd = { mounted: false, items: [], active: 0, q: '', reqSeq: 0, recent: [] };
  var RECENT_KEY = 'hx.cmdp_recent';

  function loadRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (_) { return []; }
  }
  function saveRecent(entry) {
    try {
      var list = loadRecent().filter(function (r) { return r.href !== entry.href; });
      list.unshift(entry);
      list = list.slice(0, 5);
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch (_) {}
  }

  var PAGES = [
    { title: 'Overview',          href: '/dashboard.html',  hint: 'Workspace' },
    { title: 'Chat',              href: '/chat.html',       hint: 'Workspace' },
    { title: 'Workbench',         href: '/workbench.html',  hint: 'Workspace' },
    { title: 'Memory',            href: '/memory.html',     hint: 'Workspace' },
    { title: 'Projects',          href: '/projects.html',   hint: 'Workspace' },
    { title: 'Services',          href: '/services.html',   hint: 'Workspace' },
    { title: 'Consulting',        href: '/consulting.html', hint: 'Workspace' },
    { title: 'CRM',               href: '/app-crm.html',         hint: 'Toolkit' },
    { title: 'Marketing Tools',   href: '/app-marketing.html',   hint: 'Toolkit' },
    { title: 'Automation',        href: '/app-automation.html',  hint: 'Toolkit' },
    { title: 'Business Assistant',href: '/app-assistant.html',   hint: 'Toolkit' },
    { title: 'Models',            href: '/models.html',          hint: 'AI' },
    { title: 'Workflows',         href: '/workflows.html',       hint: 'AI' },
    { title: 'Deployments',       href: '/deployments.html',     hint: 'AI' },
    { title: 'Activity',          href: '/activity.html',        hint: 'Observability' },
    { title: 'Usage',             href: '/usage.html',           hint: 'Observability' },
    { title: 'Logs',              href: '/logs.html',            hint: 'Observability' },
    { title: 'Monitoring',        href: '/monitoring.html',      hint: 'Observability' },
    { title: 'API Keys',          href: '/api-keys.html',        hint: 'Developer' },
    { title: 'Integrations',      href: '/integrations.html',    hint: 'Developer' },
    { title: 'Domains',           href: '/domains.html',         hint: 'Developer' },
    { title: 'API Docs',          href: '/docs.html',            hint: 'Developer' },
    { title: 'Credits',           href: '/credits.html',         hint: 'Billing' },
    { title: 'Pricing',           href: '/pricing.html',         hint: 'Billing' },
    { title: 'Subscriptions',     href: '/subscriptions.html',   hint: 'Billing' },
    { title: 'Invoices',          href: '/invoices.html',        hint: 'Billing' },
    { title: 'Billing',           href: '/billing.html',         hint: 'Billing' },
    { title: 'Profile',           href: '/profile.html',         hint: 'Account' },
    { title: 'Team',              href: '/team.html',            hint: 'Account' },
    { title: 'Security',          href: '/security.html',        hint: 'Account' },
    { title: 'Settings',          href: '/settings.html',        hint: 'Account' },
    { title: 'Support',           href: '/support.html',         hint: 'Account' },
    { title: 'Status',            href: '/status.html',          hint: 'Platform' },
  ];

  function quickActions() {
    return [
      { title: 'New project',  hint: 'Open the new-project form',  exec: function () { window.location.href = '/projects.html?new=1'; } },
      { title: 'New memory',   hint: 'Drop a fact for the assistant', exec: function () { window.location.href = '/memory.html?new=1'; } },
      { title: 'New artifact', hint: 'Open the Workbench composer', exec: function () { window.location.href = '/workbench.html?new=1'; } },
      { title: 'Open API docs',hint: 'Endpoints, auth, streaming',  href:  '/docs.html' },
      { title: 'Live status',  hint: 'System health right now',     href:  '/status.html' },
      { title: 'Sign out',     hint: 'End this session',            exec: function () {
        try {
          if (window.HX && window.HX.supabase) window.HX.supabase.auth.signOut().finally(function () { window.location.href = '/signup'; });
          else window.location.href = '/signup';
        } catch (_) { window.location.href = '/signup'; }
      } },
    ];
  }

  function buildEmptyResults() {
    var groups = [];
    var recent = loadRecent();
    if (recent.length) {
      groups.push({
        label: 'Recent',
        items: recent.map(function (r) { return { icon: 'R', title: r.title, sub: r.sub || r.hint || '', hint: r.hint || '', href: r.href }; }),
      });
    }
    groups.push({
      label: 'Quick actions',
      items: quickActions().map(function (a) { return Object.assign({ icon: '⌘' }, a); }),
    });
    return groups;
  }

  function pageMatches(q) {
    q = q.toLowerCase();
    return PAGES.filter(function (p) {
      return p.title.toLowerCase().includes(q) || (p.hint || '').toLowerCase().includes(q);
    }).slice(0, 8).map(function (p) {
      return { icon: (p.hint || 'P').slice(0,1).toUpperCase(), title: p.title, sub: p.hint || '', hint: 'Page', href: p.href };
    });
  }

  async function supabaseSearch(q) {
    var sb = window.HX && window.HX.supabase;
    if (!sb) return { projects: [], memories: [], artifacts: [], leads: [] };
    var like = '%' + q.replace(/%/g, '') + '%';
    var seq = ++hxCmd.reqSeq;
    var [pr, me, ar, ld] = await Promise.all([
      sb.from('projects').select('id, name, slug, status').ilike('name', like).limit(5),
      sb.from('memories').select('id, content, tags').ilike('content', like).limit(5),
      sb.from('artifacts').select('id, title, kind').ilike('title', like).limit(5),
      sb.from('leads').select('id, name, company, email').ilike('name', like).limit(5),
    ]).catch(function () { return [{}, {}, {}, {}]; });
    if (seq !== hxCmd.reqSeq) return null; // outpaced by a newer query
    return {
      projects:  (pr && pr.data) || [],
      memories:  (me && me.data) || [],
      artifacts: (ar && ar.data) || [],
      leads:     (ld && ld.data) || [],
    };
  }

  function renderResults(groups) {
    var flat = [];
    groups.forEach(function (g) { g.items.forEach(function (it) { flat.push(it); }); });
    hxCmd.items = flat;
    if (hxCmd.active >= flat.length) hxCmd.active = 0;

    var host = document.getElementById('hx-cmdp-results');
    if (!flat.length) {
      host.innerHTML = '<div class="hx-cmdp-empty">No matches for <strong>' + (hxCmd.q ? escapeHtml(hxCmd.q) : '...') + '</strong>. Press Esc to close.</div>';
      return;
    }
    var idx = 0;
    host.innerHTML = groups.map(function (g) {
      var rows = g.items.map(function (it) {
        var i = idx++;
        var active = i === hxCmd.active ? ' is-active' : '';
        return ''
          + '<div class="hx-cmdp-item' + active + '" data-i="' + i + '">'
          +   '<div class="hx-cmdp-item-icon">' + escapeHtml(it.icon || '·') + '</div>'
          +   '<div class="hx-cmdp-item-body">'
          +     '<div class="hx-cmdp-item-title">' + escapeHtml(it.title) + '</div>'
          +     (it.sub ? '<div class="hx-cmdp-item-sub">' + escapeHtml(it.sub) + '</div>' : '')
          +   '</div>'
          +   (it.hint ? '<div class="hx-cmdp-item-hint">' + escapeHtml(it.hint) + '</div>' : '')
          + '</div>';
      }).join('');
      return '<div class="hx-cmdp-group"><div class="hx-cmdp-group-label">' + escapeHtml(g.label) + '</div>' + rows + '</div>';
    }).join('');
    host.querySelectorAll('.hx-cmdp-item').forEach(function (el) {
      el.addEventListener('mouseenter', function () {
        hxCmd.active = parseInt(el.getAttribute('data-i'), 10);
        host.querySelectorAll('.hx-cmdp-item').forEach(function (x, i) { x.classList.toggle('is-active', i === hxCmd.active); });
      });
      el.addEventListener('click', function () {
        hxCmd.active = parseInt(el.getAttribute('data-i'), 10);
        executeActive();
      });
    });
  }

  function escapeHtml(s) {
    return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  var searchTimer = null;
  function onInput(e) {
    var q = (e.target.value || '').trim();
    hxCmd.q = q;
    // Mirror palette query into the topbar input so both surfaces
    // stay visually in lock-step regardless of which one the user is
    // typing into.
    var topbarInput = document.getElementById('hx-cmdk');
    if (topbarInput && topbarInput.value !== e.target.value) topbarInput.value = e.target.value;
    if (!q) {
      renderResults(buildEmptyResults());
      return;
    }
    var pages = pageMatches(q);
    var groups = [];
    if (pages.length) groups.push({ label: 'Pages', items: pages });
    renderResults(groups.length ? groups : [{ label: 'Pages', items: [] }]);
    // Show a "loading" hint for the data search.
    document.getElementById('hx-cmdp-status').textContent = 'searching your data…';

    clearTimeout(searchTimer);
    searchTimer = setTimeout(async function () {
      var res = await supabaseSearch(q);
      if (!res) return; // out-of-order; drop
      document.getElementById('hx-cmdp-status').textContent = '';
      var merged = groups.slice();
      if (res.projects.length) merged.push({ label: 'Projects', items: res.projects.map(function (p) {
        return { icon: 'Pj', title: p.name, sub: 'Project · ' + (p.status || 'active'), hint: 'Enter', href: '/projects.html#' + p.slug };
      }) });
      if (res.memories.length) merged.push({ label: 'Memories', items: res.memories.map(function (m) {
        var s = String(m.content || '').slice(0, 70);
        return { icon: 'Me', title: s, sub: (m.tags || []).join(' · ') || 'Memory', hint: 'Enter', href: '/memory.html' };
      }) });
      if (res.artifacts.length) merged.push({ label: 'Workbench', items: res.artifacts.map(function (a) {
        return { icon: 'Wb', title: a.title, sub: 'Artifact · ' + (a.kind || 'note'), hint: 'Enter', href: '/workbench.html' };
      }) });
      if (res.leads.length) merged.push({ label: 'CRM leads', items: res.leads.map(function (l) {
        return { icon: 'Ld', title: l.name || l.email || 'Lead', sub: l.company || l.email || '', hint: 'Enter', href: '/app-crm.html' };
      }) });
      renderResults(merged);
    }, 180);
  }

  function executeActive() {
    var it = hxCmd.items[hxCmd.active];
    if (!it) return;
    saveRecent({ title: it.title, sub: it.sub, hint: it.hint, href: it.href });
    closeCommandPalette();
    if (typeof it.exec === 'function') { it.exec(); return; }
    if (it.href) window.location.href = it.href;
  }

  function move(delta) {
    if (!hxCmd.items.length) return;
    hxCmd.active = (hxCmd.active + delta + hxCmd.items.length) % hxCmd.items.length;
    var host = document.getElementById('hx-cmdp-results');
    host.querySelectorAll('.hx-cmdp-item').forEach(function (x, i) { x.classList.toggle('is-active', i === hxCmd.active); });
    var activeEl = host.querySelector('.hx-cmdp-item.is-active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  }

  function mountCommandPalette() {
    if (hxCmd.mounted) return;
    hxCmd.mounted = true;
    var back = document.createElement('div');
    back.className = 'hx-cmdp-back';
    back.id = 'hx-cmdp-back';
    back.innerHTML =
      '<div class="hx-cmdp" role="dialog" aria-label="Command palette">' +
        '<div class="hx-cmdp-input-row">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
          '<input id="hx-cmdp-input" class="hx-cmdp-input" type="text" placeholder="Jump to a page, search projects, memories, leads…" spellcheck="false" autocomplete="off" />' +
          '<button type="button" class="hx-cmdp-close" id="hx-cmdp-close" aria-label="Close">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div id="hx-cmdp-results" class="hx-cmdp-results"></div>' +
        '<div class="hx-cmdp-foot">' +
          '<span><kbd>↑</kbd><kbd>↓</kbd> move</span>' +
          '<span><kbd>Enter</kbd> open</span>' +
          '<span><kbd>Esc</kbd> close</span>' +
          '<span id="hx-cmdp-status" style="margin-left:auto;"></span>' +
        '</div>' +
      '</div>';
    document.body.appendChild(back);

    back.addEventListener('click', function (e) { if (e.target === back) closeCommandPalette(); });
    var closeBtn = back.querySelector('#hx-cmdp-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { closeCommandPalette(); });
    var input = back.querySelector('#hx-cmdp-input');
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape')   { e.preventDefault(); closeCommandPalette(); }
      if (e.key === 'ArrowDown'){ e.preventDefault(); move(1); }
      if (e.key === 'ArrowUp')  { e.preventDefault(); move(-1); }
      if (e.key === 'Enter')    { e.preventDefault(); executeActive(); }
    });
  }

  function openCommandPalette(initialQuery) {
    mountCommandPalette();
    var back = document.getElementById('hx-cmdp-back');
    var input = document.getElementById('hx-cmdp-input');
    if (!back || !input) return;
    var alreadyOpen = back.classList.contains('open');
    var q = typeof initialQuery === 'string' ? initialQuery : '';
    back.classList.add('open');

    // If the user is summoning the palette by typing into the topbar
    // input, we mirror that text in the palette and run the same
    // pipeline as if they typed in the palette directly.
    if (q && (!alreadyOpen || input.value !== q)) {
      input.value = q;
      hxCmd.q = q;
      hxCmd.active = 0;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (!alreadyOpen) {
      input.value = '';
      hxCmd.q = '';
      hxCmd.active = 0;
      renderResults(buildEmptyResults());
    }

    if (!alreadyOpen) setTimeout(function () { input.focus(); }, 10);
  }

  function closeCommandPalette() {
    var back = document.getElementById('hx-cmdp-back');
    if (back) back.classList.remove('open');
    var topbarInput = document.getElementById('hx-cmdk');
    if (topbarInput) {
      topbarInput.value = '';
      try { topbarInput.blur(); } catch (_) {}
    }
  }

  // Expose so other pages can summon it.
  window.HX = window.HX || {};
  window.HX.openCommandPalette = openCommandPalette;
})();
