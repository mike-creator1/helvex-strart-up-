-- ═══════════════════════════════════════════════════════════════════
-- CreateX Billing & Credit System — Supabase Migration
-- Run this in the Supabase SQL editor: https://app.supabase.com
-- Project: ikbdhxobdjlwirydhxym
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. USER CREDITS (one row per user) ───────────────────────────
CREATE TABLE IF NOT EXISTS user_credits (
  user_id                 UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance                 INTEGER NOT NULL DEFAULT 0,
  monthly_used            INTEGER NOT NULL DEFAULT 0,
  monthly_reset_at        TIMESTAMPTZ DEFAULT (date_trunc('month', NOW()) + INTERVAL '1 month'),
  plan                    TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  subscription_status     TEXT DEFAULT 'inactive',
  auto_topup_enabled      BOOLEAN NOT NULL DEFAULT false,
  auto_topup_package      TEXT,           -- 'topup_1500' | 'topup_5000' | 'topup_12000'
  auto_topup_threshold    INTEGER DEFAULT 50,
  monthly_spend_limit     NUMERIC DEFAULT 0,
  current_month_spend_usd NUMERIC NOT NULL DEFAULT 0,
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_credits"    ON user_credits;
DROP POLICY IF EXISTS "users_update_own_settings" ON user_credits;
DROP POLICY IF EXISTS "service_full_credits"      ON user_credits;

CREATE POLICY "users_read_own_credits"    ON user_credits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_update_own_settings" ON user_credits FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "service_full_credits"      ON user_credits USING (auth.role() = 'service_role');

-- ── 2. CREDIT TRANSACTIONS (immutable ledger) ─────────────────────
CREATE TABLE IF NOT EXISTS credit_transactions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type                     TEXT NOT NULL CHECK (type IN (
                             'subscription_grant','credit_pack','usage',
                             'admin_adjustment','refund','auto_topup','monthly_reset')),
  credits                  INTEGER NOT NULL,
  balance_after            INTEGER NOT NULL,
  amount_usd               NUMERIC DEFAULT 0,
  description              TEXT,
  stripe_payment_intent_id TEXT,
  stripe_invoice_id        TEXT,
  idempotency_key          TEXT UNIQUE,
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_read_own_txn"  ON credit_transactions;
DROP POLICY IF EXISTS "service_full_txn"    ON credit_transactions;
CREATE POLICY "users_read_own_txn"  ON credit_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "service_full_txn"    ON credit_transactions USING (auth.role() = 'service_role');

-- ── 3. API USAGE LOG (every AI call) ─────────────────────────────
CREATE TABLE IF NOT EXISTS api_usage_log (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service                TEXT NOT NULL CHECK (service IN (
                           'cv_builder','auto_apply','agent_builder','website_builder','app_builder')),
  model                  TEXT NOT NULL DEFAULT 'prometheus-4-5',
  input_tokens           INTEGER NOT NULL DEFAULT 0,
  output_tokens          INTEGER NOT NULL DEFAULT 0,
  total_tokens           INTEGER NOT NULL DEFAULT 0,
  real_api_cost_usd      NUMERIC NOT NULL DEFAULT 0,
  estimated_api_cost_usd NUMERIC NOT NULL DEFAULT 0,
  credits_charged        INTEGER NOT NULL DEFAULT 0,
  user_charge_usd        NUMERIC NOT NULL DEFAULT 0,
  profit_usd             NUMERIC NOT NULL DEFAULT 0,
  profit_multiple        NUMERIC NOT NULL DEFAULT 0,
  markup_applied         NUMERIC NOT NULL DEFAULT 2.5,
  created_at             TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE api_usage_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_read_own_usage"  ON api_usage_log;
DROP POLICY IF EXISTS "service_full_usage"    ON api_usage_log;
DROP POLICY IF EXISTS "admin_read_all_usage"  ON api_usage_log;
CREATE POLICY "users_read_own_usage" ON api_usage_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "service_full_usage"   ON api_usage_log USING (auth.role() = 'service_role');
CREATE POLICY "admin_read_all_usage" ON api_usage_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_credits WHERE user_id = auth.uid() AND plan = 'admin'));

-- ── 4. PRICING CONFIG (admin-editable, single row) ───────────────
CREATE TABLE IF NOT EXISTS pricing_config (
  id                    INTEGER PRIMARY KEY DEFAULT 1,
  markup_target         NUMERIC NOT NULL DEFAULT 2.5,
  markup_minimum        NUMERIC NOT NULL DEFAULT 2.0,
  credit_value_usd      NUMERIC NOT NULL DEFAULT 0.10,
  plan_starter_credits  INTEGER NOT NULL DEFAULT 150,
  plan_pro_credits      INTEGER NOT NULL DEFAULT 400,
  plan_business_credits INTEGER NOT NULL DEFAULT 1000,
  plan_starter_price    NUMERIC NOT NULL DEFAULT 19,
  plan_pro_price        NUMERIC NOT NULL DEFAULT 39,
  plan_business_price   NUMERIC NOT NULL DEFAULT 79,
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pricing_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone_reads_pricing" ON pricing_config;
DROP POLICY IF EXISTS "service_edits_pricing" ON pricing_config;
CREATE POLICY "anyone_reads_pricing"  ON pricing_config FOR SELECT USING (true);
CREATE POLICY "service_edits_pricing" ON pricing_config USING (auth.role() = 'service_role');

INSERT INTO pricing_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── 5. SERVICE MINIMUMS (admin-editable) ─────────────────────────
CREATE TABLE IF NOT EXISTS service_minimums (
  service      TEXT PRIMARY KEY,
  min_credits  INTEGER NOT NULL,
  description  TEXT
);

ALTER TABLE service_minimums ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone_reads_minimums"  ON service_minimums;
DROP POLICY IF EXISTS "service_edits_minimums" ON service_minimums;
CREATE POLICY "anyone_reads_minimums"  ON service_minimums FOR SELECT USING (true);
CREATE POLICY "service_edits_minimums" ON service_minimums USING (auth.role() = 'service_role');

INSERT INTO service_minimums (service, min_credits, description) VALUES
  ('cv_builder',     5,   'CV Builder — minimum credits per AI request'),
  ('auto_apply',     10,  'Auto AI Apply — minimum credits per job application'),
  ('agent_builder',  25,  'AI Agent Builder — minimum credits per agent interaction'),
  ('website_builder',75,  'Website Builder — minimum credits per full generation'),
  ('app_builder',    150, 'App Builder — minimum credits per app generation')
ON CONFLICT (service) DO NOTHING;

-- ── 6. STRIPE PRODUCTS REGISTRY ──────────────────────────────────
CREATE TABLE IF NOT EXISTS stripe_products (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key               TEXT UNIQUE NOT NULL,
  stripe_product_id TEXT,
  stripe_price_id   TEXT,
  type              TEXT NOT NULL CHECK (type IN ('subscription','credit_pack','auto_topup')),
  plan              TEXT,
  credits           INTEGER,
  price_cents       INTEGER,
  interval_billing  TEXT,
  active            BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE stripe_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anyone_reads_stripe_products"  ON stripe_products;
DROP POLICY IF EXISTS "service_edits_stripe_products" ON stripe_products;
CREATE POLICY "anyone_reads_stripe_products"  ON stripe_products FOR SELECT USING (true);
CREATE POLICY "service_edits_stripe_products" ON stripe_products USING (auth.role() = 'service_role');

INSERT INTO stripe_products (key, type, plan, credits, price_cents, interval_billing) VALUES
  ('sub_starter',  'subscription', 'starter',   150,  1900, 'month'),
  ('sub_pro',      'subscription', 'pro',        400,  3900, 'month'),
  ('sub_business', 'subscription', 'business', 1000,  7900, 'month'),
  ('pack_100',     'credit_pack',  NULL,         100,  1000, NULL),
  ('pack_300',     'credit_pack',  NULL,         300,  2500, NULL),
  ('pack_700',     'credit_pack',  NULL,         700,  5000, NULL),
  ('pack_1500',    'credit_pack',  NULL,        1500,  9900, NULL),
  ('topup_1500',   'auto_topup',   NULL,        1500,  9900, NULL),
  ('topup_5000',   'auto_topup',   NULL,        5000, 29900, NULL),
  ('topup_12000',  'auto_topup',   NULL,       12000, 59900, NULL)
ON CONFLICT (key) DO NOTHING;

-- ── 7. AUTO TOP-UP LOG ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auto_topup_log (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credits_added            INTEGER NOT NULL,
  amount_usd               NUMERIC NOT NULL,
  stripe_payment_intent_id TEXT,
  triggered_at_balance     INTEGER,
  status                   TEXT DEFAULT 'pending' CHECK (status IN ('pending','completed','failed')),
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE auto_topup_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_read_own_topup"  ON auto_topup_log;
DROP POLICY IF EXISTS "service_full_topup"    ON auto_topup_log;
CREATE POLICY "users_read_own_topup" ON auto_topup_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "service_full_topup"   ON auto_topup_log USING (auth.role() = 'service_role');

-- ══════════════════════════════════════════════════════════════════
-- RPC FUNCTIONS
-- ══════════════════════════════════════════════════════════════════

-- deduct_credits: atomic, profit-safe credit deduction
CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id           UUID,
  p_service           TEXT,
  p_estimated_cost    NUMERIC,
  p_model             TEXT DEFAULT 'prometheus-4-5',
  p_input_tokens      INTEGER DEFAULT 0,
  p_output_tokens     INTEGER DEFAULT 0
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_config         pricing_config%ROWTYPE;
  v_min_credits    INTEGER;
  v_credits_needed INTEGER;
  v_user           user_credits%ROWTYPE;
  v_user_charge    NUMERIC;
  v_balance_after  INTEGER;
BEGIN
  SELECT * INTO v_config FROM pricing_config WHERE id = 1;
  SELECT min_credits INTO v_min_credits FROM service_minimums WHERE service = p_service;
  IF v_min_credits IS NULL THEN v_min_credits := 5; END IF;

  v_user_charge    := GREATEST(p_estimated_cost * v_config.markup_target,
                               p_estimated_cost * v_config.markup_minimum);
  v_credits_needed := GREATEST(v_min_credits,
                               CEIL(v_user_charge / v_config.credit_value_usd)::INTEGER);

  SELECT * INTO v_user FROM user_credits WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'blocked_reason', 'no_account');
  END IF;

  IF v_user.balance < v_credits_needed THEN
    RETURN json_build_object(
      'ok', false, 'blocked_reason', 'insufficient_credits',
      'credits_needed', v_credits_needed, 'balance', v_user.balance);
  END IF;

  IF v_user.monthly_spend_limit > 0 AND
     v_user.current_month_spend_usd + (v_credits_needed * v_config.credit_value_usd) > v_user.monthly_spend_limit THEN
    RETURN json_build_object('ok', false, 'blocked_reason', 'monthly_spend_limit_reached');
  END IF;

  v_balance_after := v_user.balance - v_credits_needed;

  UPDATE user_credits SET
    balance                 = v_balance_after,
    monthly_used            = monthly_used + v_credits_needed,
    current_month_spend_usd = current_month_spend_usd + (v_credits_needed * v_config.credit_value_usd),
    updated_at              = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO credit_transactions (user_id, type, credits, balance_after, amount_usd, description)
  VALUES (p_user_id, 'usage', -v_credits_needed, v_balance_after,
          v_credits_needed * v_config.credit_value_usd, 'AI usage: ' || p_service);

  INSERT INTO api_usage_log (
    user_id, service, model, input_tokens, output_tokens, total_tokens,
    estimated_api_cost_usd, credits_charged, user_charge_usd,
    profit_usd, profit_multiple, markup_applied
  ) VALUES (
    p_user_id, p_service, p_model, p_input_tokens, p_output_tokens,
    p_input_tokens + p_output_tokens, p_estimated_cost,
    v_credits_needed, v_credits_needed * v_config.credit_value_usd,
    (v_credits_needed * v_config.credit_value_usd) - p_estimated_cost,
    CASE WHEN p_estimated_cost > 0
         THEN (v_credits_needed * v_config.credit_value_usd) / p_estimated_cost
         ELSE 0 END,
    v_config.markup_target
  );

  RETURN json_build_object(
    'ok', true,
    'credits_charged', v_credits_needed,
    'balance_after', v_balance_after);
END;
$$;

-- add_credits: idempotent credit addition
CREATE OR REPLACE FUNCTION add_credits(
  p_user_id         UUID,
  p_credits         INTEGER,
  p_type            TEXT,
  p_description     TEXT DEFAULT NULL,
  p_amount_usd      NUMERIC DEFAULT 0,
  p_idempotency_key TEXT DEFAULT NULL,
  p_stripe_payment  TEXT DEFAULT NULL,
  p_stripe_invoice  TEXT DEFAULT NULL
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance_after INTEGER;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM credit_transactions WHERE idempotency_key = p_idempotency_key) THEN
      RETURN json_build_object('ok', true, 'skipped', true, 'reason', 'duplicate');
    END IF;
  END IF;

  INSERT INTO user_credits (user_id, balance, monthly_used)
  VALUES (p_user_id, 0, 0) ON CONFLICT (user_id) DO NOTHING;

  UPDATE user_credits SET balance = balance + p_credits, updated_at = NOW()
  WHERE user_id = p_user_id RETURNING balance INTO v_balance_after;

  INSERT INTO credit_transactions (
    user_id, type, credits, balance_after, amount_usd, description,
    stripe_payment_intent_id, stripe_invoice_id, idempotency_key)
  VALUES (
    p_user_id, p_type, p_credits, v_balance_after, p_amount_usd, p_description,
    p_stripe_payment, p_stripe_invoice, p_idempotency_key);

  RETURN json_build_object('ok', true, 'balance_after', v_balance_after);
END;
$$;

-- update_real_api_cost: post-streaming reconciliation
CREATE OR REPLACE FUNCTION update_real_api_cost(
  p_log_id        UUID,
  p_user_id       UUID,
  p_real_cost_usd NUMERIC,
  p_input_tokens  INTEGER,
  p_output_tokens INTEGER
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_config        pricing_config%ROWTYPE;
  v_log           api_usage_log%ROWTYPE;
  v_extra_credits INTEGER DEFAULT 0;
  v_user_balance  INTEGER;
  v_required_credits INTEGER;
  v_required_charge NUMERIC;
BEGIN
  SELECT * INTO v_config FROM pricing_config WHERE id = 1;
  SELECT * INTO v_log FROM api_usage_log WHERE id = p_log_id AND user_id = p_user_id;
  IF NOT FOUND THEN RETURN json_build_object('ok', false, 'reason', 'log_not_found'); END IF;

  v_required_charge  := GREATEST(p_real_cost_usd * v_config.markup_target,
                                  p_real_cost_usd * v_config.markup_minimum);
  v_required_credits := GREATEST(0, CEIL(v_required_charge / v_config.credit_value_usd)::INTEGER
                                  - v_log.credits_charged);

  IF v_required_credits > 0 THEN
    SELECT balance INTO v_user_balance FROM user_credits WHERE user_id = p_user_id FOR UPDATE;
    IF v_user_balance >= v_required_credits THEN
      UPDATE user_credits SET
        balance      = balance - v_required_credits,
        monthly_used = monthly_used + v_required_credits
      WHERE user_id = p_user_id;
      v_extra_credits := v_required_credits;
    END IF;
  END IF;

  UPDATE api_usage_log SET
    real_api_cost_usd = p_real_cost_usd,
    input_tokens      = p_input_tokens,
    output_tokens     = p_output_tokens,
    total_tokens      = p_input_tokens + p_output_tokens,
    credits_charged   = credits_charged + v_extra_credits,
    user_charge_usd   = (credits_charged + v_extra_credits) * v_config.credit_value_usd,
    profit_usd        = ((credits_charged + v_extra_credits) * v_config.credit_value_usd) - p_real_cost_usd,
    profit_multiple   = CASE WHEN p_real_cost_usd > 0
                         THEN ((credits_charged + v_extra_credits) * v_config.credit_value_usd) / p_real_cost_usd
                         ELSE 0 END
  WHERE id = p_log_id;

  RETURN json_build_object('ok', true, 'extra_credits_charged', v_extra_credits);
END;
$$;

-- get_user_stats: dashboard summary
CREATE OR REPLACE FUNCTION get_user_stats(p_user_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_credits       user_credits%ROWTYPE;
  v_total_spent   NUMERIC;
  v_total_req     INTEGER;
  v_config        pricing_config%ROWTYPE;
  v_plan_credits  INTEGER;
BEGIN
  SELECT * INTO v_credits FROM user_credits WHERE user_id = p_user_id;
  SELECT * INTO v_config  FROM pricing_config WHERE id = 1;

  SELECT COALESCE(SUM(ABS(amount_usd)), 0), COALESCE(COUNT(*), 0)
  INTO v_total_spent, v_total_req
  FROM credit_transactions WHERE user_id = p_user_id AND type = 'usage';

  v_plan_credits := CASE v_credits.plan
    WHEN 'starter'  THEN v_config.plan_starter_credits
    WHEN 'pro'      THEN v_config.plan_pro_credits
    WHEN 'business' THEN v_config.plan_business_credits
    ELSE 0 END;

  RETURN json_build_object(
    'balance',               COALESCE(v_credits.balance, 0),
    'monthly_used',          COALESCE(v_credits.monthly_used, 0),
    'plan',                  COALESCE(v_credits.plan, 'free'),
    'plan_credits',          v_plan_credits,
    'total_spent_usd',       v_total_spent,
    'total_requests',        v_total_req,
    'subscription_status',   COALESCE(v_credits.subscription_status, 'inactive'),
    'auto_topup_enabled',    COALESCE(v_credits.auto_topup_enabled, false),
    'current_month_spend_usd', COALESCE(v_credits.current_month_spend_usd, 0),
    'monthly_spend_limit',   COALESCE(v_credits.monthly_spend_limit, 0),
    'stripe_customer_id',    v_credits.stripe_customer_id,
    'monthly_reset_at',      v_credits.monthly_reset_at
  );
END;
$$;

-- admin_get_profit_report: admin only
CREATE OR REPLACE FUNCTION admin_get_profit_report()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  SELECT plan = 'admin' INTO v_is_admin FROM user_credits WHERE user_id = auth.uid();
  IF NOT v_is_admin THEN RETURN json_build_object('ok', false, 'reason', 'unauthorized'); END IF;

  RETURN (
    SELECT json_build_object(
      'ok',                  true,
      'total_revenue_usd',   ROUND(SUM(user_charge_usd)::NUMERIC, 2),
      'total_api_cost_usd',  ROUND(SUM(real_api_cost_usd)::NUMERIC, 4),
      'total_profit_usd',    ROUND(SUM(profit_usd)::NUMERIC, 2),
      'avg_profit_multiple', ROUND(AVG(profit_multiple)::NUMERIC, 2),
      'total_requests',      COUNT(*),
      'requests_below_2x',   SUM(CASE WHEN profit_multiple > 0 AND profit_multiple < 2 THEN 1 ELSE 0 END),
      'requests_below_2_5x', SUM(CASE WHEN profit_multiple >= 2 AND profit_multiple < 2.5 THEN 1 ELSE 0 END),
      'by_service', (
        SELECT json_agg(row_to_json(s)) FROM (
          SELECT service,
            COUNT(*)                           AS requests,
            SUM(credits_charged)               AS credits_used,
            ROUND(SUM(user_charge_usd)::NUMERIC, 2)    AS revenue_usd,
            ROUND(SUM(real_api_cost_usd)::NUMERIC, 4)  AS api_cost_usd,
            ROUND(SUM(profit_usd)::NUMERIC, 2)         AS profit_usd,
            ROUND(AVG(profit_multiple)::NUMERIC, 2)    AS avg_multiple
          FROM api_usage_log GROUP BY service ORDER BY revenue_usd DESC
        ) s
      )
    ) FROM api_usage_log
  );
END;
$$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_credit_txn_user  ON credit_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_log_user   ON api_usage_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_log_service ON api_usage_log(service, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_credits_stripe ON user_credits(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_user_credits_plan   ON user_credits(plan);
