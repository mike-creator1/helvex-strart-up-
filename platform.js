/* ═══════════════════════════════════════════════════════════
   HelveX · Client Portal · shared sidebar + top-bar injector
   Each platform page sets <body data-active="dashboard"> to
   highlight the current item and render the right breadcrumb.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var NAV_GROUPS = [
    {
      label: 'Workspace',
      items: [
        { id: 'dashboard',  href: '/dashboard.html',  label: 'Overview',   icon: 'home' },
        { id: 'chat',       href: '/chat.html',       label: 'Chat',       icon: 'chat' },
        { id: 'projects',   href: '/projects.html',   label: 'Projects',   icon: 'folder' },
        { id: 'services',   href: '/services.html',   label: 'Services',   icon: 'grid' },
        { id: 'consulting', href: '/consulting.html', label: 'Consulting', icon: 'briefcase' }
      ]
    },
    {
      label: 'Toolkit',
      items: [
        { id: 'app-crm',         href: '/app/crm',                label: 'CRM',                icon: 'contacts' },
        { id: 'app-marketing',   href: '/app/marketing-tools',    label: 'Marketing Tools',    icon: 'megaphone' },
        { id: 'app-automation',  href: '/app/automation',         label: 'Automation',         icon: 'flow' },
        { id: 'app-assistant',   href: '/app/business-assistant', label: 'Business Assistant', icon: 'sparkle' },
        { id: 'app-marketplace', href: '/app/marketplace',        label: 'Marketplace',        icon: 'bag' }
      ]
    },
    {
      label: 'AI',
      items: [
        { id: 'models',      href: '/models.html',      label: 'Models',      icon: 'cpu' },
        { id: 'workflows',   href: '/workflows.html',   label: 'Workflows',   icon: 'zap' },
        { id: 'deployments', href: '/deployments.html', label: 'Deployments', icon: 'cloud' }
      ]
    },
    {
      label: 'Observability',
      items: [
        { id: 'activity',   href: '/activity.html',   label: 'Activity',   icon: 'pulse' },
        { id: 'usage',      href: '/usage.html',      label: 'Usage',      icon: 'chart' },
        { id: 'logs',       href: '/logs.html',       label: 'Logs',       icon: 'terminal' },
        { id: 'monitoring', href: '/monitoring.html', label: 'Monitoring', icon: 'heart' }
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
        { id: 'credits',       href: '/credits.html',       label: 'Credits',       icon: 'coin' },
        { id: 'pricing',       href: '/pricing.html',       label: 'Pricing',       icon: 'tag' },
        { id: 'subscriptions', href: '/subscriptions.html', label: 'Subscriptions', icon: 'refresh' },
        { id: 'invoices',      href: '/invoices.html',      label: 'Invoices',      icon: 'doc' },
        { id: 'billing',       href: '/billing.html',       label: 'Billing',       icon: 'card' }
      ]
    },
    {
      label: 'Account',
      items: [
        { id: 'profile',  href: '/profile.html',  label: 'Profile',  icon: 'user'   },
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
    sparkle:  '<path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z"/><path d="M19 17l.6 2 2 .6-2 .6L19 22l-.6-1.8-2-.6 2-.6z"/>',
    bag:      '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 1 1-8 0"/>'
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

    html += '<button type="button" class="hx-workspace" id="hx-workspace-btn" title="Workspace">';
    html +=   '<span class="hx-workspace-avatar" id="hx-workspace-avatar">·</span>';
    html +=   '<span class="hx-workspace-info">';
    html +=     '<span class="hx-workspace-name" id="hx-workspace-name">Loading…</span>';
    html +=     '<span class="hx-workspace-plan" id="hx-workspace-plan">Free</span>';
    html +=   '</span>';
    html +=   '<svg class="hx-workspace-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="8 9 12 5 16 9"/><polyline points="8 15 12 19 16 15"/></svg>';
    html += '</button>';

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
    html += '<button type="button" class="hx-cmdk" id="hx-cmdk" aria-label="Search">';
    html +=   svg('search', { sw: 1.8 });
    html +=   '<span class="hx-cmdk-text">Search…</span>';
    html +=   '<span class="hx-cmdk-kbd">⌘K</span>';
    html += '</button>';
    return html;
  }

  function loadAuthScript() {
    if (window.HX && window.HX.auth) return;
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
      if (wsNameEl) wsNameEl.textContent = wsName || 'Personal';
      if (wsAvEl)   wsAvEl.textContent   = (wsName || 'P').slice(0, 1).toUpperCase();
    });
  }

  function injectShell() {
    var body = document.body;
    if (!body) return;
    var activeId = body.getAttribute('data-active') || '';
    var activeItem = findActive(activeId);

    var sidebar = document.querySelector('.hx-sidebar');
    if (sidebar) sidebar.innerHTML = buildSidebar(activeId);

    var topbar = document.querySelector('.hx-topbar');
    if (topbar) topbar.innerHTML = buildTopbar(activeItem);

    var toggle = document.getElementById('hx-menu-toggle');
    if (toggle && sidebar) {
      toggle.addEventListener('click', function () { sidebar.classList.toggle('open'); });
    }
    if (sidebar) {
      document.addEventListener('click', function (e) {
        if (window.innerWidth > 900) return;
        if (!sidebar.classList.contains('open')) return;
        if (sidebar.contains(e.target) || (toggle && toggle.contains(e.target))) return;
        sidebar.classList.remove('open');
      });
    }

    // Sidebar "Find…" button + topbar Cmd+K + keyboard shortcut all
    // focus the same affordance (no actual command palette yet).
    var sidebarFind = document.getElementById('hx-sidebar-find');
    function focusCmdK() {
      var cmdk = document.getElementById('hx-cmdk');
      if (cmdk) cmdk.focus();
    }
    if (sidebarFind) sidebarFind.addEventListener('click', focusCmdK);
    document.addEventListener('keydown', function (e) {
      var meta = e.metaKey || e.ctrlKey;
      if (meta && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        focusCmdK();
      }
    });

    loadAuthScript();
    if (window.HX && window.HX.auth) hydrateUser();
    else document.addEventListener('hx:auth-ready', hydrateUser, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectShell);
  } else {
    injectShell();
  }
})();
