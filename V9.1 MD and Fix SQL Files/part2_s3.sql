
-- ============================================================================
-- S3. BANK ACCOUNTS (Blueprint 3.9, 8.1, 8.2)
-- ============================================================================

CREATE TABLE IF NOT EXISTS bank_accounts (
  id              UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID  NOT NULL DEFAULT current_tenant_id() REFERENCES tenants(id) ON DELETE CASCADE,
  bank_name       TEXT  NOT NULL,
  account_title   TEXT  NOT NULL,
  account_number  TEXT,
  current_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_tenant ON bank_accounts(tenant_id);
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bank_accounts_owner_all ON bank_accounts;
CREATE POLICY bank_accounts_owner_all ON bank_accounts FOR ALL
  TO authenticated
  USING  (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()))
  WITH CHECK (tenant_id = (SELECT current_tenant_id()) AND (SELECT is_tenant_enabled()));

ALTER TABLE cash_deposits
  ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL;
ALTER TABLE cash_deposits ADD COLUMN IF NOT EXISTS bank_ref_no TEXT;
CREATE INDEX IF NOT EXISTS idx_cash_deposits_bank_account
  ON cash_deposits(bank_account_id) WHERE bank_account_id IS NOT NULL;

