/* ═══════════════════════════════════════════════════════════════════
   HelveX Workbench · shared runtime
   Lightweight helpers shared by Memory / Projects / Deployments /
   Services: a persistent localStorage store (so every action is real
   and survives reload), toasts, a detail drawer, and formatters.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var WB = (window.WB = window.WB || {});

  WB.esc = function (s) {
    return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  WB.uid = function () { return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };

  WB.relTime = function (iso) {
    if (!iso) return '—';
    var diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 0) return 'in ' + WB.relTime(new Date(Date.now() * 2 - new Date(iso).getTime()).toISOString());
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 2592000) return Math.floor(diff / 86400) + 'd ago';
    return Math.floor(diff / 2592000) + 'mo ago';
  };
  WB.fmtDate = function (iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch (e) { return iso; }
  };
  WB.ago = function (mins) { return new Date(Date.now() - mins * 60000).toISOString(); };

  /* ---- Persistent store. seed() runs only on first use. ---- */
  WB.store = function (key, seed) {
    var k = 'hx.wb.' + key;
    function read() {
      try { var raw = localStorage.getItem(k); if (raw) return JSON.parse(raw); } catch (e) {}
      var s = (typeof seed === 'function' ? seed() : seed) || [];
      try { localStorage.setItem(k, JSON.stringify(s)); } catch (e) {}
      return s;
    }
    function write(v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} return v; }
    return {
      all: read,
      set: write,
      add: function (item) { var a = read(); a.unshift(item); write(a); return item; },
      update: function (id, patch) { var a = read().map(function (x) { return x.id === id ? Object.assign(x, patch) : x; }); write(a); return a; },
      remove: function (id) { var a = read().filter(function (x) { return x.id !== id; }); write(a); return a; },
      reset: function () { try { localStorage.removeItem(k); } catch (e) {} return read(); }
    };
  };

  /* ---- Toasts ---- */
  var ICN = {
    ok: '<polyline points="20 6 9 17 4 12"/>',
    err: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    info: '<line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'
  };
  WB.toast = function (msg, kind) {
    kind = kind || 'ok';
    var host = document.querySelector('.wb-toasts');
    if (!host) { host = document.createElement('div'); host.className = 'wb-toasts'; document.body.appendChild(host); }
    var t = document.createElement('div');
    t.className = 'wb-toast ' + kind;
    t.innerHTML = '<span class="ti"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' + (ICN[kind] || ICN.info) + '</svg></span><span>' + WB.esc(msg) + '</span>';
    host.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 220); }, 2600);
  };

  /* ---- Detail drawer ---- */
  function ensureDrawer() {
    if (document.querySelector('.wb-drawer')) return;
    var bd = document.createElement('div'); bd.className = 'wb-backdrop';
    var dr = document.createElement('aside'); dr.className = 'wb-drawer'; dr.setAttribute('role', 'dialog');
    dr.innerHTML = '<div class="wb-drawer-head"><h2 id="wb-dr-title"></h2><button class="wb-x" id="wb-dr-x"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div><div class="wb-drawer-body" id="wb-dr-body"></div><div class="wb-drawer-foot" id="wb-dr-foot"></div>';
    document.body.appendChild(bd); document.body.appendChild(dr);
    bd.addEventListener('click', WB.drawer.close);
    document.getElementById('wb-dr-x').addEventListener('click', WB.drawer.close);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') WB.drawer.close(); });
  }
  WB.drawer = {
    open: function (opts) {
      ensureDrawer();
      document.getElementById('wb-dr-title').innerHTML = opts.title || '';
      document.getElementById('wb-dr-body').innerHTML = opts.body || '';
      document.getElementById('wb-dr-foot').innerHTML = opts.foot || '';
      requestAnimationFrame(function () {
        document.querySelector('.wb-backdrop').classList.add('on');
        document.querySelector('.wb-drawer').classList.add('on');
      });
      if (typeof opts.onMount === 'function') setTimeout(opts.onMount, 30);
    },
    close: function () {
      var bd = document.querySelector('.wb-backdrop'), dr = document.querySelector('.wb-drawer');
      if (bd) bd.classList.remove('on'); if (dr) dr.classList.remove('on');
    }
  };

  /* ---- Armed (two-click) destructive action ---- */
  WB.arm = function (btn, label, onConfirm) {
    if (btn.dataset.armed === '1') { onConfirm(); return; }
    btn.dataset.armed = '1';
    var orig = btn.innerHTML;
    btn.innerHTML = label || 'Click to confirm';
    btn.classList.add('danger');
    setTimeout(function () { if (btn.dataset.armed === '1') { btn.dataset.armed = ''; btn.innerHTML = orig; btn.classList.remove('danger'); } }, 2800);
  };

  /* ---- Skeleton helper ---- */
  WB.skeletonCards = function (n) {
    var one = '<div class="wb-skel-card"><div class="wb-skel" style="width:40px;height:40px;border-radius:11px"></div>' +
      '<div class="wb-skel" style="height:13px;width:60%;margin-top:14px"></div>' +
      '<div class="wb-skel" style="height:11px;width:90%;margin-top:10px"></div>' +
      '<div class="wb-skel" style="height:11px;width:40%;margin-top:8px"></div></div>';
    return '<div class="wb-grid">' + new Array(n || 6).fill(one).join('') + '</div>';
  };

  /* small inline icon helper */
  WB.svg = function (path, sw) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 1.8) + '" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
  };

  /* ---- Live Supabase data layer ----
     WB.ready(cb) resolves cb(sb, user) once the shared Supabase client
     (set up by auth.js via platform.js) is available and the user is
     known. WB.tbl gives a thin typed CRUD wrapper over a table. */
  WB.ready = function (cb) {
    function go() {
      var sb = window.HX && window.HX.supabase;
      if (!sb) { cb(null, null); return; }
      sb.auth.getUser().then(function (r) { cb(sb, r && r.data ? r.data.user : null); })
        .catch(function () { cb(sb, null); });
    }
    if (window.HX && window.HX.supabase) go();
    else document.addEventListener('hx:auth-ready', go, { once: true });
  };
  WB.tbl = function (sb, name, owner) {
    return {
      list: function (sel, order) {
        var q = sb.from(name).select(sel || '*');
        if (order) q = q.order(order.col, { ascending: !!order.asc });
        return q;
      },
      insert: function (row) { return sb.from(name).insert(Object.assign({ owner_id: owner }, row)).select().single(); },
      update: function (id, patch) { return sb.from(name).update(patch).eq('id', id).select().single(); },
      remove: function (id) { return sb.from(name).delete().eq('id', id); }
    };
  };
})();
