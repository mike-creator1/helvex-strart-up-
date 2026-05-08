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
    HX.auth = {
      // Send a 6-digit signup verification code.
      // emailRedirectTo points at /verify so that if the user clicks the
      // magic link in the email instead of typing the code, they still
      // land on the branded verification screen (not a raw redirect).
      signUp: function (email, password, meta) {
        var redirect = window.location.origin + '/verify?email=' +
          encodeURIComponent(String(email || '').trim().toLowerCase());
        return sb.auth.signUp({
          email: String(email || '').trim().toLowerCase(),
          password: password,
          options: {
            data: meta || {},
            emailRedirectTo: redirect
          }
        });
      },

      // Verify the 6-digit signup code → user becomes active and signed in
      verifySignup: function (email, token) {
        return sb.auth.verifyOtp({
          email: String(email || '').trim().toLowerCase(),
          token: String(token || '').replace(/\s+/g, ''),
          type: 'signup'
        });
      },

      // Resend the signup verification email
      resendSignup: function (email) {
        var clean = String(email || '').trim().toLowerCase();
        return sb.auth.resend({
          type: 'signup',
          email: clean,
          options: {
            emailRedirectTo: window.location.origin + '/verify?email=' + encodeURIComponent(clean)
          }
        });
      },

      // Email + password sign-in
      signInPassword: function (email, password) {
        return sb.auth.signInWithPassword({
          email: String(email || '').trim().toLowerCase(),
          password: password
        });
      },

      // Social sign-in (Google / Apple / GitHub)
      signInOAuth: function (provider) {
        return sb.auth.signInWithOAuth({
          provider: provider,
          options: {
            redirectTo: window.location.origin + '/dashboard'
          }
        });
      },

      // Send a 6-digit password-reset code
      requestPasswordReset: function (email) {
        return sb.auth.resetPasswordForEmail(
          String(email || '').trim().toLowerCase(),
          { redirectTo: window.location.origin + '/reset-password' }
        );
      },

      // Verify a 6-digit recovery code (logs user in for password change)
      verifyRecovery: function (email, token) {
        return sb.auth.verifyOtp({
          email: String(email || '').trim().toLowerCase(),
          token: String(token || '').replace(/\s+/g, ''),
          type: 'recovery'
        });
      },

      // Set new password for the currently authenticated user
      updatePassword: function (newPassword) {
        return sb.auth.updateUser({ password: newPassword });
      },

      // Get the current session (or null)
      session: function () { return sb.auth.getSession(); },

      // Get the currently signed-in user (or null)
      user: function () { return sb.auth.getUser(); },

      // Sign out + return to /signup
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
