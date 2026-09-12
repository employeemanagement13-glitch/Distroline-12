"use client";

import { Document, Page, pdf, StyleSheet, Text, View } from "@react-pdf/renderer";
import { FileSpreadsheet, Printer } from "lucide-react";
import { useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/Button";

export interface PromoRowExport {
  id?: string;
  outlet_code: string;
  shop_name: string;
  invoice_no: string;
  invoice_date: string;
  col_01_trade_discount: number;
  col_58_cross_promotion: number;
  col_59_additional_trade: number;
  col_63_distributor: number;
  col_68_trade_promotions: number;
  col_utc_discount?: number;
  row_total: number;
}

export interface PromoShopGroupExport {
  outletCode: string;
  shopName: string;
  invoices: PromoRowExport[];
  totals: {
    col_01: number;
    col_58: number;
    col_59: number;
    col_63: number;
    col_68: number;
    col_utc: number;
    grand: number;
  };
  shopTotal: number;
}

export interface PromoExportButtonsProps {
  groups: PromoShopGroupExport[];
  hasUtc?: boolean;
  fromDate?: string;
  toDate?: string;
  filename?: string;
}

const styles = StyleSheet.create({
  page: {
    padding: 20,
    fontFamily: "Helvetica",
    backgroundColor: "#ffffff",
    fontSize: 8,
    color: "#18181b",
  },
  headerContainer: {
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 6,
  },
  title: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#0f172a",
    marginBottom: 3,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 8,
    color: "#64748b",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#1e3a8a",
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontWeight: "bold",
    fontSize: 7.5,
    color: "#ffffff",
  },
  colInvoiceNo: { width: "14%", paddingLeft: 3 },
  colDate: { width: "10%", paddingLeft: 3 },
  col01: { width: "12%", textAlign: "right", paddingRight: 4 },
  col58: { width: "13%", textAlign: "right", paddingRight: 4 },
  col59: { width: "13%", textAlign: "right", paddingRight: 4 },
  col63: { width: "13%", textAlign: "right", paddingRight: 4 },
  col68: { width: "13%", textAlign: "right", paddingRight: 4 },
  colTotal: { width: "12%", textAlign: "right", paddingRight: 4 },

  colInvoiceNoUtc: { width: "13%", paddingLeft: 3 },
  colDateUtc: { width: "9%", paddingLeft: 3 },
  col01Utc: { width: "11%", textAlign: "right", paddingRight: 3 },
  col58Utc: { width: "11%", textAlign: "right", paddingRight: 3 },
  col59Utc: { width: "11%", textAlign: "right", paddingRight: 3 },
  col63Utc: { width: "11%", textAlign: "right", paddingRight: 3 },
  col68Utc: { width: "11%", textAlign: "right", paddingRight: 3 },
  colUtc: { width: "11%", textAlign: "right", paddingRight: 3 },
  colTotalUtc: { width: "12%", textAlign: "right", paddingRight: 3 },

  shopContainer: {
    marginTop: 6,
    marginBottom: 3,
  },
  shopHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderLeftWidth: 3,
    borderLeftColor: "#1e3a8a",
    borderTopWidth: 0.5,
    borderTopColor: "#cbd5e1",
    borderRightWidth: 0.5,
    borderRightColor: "#cbd5e1",
    borderBottomWidth: 0.5,
    borderBottomColor: "#cbd5e1",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  shopTitle: {
    fontSize: 8.5,
    fontWeight: "bold",
    color: "#1e3a8a",
  },
  invoiceRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
    paddingVertical: 3.5,
    paddingHorizontal: 4,
    alignItems: "center",
    fontSize: 7.5,
  },
  invoiceNoText: {
    fontWeight: "bold",
    color: "#334155",
    fontFamily: "Courier",
  },
  dateText: {
    color: "#64748b",
    fontFamily: "Courier",
  },
  cellNum: {
    fontFamily: "Courier",
    color: "#0f172a",
  },
  cellNumMuted: {
    fontFamily: "Courier",
    color: "#94a3b8",
  },
  cellNumBold: {
    fontFamily: "Courier",
    fontWeight: "bold",
    color: "#0f172a",
  },

  shopBreakdownRow: {
    flexDirection: "row",
    backgroundColor: "#fff7ed",
    borderTopWidth: 0.5,
    borderTopColor: "#fed7aa",
    borderBottomWidth: 0.5,
    borderBottomColor: "#fed7aa",
    paddingVertical: 3.5,
    paddingHorizontal: 4,
    alignItems: "center",
    fontSize: 7.5,
    fontWeight: "bold",
  },
  breakdownLabel: {
    width: "24%",
    textAlign: "right",
    paddingRight: 6,
    color: "#c2410c",
    fontWeight: "bold",
  },
  breakdownLabelUtc: {
    width: "22%",
    textAlign: "right",
    paddingRight: 6,
    color: "#c2410c",
    fontWeight: "bold",
  },
  breakdownNum: {
    fontFamily: "Courier",
    fontWeight: "bold",
    color: "#c2410c",
  },

  shopSummaryRow: {
    flexDirection: "row",
    backgroundColor: "#fff0f0",
    borderBottomWidth: 0.5,
    borderBottomColor: "#fecdd3",
    paddingVertical: 3.5,
    paddingHorizontal: 4,
    alignItems: "center",
    fontSize: 7.5,
  },
  shopSummaryLabel: {
    width: "88%",
    textAlign: "right",
    paddingRight: 6,
    color: "#991b1b",
    fontWeight: "bold",
  },
  shopSummaryTotal: {
    width: "12%",
    textAlign: "right",
    paddingRight: 4,
    fontFamily: "Courier",
    fontWeight: "bold",
    color: "#991b1b",
  },

  grandTotalRow: {
    flexDirection: "row",
    backgroundColor: "#1e3a8a",
    paddingVertical: 5,
    paddingHorizontal: 4,
    alignItems: "center",
    marginTop: 8,
    fontSize: 8,
    fontWeight: "bold",
    color: "#ffffff",
  },
  grandTotalLabel: {
    width: "24%",
    textAlign: "right",
    paddingRight: 6,
    color: "#ffffff",
    fontWeight: "bold",
  },
  grandTotalLabelUtc: {
    width: "22%",
    textAlign: "right",
    paddingRight: 6,
    color: "#ffffff",
    fontWeight: "bold",
  },
  grandTotalNum: {
    fontFamily: "Courier",
    fontWeight: "bold",
    color: "#ffffff",
  },
});

function fmtCurrency(val: number) {
  return `Rs. ${Number(val || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtNum(val: number): string {
  if (!val || Math.abs(val) < 0.001) return "—";
  return Number(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtTotalNum(val: number): string {
  return Number(val || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateDisplay(raw: string): string {
  if (!raw) return "";
  const parts = raw.split("T")[0];
  const dashParts = parts.split("-");
  if (dashParts.length === 3 && dashParts[0].length === 4) {
    return `${dashParts[2]}/${dashParts[1]}/${dashParts[0]}`;
  }
  return raw;
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function PromoPdfDocument({
  groups,
  hasUtc = false,
  fromDate,
  toDate,
}: {
  groups: PromoShopGroupExport[];
  hasUtc?: boolean;
  fromDate?: string;
  toDate?: string;
}) {
  const totShops = groups.length;
  const totInvoices = groups.reduce((sum, g) => sum + g.invoices.length, 0);
  const grandTotal = groups.reduce((sum, g) => sum + g.totals.grand, 0);

  const grandTotals = groups.reduce(
    (acc, g) => ({
      col_01: acc.col_01 + g.totals.col_01,
      col_58: acc.col_58 + g.totals.col_58,
      col_59: acc.col_59 + g.totals.col_59,
      col_63: acc.col_63 + g.totals.col_63,
      col_68: acc.col_68 + g.totals.col_68,
      col_utc: acc.col_utc + g.totals.col_utc,
      grand: acc.grand + g.totals.grand,
    }),
    { col_01: 0, col_58: 0, col_59: 0, col_63: 0, col_68: 0, col_utc: 0, grand: 0 }
  );

  const filterText =
    fromDate && toDate
      ? `${formatDateDisplay(fromDate)} to ${formatDateDisplay(toDate)}`
      : fromDate
      ? `From ${formatDateDisplay(fromDate)}`
      : toDate
      ? `To ${formatDateDisplay(toDate)}`
      : "All Dates";

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.headerContainer}>
          <Text style={styles.title}>Promo Summary Report</Text>
          <View style={styles.metaRow}>
            <Text>Date: {filterText}</Text>
            <Text>
              Shops: {totShops}  |  Invoices: {totInvoices}  |  Total Discount: {fmtCurrency(grandTotal)}
            </Text>
          </View>
        </View>

        {!hasUtc ? (
          <View style={styles.tableHeader} fixed>
            <Text style={styles.colInvoiceNo}>INVOICE NO</Text>
            <Text style={styles.colDate}>DATE</Text>
            <Text style={styles.col01}>01 TRADE</Text>
            <Text style={styles.col58}>58 CROSS PROMO</Text>
            <Text style={styles.col59}>59 ADD. TRADE</Text>
            <Text style={styles.col63}>63 DIST. PROMO</Text>
            <Text style={styles.col68}>68 TRADE PROMO</Text>
            <Text style={styles.colTotal}>TOTAL</Text>
          </View>
        ) : (
          <View style={styles.tableHeader} fixed>
            <Text style={styles.colInvoiceNoUtc}>INVOICE NO</Text>
            <Text style={styles.colDateUtc}>DATE</Text>
            <Text style={styles.col01Utc}>01 TRADE</Text>
            <Text style={styles.col58Utc}>58 CROSS</Text>
            <Text style={styles.col59Utc}>59 ADD. TRADE</Text>
            <Text style={styles.col63Utc}>63 DIST. PROMO</Text>
            <Text style={styles.col68Utc}>68 TRADE PROMO</Text>
            <Text style={styles.colUtc}>UTC DISCOUNT</Text>
            <Text style={styles.colTotalUtc}>TOTAL</Text>
          </View>
        )}

        {groups.map((g, gi) => (
          <View key={`shop-group-${gi}`} style={styles.shopContainer}>
            <View style={styles.shopHeader} wrap={false}>
              <Text style={styles.shopTitle}>
                {g.outletCode} — {g.shopName}
              </Text>
            </View>

            {g.invoices.map((inv, ii) => (
              <View key={`inv-${gi}-${ii}`} style={styles.invoiceRow} wrap={false}>
                {!hasUtc ? (
                  <>
                    <Text style={[styles.colInvoiceNo, styles.invoiceNoText]}>{inv.invoice_no}</Text>
                    <Text style={[styles.colDate, styles.dateText]}>{formatDateDisplay(inv.invoice_date)}</Text>
                    <Text style={[styles.col01, inv.col_01_trade_discount > 0 ? styles.cellNum : styles.cellNumMuted]}>
                      {fmtNum(inv.col_01_trade_discount)}
                    </Text>
                    <Text style={[styles.col58, inv.col_58_cross_promotion > 0 ? styles.cellNum : styles.cellNumMuted]}>
                      {fmtNum(inv.col_58_cross_promotion)}
                    </Text>
                    <Text style={[styles.col59, inv.col_59_additional_trade > 0 ? styles.cellNum : styles.cellNumMuted]}>
                      {fmtNum(inv.col_59_additional_trade)}
                    </Text>
                    <Text style={[styles.col63, inv.col_63_distributor > 0 ? styles.cellNum : styles.cellNumMuted]}>
                      {fmtNum(inv.col_63_distributor)}
                    </Text>
                    <Text style={[styles.col68, inv.col_68_trade_promotions > 0 ? styles.cellNum : styles.cellNumMuted]}>
                      {fmtNum(inv.col_68_trade_promotions)}
                    </Text>
                    <Text style={[styles.colTotal, styles.cellNumBold]}>
                      {fmtTotalNum(inv.row_total)}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.colInvoiceNoUtc, styles.invoiceNoText]}>{inv.invoice_no}</Text>
                    <Text style={[styles.colDateUtc, styles.dateText]}>{formatDateDisplay(inv.invoice_date)}</Text>
                    <Text style={[styles.col01Utc, inv.col_01_trade_discount > 0 ? styles.cellNum : styles.cellNumMuted]}>
                      {fmtNum(inv.col_01_trade_discount)}
                    </Text>
                    <Text style={[styles.col58Utc, inv.col_58_cross_promotion > 0 ? styles.cellNum : styles.cellNumMuted]}>
                      {fmtNum(inv.col_58_cross_promotion)}
                    </Text>
                    <Text style={[styles.col59Utc, inv.col_59_additional_trade > 0 ? styles.cellNum : styles.cellNumMuted]}>
                      {fmtNum(inv.col_59_additional_trade)}
                    </Text>
                    <Text style={[styles.col63Utc, inv.col_63_distributor > 0 ? styles.cellNum : styles.cellNumMuted]}>
                      {fmtNum(inv.col_63_distributor)}
                    </Text>
                    <Text style={[styles.col68Utc, inv.col_68_trade_promotions > 0 ? styles.cellNum : styles.cellNumMuted]}>
                      {fmtNum(inv.col_68_trade_promotions)}
                    </Text>
                    <Text style={[styles.colUtc, (inv.col_utc_discount || 0) > 0 ? styles.cellNum : styles.cellNumMuted]}>
                      {fmtNum(inv.col_utc_discount || 0)}
                    </Text>
                    <Text style={[styles.colTotalUtc, styles.cellNumBold]}>
                      {fmtTotalNum(inv.row_total)}
                    </Text>
                  </>
                )}
              </View>
            ))}

            <View style={styles.shopBreakdownRow} wrap={false}>
              {!hasUtc ? (
                <>
                  <Text style={styles.breakdownLabel}>Total</Text>
                  <Text style={[styles.col01, styles.breakdownNum]}>{fmtNum(g.totals.col_01)}</Text>
                  <Text style={[styles.col58, styles.breakdownNum]}>{fmtNum(g.totals.col_58)}</Text>
                  <Text style={[styles.col59, styles.breakdownNum]}>{fmtNum(g.totals.col_59)}</Text>
                  <Text style={[styles.col63, styles.breakdownNum]}>{fmtNum(g.totals.col_63)}</Text>
                  <Text style={[styles.col68, styles.breakdownNum]}>{fmtNum(g.totals.col_68)}</Text>
                  <Text style={[styles.colTotal, styles.breakdownNum]}>{fmtTotalNum(g.totals.grand)}</Text>
                </>
              ) : (
                <>
                  <Text style={styles.breakdownLabelUtc}>Total</Text>
                  <Text style={[styles.col01Utc, styles.breakdownNum]}>{fmtNum(g.totals.col_01)}</Text>
                  <Text style={[styles.col58Utc, styles.breakdownNum]}>{fmtNum(g.totals.col_58)}</Text>
                  <Text style={[styles.col59Utc, styles.breakdownNum]}>{fmtNum(g.totals.col_59)}</Text>
                  <Text style={[styles.col63Utc, styles.breakdownNum]}>{fmtNum(g.totals.col_63)}</Text>
                  <Text style={[styles.col68Utc, styles.breakdownNum]}>{fmtNum(g.totals.col_68)}</Text>
                  <Text style={[styles.colUtc, styles.breakdownNum]}>{fmtNum(g.totals.col_utc)}</Text>
                  <Text style={[styles.colTotalUtc, styles.breakdownNum]}>{fmtTotalNum(g.totals.grand)}</Text>
                </>
              )}
            </View>

            <View style={styles.shopSummaryRow} wrap={false}>
              <Text style={styles.shopSummaryLabel}>
                Shop Total ({g.outletCode} — {g.shopName}):
              </Text>
              <Text style={styles.shopSummaryTotal}>
                {fmtTotalNum(g.shopTotal)}
              </Text>
            </View>
          </View>
        ))}

        <View style={styles.grandTotalRow} wrap={false}>
          {!hasUtc ? (
            <>
              <Text style={styles.grandTotalLabel}>Grand Total</Text>
              <Text style={[styles.col01, styles.grandTotalNum]}>{fmtNum(grandTotals.col_01)}</Text>
              <Text style={[styles.col58, styles.grandTotalNum]}>{fmtNum(grandTotals.col_58)}</Text>
              <Text style={[styles.col59, styles.grandTotalNum]}>{fmtNum(grandTotals.col_59)}</Text>
              <Text style={[styles.col63, styles.grandTotalNum]}>{fmtNum(grandTotals.col_63)}</Text>
              <Text style={[styles.col68, styles.grandTotalNum]}>{fmtNum(grandTotals.col_68)}</Text>
              <Text style={[styles.colTotal, styles.grandTotalNum]}>{fmtTotalNum(grandTotals.grand)}</Text>
            </>
          ) : (
            <>
              <Text style={styles.grandTotalLabelUtc}>Grand Total</Text>
              <Text style={[styles.col01Utc, styles.grandTotalNum]}>{fmtNum(grandTotals.col_01)}</Text>
              <Text style={[styles.col58Utc, styles.grandTotalNum]}>{fmtNum(grandTotals.col_58)}</Text>
              <Text style={[styles.col59Utc, styles.grandTotalNum]}>{fmtNum(grandTotals.col_59)}</Text>
              <Text style={[styles.col63Utc, styles.grandTotalNum]}>{fmtNum(grandTotals.col_63)}</Text>
              <Text style={[styles.col68Utc, styles.grandTotalNum]}>{fmtNum(grandTotals.col_68)}</Text>
              <Text style={[styles.colUtc, styles.grandTotalNum]}>{fmtNum(grandTotals.col_utc)}</Text>
              <Text style={[styles.colTotalUtc, styles.grandTotalNum]}>{fmtTotalNum(grandTotals.grand)}</Text>
            </>
          )}
        </View>
      </Page>
    </Document>
  );
}

export function PromoExportButtons({
  groups,
  hasUtc = false,
  fromDate,
  toDate,
  filename,
}: PromoExportButtonsProps) {
  const [pdfProgress, setPdfProgress] = useState<string | null>(null);

  const defaultBaseName =
    fromDate && toDate
      ? `promo_summary_${fromDate}_to_${toDate}`
      : fromDate
      ? `promo_summary_${fromDate}`
      : "promo_summary_report";

  const baseName = sanitizeFileName(filename ? filename.replace(/\.(pdf|xlsx)$/i, "") : defaultBaseName);

  const handleExportPdf = async () => {
    if (!groups || !groups.length) return;
    setPdfProgress("Preparing PDF...");

    try {
      const blob = await pdf(
        <PromoPdfDocument
          groups={groups}
          hasUtc={hasUtc}
          fromDate={fromDate}
          toDate={toDate}
        />
      ).toBlob();
      downloadBlob(blob, `${baseName}.pdf`);
    } catch (err: any) {
      alert("Failed to generate PDF: " + (err.message || String(err)));
    } finally {
      setPdfProgress(null);
    }
  };

  const handleExportExcel = () => {
    if (!groups || !groups.length) return;

    const totShops = groups.length;
    const totInvoices = groups.reduce((sum, g) => sum + g.invoices.length, 0);
    const grandTotal = groups.reduce((sum, g) => sum + g.totals.grand, 0);

    const grandTotals = groups.reduce(
      (acc, g) => ({
        col_01: acc.col_01 + g.totals.col_01,
        col_58: acc.col_58 + g.totals.col_58,
        col_59: acc.col_59 + g.totals.col_59,
        col_63: acc.col_63 + g.totals.col_63,
        col_68: acc.col_68 + g.totals.col_68,
        col_utc: acc.col_utc + g.totals.col_utc,
        grand: acc.grand + g.totals.grand,
      }),
      { col_01: 0, col_58: 0, col_59: 0, col_63: 0, col_68: 0, col_utc: 0, grand: 0 }
    );

    const totalCols = hasUtc ? 9 : 8;
    const aoa: (string | number)[][] = [];
    const merges: XLSX.Range[] = [];

    aoa.push(["Promo Summary Report", ...Array(totalCols - 1).fill("")]);
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } });

    const filterText =
      fromDate && toDate
        ? `${formatDateDisplay(fromDate)} to ${formatDateDisplay(toDate)}`
        : fromDate
        ? `From ${formatDateDisplay(fromDate)}`
        : toDate
        ? `To ${formatDateDisplay(toDate)}`
        : "All Dates";

    aoa.push([`Date Filter: ${filterText}`, ...Array(totalCols - 1).fill("")]);
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } });

    aoa.push([
      `Total Shops: ${totShops}   |   Total Invoices: ${totInvoices}   |   Total Discount: ${fmtCurrency(grandTotal)}`,
      ...Array(totalCols - 1).fill(""),
    ]);
    merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: totalCols - 1 } });

    aoa.push([]);

    const headers = [
      "Invoice No",
      "Date",
      "01 HTH-Trade Discount",
      "58 Cross Promotion",
      "59 Additional Trade Promotions",
      "63 Distributor Promotion",
      "68 Trade Promotions",
      ...(hasUtc ? ["UTC Discount"] : []),
      "Total",
    ];
    aoa.push(headers);

    for (const g of groups) {
      const shopRowIdx = aoa.length;
      aoa.push([`${g.outletCode} — ${g.shopName}`, ...Array(totalCols - 1).fill("")]);
      merges.push({ s: { r: shopRowIdx, c: 0 }, e: { r: shopRowIdx, c: totalCols - 1 } });

      for (const inv of g.invoices) {
        if (!hasUtc) {
          aoa.push([
            inv.invoice_no,
            formatDateDisplay(inv.invoice_date),
            inv.col_01_trade_discount || 0,
            inv.col_58_cross_promotion || 0,
            inv.col_59_additional_trade || 0,
            inv.col_63_distributor || 0,
            inv.col_68_trade_promotions || 0,
            inv.row_total,
          ]);
        } else {
          aoa.push([
            inv.invoice_no,
            formatDateDisplay(inv.invoice_date),
            inv.col_01_trade_discount || 0,
            inv.col_58_cross_promotion || 0,
            inv.col_59_additional_trade || 0,
            inv.col_63_distributor || 0,
            inv.col_68_trade_promotions || 0,
            inv.col_utc_discount || 0,
            inv.row_total,
          ]);
        }
      }

      const totalRowIdx = aoa.length;
      if (!hasUtc) {
        aoa.push([
          "Total",
          "",
          g.totals.col_01,
          g.totals.col_58,
          g.totals.col_59,
          g.totals.col_63,
          g.totals.col_68,
          g.totals.grand,
        ]);
      } else {
        aoa.push([
          "Total",
          "",
          g.totals.col_01,
          g.totals.col_58,
          g.totals.col_59,
          g.totals.col_63,
          g.totals.col_68,
          g.totals.col_utc,
          g.totals.grand,
        ]);
      }
      merges.push({ s: { r: totalRowIdx, c: 0 }, e: { r: totalRowIdx, c: 1 } });

      const shopTotalRowIdx = aoa.length;
      aoa.push([
        `Shop Total (${g.outletCode} — ${g.shopName}):`,
        ...Array(totalCols - 2).fill(""),
        g.shopTotal,
      ]);
      merges.push({ s: { r: shopTotalRowIdx, c: 0 }, e: { r: shopTotalRowIdx, c: totalCols - 2 } });

      aoa.push([]);
    }

    const grandTotalRowIdx = aoa.length;
    if (!hasUtc) {
      aoa.push([
        "Grand Total",
        "",
        grandTotals.col_01,
        grandTotals.col_58,
        grandTotals.col_59,
        grandTotals.col_63,
        grandTotals.col_68,
        grandTotals.grand,
      ]);
    } else {
      aoa.push([
        "Grand Total",
        "",
        grandTotals.col_01,
        grandTotals.col_58,
        grandTotals.col_59,
        grandTotals.col_63,
        grandTotals.col_68,
        grandTotals.col_utc,
        grandTotals.grand,
      ]);
    }
    merges.push({ s: { r: grandTotalRowIdx, c: 0 }, e: { r: grandTotalRowIdx, c: 1 } });

    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    worksheet["!merges"] = merges;
    worksheet["!cols"] = [
      { wch: 18 },
      { wch: 14 },
      { wch: 22 },
      { wch: 22 },
      { wch: 24 },
      { wch: 22 },
      { wch: 22 },
      ...(hasUtc ? [{ wch: 18 }] : []),
      { wch: 18 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Promo Summary");
    XLSX.writeFile(workbook, `${baseName}.xlsx`);
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={handleExportPdf}
        variant="default"
        size="sm"
        className="whitespace-nowrap text-[11px]"
        icon={<Printer className="h-3.5 w-3.5" />}
        iconClassName="text-white"
        disabled={pdfProgress !== null || !groups?.length}
      >
        {pdfProgress ?? "Print PDF"}
      </Button>

      <Button
        onClick={handleExportExcel}
        variant="default"
        size="sm"
        className="whitespace-nowrap text-[11px]"
        icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
        disabled={!groups?.length}
      >
        Export Excel
      </Button>
    </div>
  );
}
