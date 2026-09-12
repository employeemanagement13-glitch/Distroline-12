"use client";

import { Document, Page, pdf, StyleSheet, Text, View } from "@react-pdf/renderer";
import { FileSpreadsheet, Printer } from "lucide-react";
import { useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/Button";

interface ExportButtonsProps {
  data: Array<Record<string, unknown>>;
  filename: string;
}

const styles = StyleSheet.create({
  page: {
    padding: 20,
    fontFamily: "Helvetica",
    backgroundColor: "#ffffff",
  },
  title: {
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 4,
    color: "#111827",
  },
  table: {
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerCell: {
    padding: 4,
    backgroundColor: "#f3f4f6",
    fontWeight: 700,
    borderRightWidth: 1,
    borderRightColor: "#e5e7eb",
    overflow: "hidden",
  },
  cell: {
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: "#e5e7eb",
    overflow: "hidden",
  },
  lastCell: {
    borderRightWidth: 0,
  },
});

function formatPdfValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

// react-pdf only wraps text at existing spaces/hyphens. A long unbroken
// token (account number, ID with no separators) has no wrap point and
// will render past its column width. Insert zero-width spaces every few
// characters in long unbroken runs so the renderer always has somewhere
// to break the line.
function withSoftBreaks(value: string) {
  return value.replace(/\S{9,}/g, (token) => {
    const chunks = token.match(/.{1,6}/g) ?? [token];
    return chunks.join("\u200B");
  });
}

function formatPdfCellValue(value: unknown) {
  return withSoftBreaks(formatPdfValue(value));
}

/**
 * Per-column "weight" — the longest string that will actually appear in
 * that column (header or any cell), clamped to a sane range. This is the
 * raw signal used to decide how much horizontal room a column deserves
 * relative to the others.
 */
function computeColumnContentWeights(data: Array<Record<string, unknown>>, headers: string[]) {
  return headers.map((header) => {
    let max = header.length;
    for (const row of data) {
      const len = formatPdfValue(row[header]).length;
      if (len > max) max = len;
    }
    return Math.min(Math.max(max, 4), 80);
  });
}

// ---------------------------------------------------------------------------
// PDF column & page sizing
//
// Previous approach: keep the page fixed at A4-landscape width and shrink
// font size + column width percentages as columns increase. At ~20+ columns
// this pushed font size down to 4.5pt and some columns to ~27pt wide, which
// isn't enough room for real values (shop names, product lists, long codes)
// even after wrapping. `overflow: hidden` on react-pdf's Text isn't fully
// reliable at that extreme, so text bled past its cell into the next one —
// producing the garbled/overlapping output.
//
// New approach: size the PAGE to the table instead of squeezing the table
// into a fixed page. Every column gets a guaranteed minimum width at a
// legible font floor; the page grows wider (like a spreadsheet's "fit all
// columns" export) to fit however many columns the data has, so all columns
// — however many — stay on ONE continuous table. A hard ceiling (safely
// under the PDF spec's 14,400pt page-size limit) is the only thing that
// makes font size step down further, and only for pathological cases.
// ---------------------------------------------------------------------------

const PDF_BASE_FONT_SIZE = 9; // default, comfortable size
const PDF_MIN_FONT_SIZE = 6.5; // absolute floor — never go below this
const PDF_CELL_PADDING = 4; // fixed, matches styles.headerCell/cell padding
const PDF_MIN_COLUMN_WIDTH = 42; // pt — floor so short columns (Type, DM) stay legible
const PDF_MAX_COLUMN_WIDTH = 260; // pt — ceiling so one long free-text column (Products) can't dominate; excess text wraps to more lines instead of stretching or overflowing
const PDF_PAGE_HEIGHT = 595.28; // pt — landscape A4 height, kept constant
const PDF_PAGE_PADDING = 20; // pt — matches styles.page padding
const PDF_MIN_PAGE_WIDTH = 841.89; // pt — landscape A4 width, the floor so small tables still look like a normal page
const PDF_MAX_PAGE_WIDTH = 14000; // pt — PDF spec caps a page edge at 14400pt; stay safely under it

// Rough average glyph width for Helvetica at 1pt, mixed upper/lower/digits.
const AVG_CHAR_WIDTH_FACTOR = 0.52;

function estimateColumnWidth(weight: number, fontSize: number) {
  const charWidth = fontSize * AVG_CHAR_WIDTH_FACTOR;
  const raw = weight * charWidth + PDF_CELL_PADDING * 2;
  return Math.min(Math.max(raw, PDF_MIN_COLUMN_WIDTH), PDF_MAX_COLUMN_WIDTH);
}

interface PdfTableLayout {
  columnWidths: number[];
  fontSize: number;
  pageWidth: number;
}

/**
 * Computes one shared font size, a width per column (in points), and the
 * page width needed to fit those columns — for the WHOLE table at once.
 * All columns end up on the same continuous table; the page gets wider
 * instead of the table getting cut into groups.
 */
function computeTableLayout(data: Array<Record<string, unknown>>, headers: string[]): PdfTableLayout {
  if (headers.length === 0) {
    return { columnWidths: [], fontSize: PDF_BASE_FONT_SIZE, pageWidth: PDF_MIN_PAGE_WIDTH };
  }

  const weights = computeColumnContentWeights(data, headers);

  let fontSize = PDF_BASE_FONT_SIZE;
  let rawWidths = weights.map((w) => estimateColumnWidth(w, fontSize));
  let rawTotal = rawWidths.reduce((sum, w) => sum + w, 0);

  // Safety net: only realistic with far more than ~26 columns, or
  // pathologically long values everywhere. Step font down until the table
  // fits under the page-size ceiling.
  while (rawTotal + PDF_PAGE_PADDING * 2 > PDF_MAX_PAGE_WIDTH && fontSize > PDF_MIN_FONT_SIZE) {
    fontSize -= 0.5;
    rawWidths = weights.map((w) => estimateColumnWidth(w, fontSize));
    rawTotal = rawWidths.reduce((sum, w) => sum + w, 0);
  }

  const contentWidth = Math.min(
    Math.max(rawTotal, PDF_MIN_PAGE_WIDTH - PDF_PAGE_PADDING * 2),
    PDF_MAX_PAGE_WIDTH - PDF_PAGE_PADDING * 2
  );

  // Re-normalize so columns always sum EXACTLY to contentWidth — stretching
  // to fill a small table's page, or scaling down slightly if the safety
  // net above had to clip a pathologically wide table. This guarantees the
  // row of cells fills the page width exactly, with no overflow or gap.
  const columnWidths =
    rawTotal > 0 ? rawWidths.map((w) => (w / rawTotal) * contentWidth) : headers.map(() => contentWidth / headers.length);

  const pageWidth = contentWidth + PDF_PAGE_PADDING * 2;

  return { columnWidths, fontSize, pageWidth };
}

function GridTable({
  data,
  headers,
  columnWidths,
  fontSize,
}: {
  data: Array<Record<string, unknown>>;
  headers: string[];
  columnWidths: number[];
  fontSize: number;
}) {
  return (
    <View style={styles.table}>
      {/* fixed so the header repeats on every physical page this table flows onto */}
      <View style={styles.row} fixed>
        {headers.map((header, index) => (
          <Text
            key={header}
            style={[
              styles.headerCell,
              { width: columnWidths[index], fontSize },
              index === headers.length - 1 ? styles.lastCell : {},
            ]}
          >
            {header}
          </Text>
        ))}
      </View>

      {data.map((row, rowIndex) => (
        <View
          key={`${rowIndex}-${headers.join("-")}`}
          style={styles.row}
          // Never split a single row across a page break — this is what
          // was causing entries to visually overlap/mix at page boundaries
          wrap={false}
        >
          {headers.map((header, index) => (
            <Text
              key={`${rowIndex}-${header}`}
              style={[
                styles.cell,
                { width: columnWidths[index], fontSize },
                index === headers.length - 1 ? styles.lastCell : {},
              ]}
            >
              {formatPdfCellValue(row[header])}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function ExportPdfDocument({ data, filename }: { data: Array<Record<string, unknown>>; filename: string }) {
  const headers = data.length > 0 ? Object.keys(data[0]) : [];
  const { columnWidths, fontSize, pageWidth } = computeTableLayout(data, headers);

  return (
    // A single Page, sized to fit every column (not clamped to a fixed
    // A4 width): react-pdf auto-paginates the ROWS across as many
    // physical pages as needed, repeating the `fixed` header row on
    // each one — every column stays present on every page, only rows
    // split across pages, never columns. Explicit [width, height] is
    // already in landscape proportions, so `orientation` is omitted.
    <Document>
      <Page size={[pageWidth, PDF_PAGE_HEIGHT]} style={styles.page}>
        <Text style={styles.title}>{filename}</Text>
        <GridTable data={data} headers={headers} columnWidths={columnWidths} fontSize={fontSize} />
      </Page>
    </Document>
  );
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
}

function formatExcelValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return value;
}

function buildWorksheet(data: Array<Record<string, unknown>>) {
  const cleaned = data.map((row) => {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(row)) {
      out[key] = formatExcelValue(row[key]);
    }
    return out;
  });

  const worksheet = XLSX.utils.json_to_sheet(cleaned);
  const headers = data.length > 0 ? Object.keys(data[0]) : [];

  // Auto-size each column from header + longest cell value, so text
  // doesn't get visually crammed/truncated against the next column
  worksheet["!cols"] = headers.map((header) => {
    let maxLen = header.length;
    for (const row of data) {
      const len = String(formatExcelValue(row[header]) ?? "").length;
      if (len > maxLen) maxLen = len;
    }
    return { wch: Math.min(Math.max(maxLen + 2, 10), 50) };
  });

  // Freeze the header row so it stays visible while scrolling
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };

  // Bold the header row
  headers.forEach((_, colIndex) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
    if (worksheet[cellRef]) {
      worksheet[cellRef].s = { font: { bold: true } };
    }
  });

  return worksheet;
}

// Max rows per PDF file. Above this threshold we split into multiple files
// so the browser never blocks for more than a few seconds per chunk.
const PDF_CHUNK_SIZE = 500;

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Delay revoke so the browser has time to start the download
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportButtons({ data, filename }: ExportButtonsProps) {
  const [pdfProgress, setPdfProgress] = useState<string | null>(null);
  const safeFileName = sanitizeFileName(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
  const excelFileName = sanitizeFileName(filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);

  const handleExportPdf = async () => {
    if (!data || !data.length) return;

    const chunks: Array<typeof data> = [];
    for (let i = 0; i < data.length; i += PDF_CHUNK_SIZE) {
      chunks.push(data.slice(i, i + PDF_CHUNK_SIZE));
    }

    const baseName = safeFileName.replace(/\.pdf$/i, "");
    const isMulti = chunks.length > 1;

    setPdfProgress(isMulti ? `Preparing PDF 1 of ${chunks.length}...` : "Preparing PDF...");

    try {
      for (let ci = 0; ci < chunks.length; ci++) {
        if (isMulti) {
          setPdfProgress(`Preparing PDF ${ci + 1} of ${chunks.length}...`);
        }

        // Yield to the browser between chunks so the tab stays responsive
        await new Promise<void>((resolve) => setTimeout(resolve, 50));

        const chunkFilename = isMulti
          ? `${baseName}_part${ci + 1}of${chunks.length}.pdf`
          : `${baseName}.pdf`;

        const blob = await pdf(
          <ExportPdfDocument data={chunks[ci]} filename={isMulti ? `${filename} (${ci + 1}/${chunks.length})` : filename} />
        ).toBlob();

        downloadBlob(blob, chunkFilename);

        // Give the browser a moment between sequential downloads
        if (ci < chunks.length - 1) {
          await new Promise<void>((resolve) => setTimeout(resolve, 300));
        }
      }
    } finally {
      setPdfProgress(null);
    }
  };

  const handleExportExcel = () => {
    if (!data || !data.length) return;

    const worksheet = buildWorksheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

    XLSX.writeFile(workbook, excelFileName);
  };

  return (
    <div className="flex gap-2">
      <Button
        onClick={handleExportPdf}
        variant="default"
        size="sm"
        className="whitespace-nowrap"
        icon={<Printer className="h-3.5 w-3.5" />}
        iconClassName="text-white"
        disabled={pdfProgress !== null || !data?.length}
      >
        {pdfProgress ?? "Print PDF"}
      </Button>

      <Button
        onClick={handleExportExcel}
        variant="default"
        size="sm"
        className="whitespace-nowrap"
        icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
      >
        Export Excel
      </Button>
    </div>
  );
}