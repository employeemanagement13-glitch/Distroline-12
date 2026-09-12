export interface ReportFlagItem {
  key: string;
  label: string;
}

export interface PageFlagItem {
  key: string;
  label: string;
  path: string;
  reports?: ReportFlagItem[];
}

export interface TabFlagItem {
  id: number;
  key: string;
  label: string;
  pages: PageFlagItem[];
}

export const FEATURE_TABS_HIERARCHY: TabFlagItem[] = [
  {
    id: 0,
    key: "tab0",
    label: "Setup & Masters",
    pages: [
      { key: "page_shop_details", label: "Shop Directory", path: "/shop-details" },
      { key: "tab_product_catalogue", label: "Product Catalog", path: "/prerequisites/products" },
      { key: "page_dm_routes", label: "Routes & Vehicles", path: "/prerequisites/dm-routes" },
      { key: "page_discounts", label: "Discounts", path: "/prerequisites/discounts" },
    ],
  },
  {
    id: 1,
    key: "tab1",
    label: "Sales & Credit",
    pages: [
      { key: "page_transactions", label: "Sales Transactions", path: "/tab1/transactions" },
      { key: "page_promo_mgmt", label: "Promo Management", path: "/sales-credit/promo-management" },
      { key: "page_credit", label: "Credit Limits & Balances", path: "/tab2/credit" },
      { key: "page_blocked", label: "Blocked Accounts", path: "/tab2/blocked" },
    ],
  },
  {
    id: 2,
    key: "tab2",
    label: "Cash & Bank",
    pages: [
      { key: "page_deposits", label: "Cash Deposit Register", path: "/cash-bank/deposits" },
      { key: "page_bank_accounts", label: "Bank Accounts", path: "/cash-bank/bank-accounts" },
    ],
  },
  {
    id: 3,
    key: "tab3",
    label: "Inventory",
    pages: [
      { key: "page_warehouse", label: "Warehouse Stock", path: "/inventory/warehouse" },
      { key: "page_sell_in", label: "Sell In (CCBPL)", path: "/inventory/sell-in" },
    ],
  },
  {
    id: 4,
    key: "tab5",
    label: "Backups",
    pages: [
      { key: "page_backup", label: "Backup", path: "/tab5/backup" },
    ],
  },
  {
    id: 5,
    key: "tab7",
    label: "Reports & Alerts",
    pages: [
      {
        key: "page_stock_reports",
        label: "Stock Reports",
        path: "/inventory/stock-reports",
        reports: [
          { key: "tab_stock_ledger", label: "Stock Ledger" },
          { key: "tab_stock_balance_level", label: "Balance by Level" },
          { key: "tab_sale_purchase_summary", label: "Sale / Purchase Summary" },
        ],
      },
      {
        key: "tab_financial_reports",
        label: "Financial Reports",
        path: "/reports/financial",
        reports: [
          { key: "tab_wh_tax_summary", label: "WH Tax Summary" },
          { key: "tab_advance_tax_report", label: "Advance Tax" },
          { key: "tab_discount_report", label: "Additional Discounts" },
          { key: "tab_sales_summary", label: "Sales Summary" },
          { key: "tab_credit_summary", label: "Credit Summary" },
        ],
      },
      { key: "page_realtime_alerts", label: "Real-Time Alerts", path: "/tab7/alerts" },
    ],
  },
  {
    id: 6,
    key: "tab6",
    label: "Expenses",
    pages: [
      { key: "page_expenses_agency", label: "Agency Expenses", path: "/expenses/agency" },
      { key: "page_expenses_sheet", label: "Expense Sheet", path: "/expenses/sheet" },
    ],
  },
  {
    id: 7,
    key: "tab_income",
    label: "Income Management",
    pages: [
      { key: "page_income_margin", label: "Income Margin", path: "/income/margin" },
      { key: "page_income_statement", label: "Income Statement", path: "/income/statement" },
    ],
  },
  {
    id: 8,
    key: "tab_employee_mgmt",
    label: "Employee Management",
    pages: [
      { key: "page_employee_directory", label: "Employee Directory", path: "/employee-management/directory" },
      { key: "page_payroll_runs", label: "Payroll Runs", path: "/employee-management/payroll" },
      { key: "page_employee_loans", label: "Loans", path: "/employee-management/loans" },
    ],
  },
];

export function getAllHierarchyFlagKeys(): string[] {
  const keys: string[] = [];
  for (const t of FEATURE_TABS_HIERARCHY) {
    keys.push(t.key);
    for (const p of t.pages) {
      keys.push(p.key);
      if (p.reports) {
        for (const r of p.reports) {
          keys.push(r.key);
        }
      }
    }
  }
  return keys;
}
