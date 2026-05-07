/**
 * CreateX Credit System — Client-Side Module
 * ============================================
 * Loaded by every page that makes HelveX API calls.
 * Handles: balance checks, pre-deduction, post-cost reconciliation,
 * profit protection, and usage logging.
 *
 * Usage:
 *   <script src="credits.js"></script>
 *   const ok = await Credits.check('website_builder');
 *   if (!ok.allowed) { showBlockedUI(ok.reason); return; }
 *   const { logId } = await Credits.deduct('website_builder', estimatedCost);
 *   // ... run HelveX API call ...
 *   await Credits.reconcile(logId, realCost, inputTokens, outputTokens);
 */

(function (global) {
  'use strict';

  /* ─── Constants ──────────────────────────────────────────────── */
  const SUPABASE_URL  = 'https://ikbdhxobdjlwirydhxym.supabase.co';
  const SUPABASE_ANON = 'sb_publishable_chzlbY97SlQx_Apf4zqrTQ_mdwWhmyE';

  /* HelveX Prometheus pricing (USD per 1M tokens) */
  const MODEL_PRICING = {
    'claude-opus-4-5':    { input: 15.00, output: 75.00 },
    'claude-sonnet-4-5':  { input: 3.00,  output: 15.00 },
    'claude-haiku-3':     { input: 0.25,  output: 1.25  },
  };

  /* Service minimums (mirrors DB — used as local fallback) */
  const SERVICE_MINS = {
    cv_builder:      5,
    auto_apply:      10,
    agent_builder:   25,
    website_builder: 75,
    app_builder:     150,
  };

  /* Credit value: $0.10 per credit */
  const CREDIT_VALUE_USD = 0.10;
  const MARKUP_TARGET    = 2.5;
  const MARKUP_MINIMUM   = 2.0;

  /* ─── Internal helpers ───────────────────────────────────────── */
  function getSB() {
    return window.sb || null;
  }

  async function getSession() {
    const sb = getSB();
    if (!sb) return null;
    try {
      const { data } = await sb.auth.getSession();
      return data && data.session ? data.session : null;
    } catch (_) { return null; }
  }

  /**
   * Estimate HelveX API cost from token count.
   * @param {number} inputTokens
   * @param {number} outputTokens
   * @param {string} model
   * @returns {number} cost in USD
   */
  function estimateCostFromTokens(inputTokens, outputTokens, model) {
    const p = MODEL_PRICING[model] || MODEL_PRICING['claude-opus-4-5'];
    return (inputTokens / 1e6) * p.input + (outputTokens / 1e6) * p.output;
  }

  /**
   * Estimate tokens from prompt string length (rough: ~4 chars per token).
   * @param {string} prompt
   * @param {number} expectedOutputTokens
   * @returns {{ inputTokens, outputTokens, estimatedCost }}
   */
  function estimateFromPrompt(prompt, expectedOutputTokens, model) {
    model = model || 'claude-opus-4-5';
    const inputTokens  = Math.ceil((prompt || '').length / 4);
    const outputTokens = expectedOutputTokens || 1000;
    const cost         = estimateCostFromTokens(inputTokens, outputTokens, model);
    return { inputTokens, outputTokens, estimatedCost: cost };
  }

  /**
   * Calculate credits to charge.
   * Returns the HIGHER of: (markup × cost / creditValue) or service minimum.
   */
  function calcCredits(estimatedCostUsd, service) {
    const markup  = MARKUP_TARGET;
    const charged = Math.ceil((estimatedCostUsd * markup) / CREDIT_VALUE_USD);
    const minimum = SERVICE_MINS[service] || 5;
    return Math.max(charged, minimum);
  }

  /* ─── Public API ─────────────────────────────────────────────── */
  const Credits = {

    /**
     * Check if the current user can afford a service call.
     * DOES NOT deduct — call before showing the "Generate" UI.
     * @param {string} service  e.g. 'website_builder'
     * @param {number} [estimatedCostUsd]  optional pre-estimate
     * @returns {Promise<{allowed:boolean, balance:number, needed:number, reason?:string}>}
     */
    async check(service, estimatedCostUsd) {
      const session = await getSession();
      if (!session) return { allowed: false, reason: 'not_logged_in', balance: 0, needed: 0 };

      const sb = getSB();
      try {
        const { data, error } = await sb
          .from('user_credits')
          .select('balance, plan, subscription_status, monthly_spend_limit, current_month_spend_usd')
          .eq('user_id', session.user.id)
          .single();

        if (error || !data) return { allowed: false, reason: 'no_account', balance: 0, needed: 0 };

        const cost    = estimatedCostUsd || (SERVICE_MINS[service] || 5) * CREDIT_VALUE_USD;
        const needed  = calcCredits(cost, service);
        const balance = data.balance || 0;

        if (balance < needed) {
          return { allowed: false, reason: 'insufficient_credits', balance, needed };
        }

        /* Enterprise monthly spend cap */
        if (data.monthly_spend_limit > 0) {
          const projectedSpend = (data.current_month_spend_usd || 0) + needed * CREDIT_VALUE_USD;
          if (projectedSpend > data.monthly_spend_limit) {
            return { allowed: false, reason: 'monthly_spend_limit_reached', balance, needed };
          }
        }

        return { allowed: true, balance, needed };
      } catch (e) {
        console.error('[Credits.check]', e);
        return { allowed: false, reason: 'error', balance: 0, needed: 0 };
      }
    },

    /**
     * Atomically deduct credits via Supabase RPC (server-side, prevents cheating).
     * Call this IMMEDIATELY before launching the HelveX API request.
     * @returns {Promise<{ok:boolean, logId?:string, creditsCharged?:number, balanceAfter?:number, reason?:string}>}
     */
    async deduct(service, estimatedCostUsd, model, inputTokens, outputTokens) {
      const session = await getSession();
      if (!session) return { ok: false, reason: 'not_logged_in' };
      model        = model        || 'claude-opus-4-5';
      inputTokens  = inputTokens  || 0;
      outputTokens = outputTokens || 0;

      const sb = getSB();
      try {
        const { data, error } = await sb.rpc('deduct_credits', {
          p_user_id:        session.user.id,
          p_service:        service,
          p_estimated_cost: estimatedCostUsd || 0,
          p_model:          model,
          p_input_tokens:   inputTokens,
          p_output_tokens:  outputTokens,
        });

        if (error) {
          console.error('[Credits.deduct] RPC error:', error);
          return { ok: false, reason: 'rpc_error', detail: error.message };
        }

        if (!data.ok) {
          return { ok: false, reason: data.blocked_reason, balance: data.balance, needed: data.credits_needed };
        }

        /* Fetch the ID of the usage log row just inserted */
        const { data: logRow } = await sb
          .from('api_usage_log')
          .select('id')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        return {
          ok: true,
          logId: logRow ? logRow.id : null,
          creditsCharged: data.credits_charged,
          balanceAfter:   data.balance_after,
        };
      } catch (e) {
        console.error('[Credits.deduct]', e);
        return { ok: false, reason: 'exception', detail: e.message };
      }
    },

    /**
     * After HelveX streaming completes, update the log with real token counts & cost.
     * This reconciles the estimate vs. actual — charges extra credits if needed.
     * @param {string} logId
     * @param {number} realCostUsd
     * @param {number} inputTokens
     * @param {number} outputTokens
     */
    async reconcile(logId, realCostUsd, inputTokens, outputTokens) {
      if (!logId) return { ok: false, reason: 'no_log_id' };
      const session = await getSession();
      if (!session) return { ok: false, reason: 'not_logged_in' };

      const sb = getSB();
      try {
        const { data, error } = await sb.rpc('update_real_api_cost', {
          p_log_id:       logId,
          p_user_id:      session.user.id,
          p_real_cost_usd: realCostUsd,
          p_input_tokens:  inputTokens,
          p_output_tokens: outputTokens,
        });

        if (error) { console.error('[Credits.reconcile] RPC error:', error); return { ok: false }; }
        return data;
      } catch (e) {
        console.error('[Credits.reconcile]', e);
        return { ok: false };
      }
    },

    /**
     * Get current balance and plan stats.
     * @returns {Promise<{balance, monthly_used, plan, total_requests, subscription_status}>}
     */
    async getStats() {
      const session = await getSession();
      if (!session) return null;
      const sb = getSB();
      try {
        const { data, error } = await sb.rpc('get_user_stats', { p_user_id: session.user.id });
        if (error) throw error;
        return data;
      } catch (e) {
        console.error('[Credits.getStats]', e);
        return null;
      }
    },

    /**
     * Convenience: estimate cost + credits needed from a prompt string.
     * Use to show users "This will cost ~X credits" before they click Generate.
     */
    estimateFromPrompt,
    estimateCostFromTokens,
    calcCredits,

    /**
     * Show a standardised "blocked" UI based on the reason code.
     * Pass a container element or null to use alert().
     */
    showBlockedUI(reason, containerEl) {
      const messages = {
        insufficient_credits:      '⚡ Not enough credits. Buy more credits to continue.',
        monthly_spend_limit_reached: '⛔ Monthly spend limit reached. Increase your limit or wait until next month.',
        no_account:                '🔑 No account found. Please sign in.',
        not_logged_in:             '🔑 Please sign in to use AI features.',
        error:                     '⚠️ An error occurred checking your credits. Please try again.',
      };
      const msg = messages[reason] || `⚠️ Access blocked: ${reason}`;

      if (containerEl) {
        containerEl.innerHTML = `
          <div style="background:rgba(255,77,77,.08);border:1px solid rgba(255,77,77,.22);border-radius:12px;
               padding:18px 22px;color:#ff9191;font-size:14px;font-weight:700;display:flex;align-items:center;gap:12px;">
            <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            ${msg}
            ${reason === 'insufficient_credits' ? '<a href="billing.html" style="margin-left:auto;color:#18d7ff;text-decoration:underline;white-space:nowrap;">Buy Credits →</a>' : ''}
          </div>`;
      } else {
        alert(msg);
      }
    },

    /**
     * Calculate profit multiple (for display).
     */
    profitMultiple(userChargeUsd, realApiCostUsd) {
      if (!realApiCostUsd || realApiCostUsd <= 0) return null;
      return userChargeUsd / realApiCostUsd;
    },

    CREDIT_VALUE_USD,
    MARKUP_TARGET,
    MARKUP_MINIMUM,
    SERVICE_MINS,
    MODEL_PRICING,
  };

  /* ─── Inject credit badge into pages ─────────────────────────── */
  Credits.injectBalanceBadge = function (anchorEl) {
    if (!anchorEl) return;
    Credits.getStats().then(stats => {
      if (!stats) return;
      const badge = document.createElement('div');
      badge.id = 'credits-balance-badge';
      badge.style.cssText = `
        display:inline-flex;align-items:center;gap:7px;padding:7px 14px;
        background:rgba(24,215,255,.08);border:1px solid rgba(24,215,255,.22);
        border-radius:999px;font-size:12.5px;font-weight:800;color:#18d7ff;
        cursor:pointer;text-decoration:none;transition:.2s;
      `;
      badge.innerHTML = `
        <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M13 10V3L4 14h7v7l9-11h-7z"/>
        </svg>
        <span id="credits-badge-number">${stats.balance.toLocaleString()}</span> credits
      `;
      badge.onclick = () => { window.location.href = 'billing.html'; };
      badge.onmouseenter = () => { badge.style.background = 'rgba(24,215,255,.14)'; };
      badge.onmouseleave = () => { badge.style.background = 'rgba(24,215,255,.08)'; };
      anchorEl.insertBefore(badge, anchorEl.firstChild);
    });
  };

  /* Expose globally */
  global.Credits = Credits;

})(window);
