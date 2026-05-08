/* ═══════════════════════════════════════════════════════════
   HelveX · Client Portal · Supabase auth integration
   - Initializes a single Supabase client (window.HX.supabase)
   - Exposes auth helpers (signUp, verify, signIn, OAuth, reset)
   - Mounts a session guard + logout for every authenticated page
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

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

    /* ---------- helpers ---------- */
    function callOtp(action, payload) {
      return fetch(OTP_FN_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'apikey': SUPABASE_PUBLISHABLE_KEY,
          'authorization': 'Bearer ' + SUPABASE_PUBLISHABLE_KEY
        },
        body: JSON.stringify(Object.assign({
          action: action,
          origin: window.location.origin
        }, payload || {}))
      }).then(function (r) {
        return r.json().then(function (body) { return { status: r.status, body: body }; });
      });
    }

    function clean(s) { return String(s || '').trim().toLowerCase(); }

    HX.auth = {
      // ─── Signup: hands over to the auth-otp Edge Function which creates
      // the user (unconfirmed) and emails a 6-digit code.
      signUp: function (email, password, meta) {
        return callOtp('send-signup', {
          email: clean(email), password: password, meta: meta || {}
        });
      },

      // ─── Verify the 6-digit signup code via Edge Function and hydrate
      // the resulting Supabase session into the local client.
      verifySignup: function (email, code) {
        return callOtp('verify-signup', { email: clean(email), code: String(code || '') })
          .then(function (res) {
            if (res.status !== 200 || !res.body || !res.body.session) return res;
            return sb.auth.setSession({
              access_token: res.body.session.access_token,
              refresh_token: res.body.session.refresh_token
            }).then(function () { return res; });
          });
      },

      // ─── Re-issue a signup code for the same email.
      resendSignup: function (email) {
        // For UX we ask the operator to re-enter their password before we
        // issue a new code. Calling /signup again from the UI handles that.
        // The OTP fn rotates active codes automatically.
        return Promise.resolve({ status: 200, body: { sent: true, hint: 'use_signup_form' } });
      },

      // ─── Email + password sign-in (after verification has completed)
      signInPassword: function (email, password) {
        return sb.auth.signInWithPassword({ email: clean(email), password: password });
      },

      // ─── Social sign-in (Google / Apple / GitHub)
      signInOAuth: function (provider) {
        return sb.auth.signInWithOAuth({
          provider: provider,
          options: { redirectTo: window.location.origin + '/dashboard' }
        });
      },

      // ─── Send a 6-digit password-reset code
      requestPasswordReset: function (email) {
        return callOtp('send-recovery', { email: clean(email) });
      },

      // ─── Verify a 6-digit recovery code → returns a recovery session
      verifyRecovery: function (email, code) {
        return callOtp('verify-recovery', { email: clean(email), code: String(code || '') })
          .then(function (res) {
            if (res.status !== 200 || !res.body || !res.body.session) return res;
            return sb.auth.setSession({
              access_token: res.body.session.access_token,
              refresh_token: res.body.session.refresh_token
            }).then(function () { return res; });
          });
      },

      // ─── Set new password for the currently authenticated user
      updatePassword: function (newPassword) {
        return sb.auth.updateUser({ password: newPassword });
      },

      session: function () { return sb.auth.getSession(); },
      user:    function () { return sb.auth.getUser(); },

      signOut: function () {
        return sb.auth.signOut().then(function () {
          window.location.replace('/signup');
        });
      }
    };

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
      }
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
