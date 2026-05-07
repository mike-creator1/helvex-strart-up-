/*! CreateX · Analytics tracker
 *  Fire-and-forget event capture. Auto-loaded by sidebar.js on every
 *  authenticated page. Writes to public.analytics_events (RLS-scoped
 *  to the signed-in user). All Analytics charts read from this table.
 *
 *  Public API:  cxTrack(eventType, { module, model, tokens, latency, success, metadata })
 */
(function () {
  if (window.__cxAnalyticsInit) return;
  window.__cxAnalyticsInit = true;

  function ready(cb, t) {
    if (window.sb) return cb();
    if ((t = t || 0) > 100) return;
    setTimeout(function () { ready(cb, t + 1); }, 50);
  }

  async function track(type, data) {
    if (!window.sb) return;
    try {
      var s = await window.sb.auth.getSession();
      var u = s && s.data && s.data.session && s.data.session.user;
      if (!u) return;
      var d = data || {};
      await window.sb.from('analytics_events').insert({
        user_id:    u.id,
        event_type: type,
        module:     d.module     || null,
        model:      d.model      || null,
        tokens:     (typeof d.tokens   === 'number') ? d.tokens   : null,
        latency_ms: (typeof d.latency  === 'number') ? d.latency  : null,
        success:    (typeof d.success  === 'boolean') ? d.success : null,
        metadata:   d.metadata   || null
      });
    } catch (e) { /* fire-and-forget */ }
  }
  window.cxTrack = track;

  /* ── Auto page_view on every authenticated page ── */
  var page = (location.pathname.split('/').pop() || '').replace(/\.html$/, '') || 'index';
  var SKIP_AUTOTRACK = { index: 1, verify: 1, 'set-password': 1, reset: 1, landing: 1, checkout: 1, 'payment-success': 1, cancel: 1 };
  ready(function () {
    if (SKIP_AUTOTRACK[page]) return;
    track('page_view', { module: page });
  });

  /* ── Auto sign-in event (fires once per fresh session) ── */
  ready(function () {
    if (!window.sb || !window.sb.auth || !window.sb.auth.onAuthStateChange) return;
    window.sb.auth.onAuthStateChange(function (evt, session) {
      if (evt === 'SIGNED_IN' && session) track('sign_in', { module: page });
    });
  });

  /* ── Wrap fetch to capture every HelveX AI generation ── */
  if (!window.__cxFetchPatched) {
    window.__cxFetchPatched = true;
    var orig = window.fetch.bind(window);
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (url.indexOf('api.anthropic.com/v1/messages') === -1) {
        return orig.apply(window, arguments);
      }
      var t0 = performance.now();
      var body = {};
      try { body = JSON.parse((init && init.body) || '{}'); } catch (e) {}
      var model = body.model || 'unknown';
      var msgsLen = JSON.stringify(body.messages || []).length;
      var estTokens = Math.round(msgsLen / 4); /* coarse estimate, refined by usage when streamed */

      return orig.apply(window, arguments).then(function (res) {
        var ms = Math.round(performance.now() - t0);
        track('ai_generation', { module: page, model: model, tokens: estTokens, latency: ms, success: !!res.ok });
        return res;
      }).catch(function (err) {
        var ms = Math.round(performance.now() - t0);
        track('ai_generation', { module: page, model: model, tokens: estTokens, latency: ms, success: false });
        throw err;
      });
    };
  }
})();
