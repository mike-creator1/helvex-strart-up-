/* ═══════════════════════════════════════════════════════════
   HelveX · Client Portal · Supabase auth integration
   - Initializes a single Supabase client (window.HX.supabase)
   - Exposes auth helpers (signUp, verify, signIn, OAuth, reset)
   - Mounts a session guard + logout for every authenticated page
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // Auth/signup/login pages also block pinch-zoom and double-tap-zoom.
  // iOS Safari ignores user-scalable=no in some contexts; these listeners
  // and CSS touch-action enforce no-zoom on the auth flow too.
  (function lockZoomOnAuth() {
    var prevent = function (e) { e.preventDefault(); };
    document.addEventListener('gesturestart',  prevent, { passive: false });
    document.addEventListener('gesturechange', prevent, { passive: false });
    document.addEventListener('gestureend',    prevent, { passive: false });
    var lastTouchEnd = 0;
    document.addEventListener('touchend', function (e) {
      var now = Date.now();
      if (now - lastTouchEnd <= 320) e.preventDefault();
      lastTouchEnd = now;
    }, { passive: false });
    document.addEventListener('wheel', function (e) {
      if (e.ctrlKey) e.preventDefault();
    }, { passive: false });
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
        e.preventDefault();
      }
    });
  })();

  var SUPABASE_URL = 'https://yjmpallrtpeinpdilptj.supabase.co';
  var SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_vx5tD4mUizuspej5-g3XlQ_PnbjXSeR';
  var OTP_FN_URL = SUPABASE_URL + '/functions/v1/auth-otp';

  // Public pages that should never trigger an auth redirect.
  var PUBLIC_PATHS = [
    '/', '/index', '/index.html',
    '/signup', '/signup.html',
    '/verify', '/verify.html',
    '/forgot-password', '/forgot-password.html',
    '/reset-password', '/reset-password.html'
  ];

  function loadSdk(cb) {
    if (window.supabase && window.supabase.createClient) { cb(); return; }
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
    s.onload = cb;
    s.onerror = function () { console.error('[HelveX] failed to load Supabase SDK'); };
    document.head.appendChild(s);
  }

  function init() {
    var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storageKey: 'helvex.auth'
      }
    });

    var HX = (window.HX = window.HX || {});
    HX.supabase = sb;

    /* ---------- helpers ----------
       Strict 6-digit HelveX OTP flow. The auth-otp Edge Function generates
       the code, stores its hash, emails it via Resend with HelveX branding,
       and verifies the user's input against that same hash. The email's
       code IS the code that completes verification — no Supabase OTP. */

    function clean(s) { return String(s || '').trim().toLowerCase(); }

    function callOtp(action, payload) {
      return fetch(OTP_FN_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'apikey': SUPABASE_PUBLISHABLE_KEY,
          'authorization': 'Bearer ' + SUPABASE_PUBLISHABLE_KEY
        },
        body: JSON.stringify(Object.assign({ action: action }, payload || {}))
      }).then(function (r) {
        return r.json().then(function (body) { return { status: r.status, body: body }; });
      });
    }

    // Pending-signup credentials live in sessionStorage so /verify can
    // hydrate them without forcing the user to retype their password.
    var PENDING_KEY = 'helvex.pending_signup';
    function rememberPendingSignup(email, password) {
      try {
        sessionStorage.setItem(PENDING_KEY, JSON.stringify({ email: clean(email), password: password, ts: Date.now() }));
      } catch (_) {}
    }
    function readPendingSignup(email) {
      try {
        var raw = sessionStorage.getItem(PENDING_KEY);
        if (!raw) return null;
        var obj = JSON.parse(raw);
        if (!obj || clean(obj.email) !== clean(email)) return null;
        if (Date.now() - (obj.ts || 0) > 30 * 60 * 1000) return null; // 30 min
        return obj;
      } catch (_) { return null; }
    }
    function clearPendingSignup() {
      try { sessionStorage.removeItem(PENDING_KEY); } catch (_) {}
    }

    // Page-to-page email persistence — survives URL param loss, refresh, etc.
    // The current "auth flow email" is the email the user is mid-flow on,
    // regardless of which page they're on (signup, verify, forgot, reset).
    var EMAIL_KEY = 'helvex.flow_email';
    HX.flowEmail = {
      set: function (email) {
        try { sessionStorage.setItem(EMAIL_KEY, clean(email)); } catch (_) {}
      },
      get: function () {
        try { return sessionStorage.getItem(EMAIL_KEY) || ''; } catch (_) { return ''; }
      },
      clear: function () { try { sessionStorage.removeItem(EMAIL_KEY); } catch (_) {} },
      // Resolve the active email for a page: URL ?email= param wins, then
      // sessionStorage, then null. Caller decides whether to redirect home.
      resolve: function () {
        var qp;
        try { qp = new URLSearchParams(window.location.search); } catch (_) { qp = null; }
        var fromUrl = qp ? clean(qp.get('email') || '') : '';
        if (fromUrl) { this.set(fromUrl); return fromUrl; }
        return this.get();
      }
    };

    HX.auth = {
      // ─── Signup: create user (admin) + email a HelveX 6-digit code via Resend
      signUp: function (email, password, meta) {
        var clean_email = clean(email);
        rememberPendingSignup(clean_email, password); // remember for /verify
        HX.flowEmail.set(clean_email);                // remember for any page
        return callOtp('send-signup', {
          email: clean_email, password: password, meta: meta || {}
        });
      },

      // ─── Verify the 6-digit signup code; the password is read from
      // sessionStorage (saved during signUp) so the Edge Function can
      // sign the user in immediately after confirmation.
      verifySignup: function (email, code) {
        var clean_email = clean(email);
        var pending = readPendingSignup(clean_email);
        var clean_code = String(code || '').replace(/\D+/g, '').slice(0, 6);
        return callOtp('verify-signup', {
          email: clean_email,
          code: clean_code,
          password: pending && pending.password ? pending.password : ''
        }).then(function (res) {
          if (res.status === 200 && res.body && res.body.session) {
            clearPendingSignup();
            return sb.auth.setSession({
              access_token:  res.body.session.access_token,
              refresh_token: res.body.session.refresh_token
            }).then(function () { return res; });
          }
          return res;
        });
      },

      // ─── Resend the signup OTP for the same email
      resendSignup: function (email) {
        var clean_email = clean(email);
        var pending = readPendingSignup(clean_email);
        if (!pending) return Promise.resolve({ status: 400, body: { error: 'pending_expired' } });
        return callOtp('send-signup', { email: clean_email, password: pending.password, meta: {} });
      },

      // ─── Email + password sign-in (after verification has completed).
      // We intentionally DO NOT log here — onAuthStateChange below sees
      // the SIGNED_IN event a moment later and logs it once. Logging in
      // both places would double-count every sign-in.
      signInPassword: function (email, password) {
        return sb.auth.signInWithPassword({ email: clean(email), password: password });
      },

      // ─── Social sign-in (Google / Apple / GitHub)
      signInOAuth: function (provider) {
        // The OAuth round-trip lands back on /dashboard; the audit log is
        // written on return by onAuthStateChange below — we can't log
        // before redirecting because the user isn't signed in yet here.
        return sb.auth.signInWithOAuth({
          provider: provider,
          options: { redirectTo: window.location.origin + '/dashboard' }
        });
      },

      // ─── Send the 6-digit password-reset code via Resend
      requestPasswordReset: function (email) {
        var clean_email = clean(email);
        HX.flowEmail.set(clean_email);                // remember for /reset-password
        return callOtp('send-recovery', { email: clean_email });
      },

      // ─── Verify the 6-digit recovery code → returns a one-shot recovery_token
      // that the page passes to setNewPasswordWithRecoveryToken().
      verifyRecovery: function (email, code) {
        return callOtp('verify-recovery', {
          email: clean(email),
          code:  String(code || '').replace(/\D+/g, '').slice(0, 6)
        });
      },

      // ─── Trade a recovery_token + new password for an authenticated session.
      setNewPasswordWithRecoveryToken: function (email, recoveryToken, newPassword) {
        return callOtp('set-new-password', {
          email: clean(email),
          recovery_token: String(recoveryToken || ''),
          new_password:   String(newPassword || '')
        }).then(function (res) {
          if (res.status === 200 && res.body && res.body.session) {
            return sb.auth.setSession({
              access_token:  res.body.session.access_token,
              refresh_token: res.body.session.refresh_token
            }).then(function () { return res; });
          }
          return res;
        });
      },

      // ─── (Legacy helper kept for backward compat — direct profile updates only)
      updatePassword: function (newPassword) {
        return sb.auth.updateUser({ password: newPassword });
      },

      session: function () { return sb.auth.getSession(); },
      user:    function () { return sb.auth.getUser(); },

      signOut: function () {
        // Log the sign-out BEFORE the actual call — once the session is
        // gone, log_event would 401.
        var logPromise;
        try {
          logPromise = sb.rpc('log_event', { p_kind: 'auth.signed_out', p_payload: {} });
        } catch (e) { logPromise = Promise.resolve(); }
        return Promise.resolve(logPromise)
          .catch(function () {})
          .then(function () { return sb.auth.signOut(); })
          .then(function () { window.location.replace('/signup'); });
      }
    };

    /* ---------- audit hook: log social sign-ins on return.
       Email/password sign-ins are already logged in signInPassword above;
       OAuth flows redirect away, so we hook into onAuthStateChange and
       log a SIGNED_IN event the first time per tab session — dedup'd via
       sessionStorage so page reloads don't spam the audit log.          */
    var SIGNIN_LOGGED_KEY = 'helvex.signin_logged_at';
    try {
      sb.auth.onAuthStateChange(function (event, session) {
        if (event !== 'SIGNED_IN' || !session) return;
        var marker;
        try { marker = sessionStorage.getItem(SIGNIN_LOGGED_KEY); } catch (e) {}
        // Already logged for this tab session — don't double-log on
        // reload or token refresh.
        if (marker) return;
        try { sessionStorage.setItem(SIGNIN_LOGGED_KEY, String(Date.now())); } catch (e) {}
        try {
          var provider = (session.user && session.user.app_metadata && session.user.app_metadata.provider) || 'email';
          sb.rpc('log_event', {
            p_kind: 'auth.signed_in',
            p_payload: { method: provider }
          });
        } catch (e) {}
      });
    } catch (e) {}

    /* ---------- session guard ---------- */
    var path = (window.location.pathname || '/').replace(/\/+$/, '') || '/';
    var isPublic = PUBLIC_PATHS.indexOf(path) !== -1;

    sb.auth.getSession().then(function (res) {
      var session = res && res.data ? res.data.session : null;
      // Authenticated user landing on /signup → bounce to /dashboard
      if (session && (path === '/signup' || path === '/signup.html')) {
        window.location.replace('/dashboard');
        return;
      }
      // Unauthenticated user on a protected page → bounce to /signup
      if (!session && !isPublic) {
        window.location.replace('/signup');
        return;
      }
      // Routing decision made, page is staying — let pages reveal smoothly
      // without a flash of unstyled content during the ~200 ms session check.
      document.documentElement.classList.add('hx-stayed');
      document.dispatchEvent(new CustomEvent('hx:auth-checked', { detail: { session: session } }));
    });

    // Wire the sidebar logout button (rendered by platform.js)
    function wireLogout() {
      document.querySelectorAll('[data-action="signout"], .hx-user-action[title="Sign out"]').forEach(function (el) {
        if (el.__hxBound) return;
        el.__hxBound = true;
        el.addEventListener('click', function (ev) {
          ev.preventDefault();
          HX.auth.signOut();
        });
      });
    }
    wireLogout();
    // re-wire after platform.js injects the shell
    setTimeout(wireLogout, 0);
    setTimeout(wireLogout, 250);

    document.dispatchEvent(new CustomEvent('hx:auth-ready'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { loadSdk(init); });
  } else {
    loadSdk(init);
  }
})();
