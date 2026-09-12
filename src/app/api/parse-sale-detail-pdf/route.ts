import "@/lib/polyfills/domMatrix";
import { NextRequest, NextResponse } from "next/server";

interface ProductEntry {
  code: string;
  name: string;
  phCase: number;
}

interface InvoiceProducts {
  invoice_no: string;
  products: ProductEntry[];
}

export const runtime = "nodejs";
export const maxDuration = 60;

function parseSaleDetailPdf(text: string): InvoiceProducts[] {
  const lines = text.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());

  const invoiceOrder: string[] = [];
  const invoiceProductsMap = new Map<string, ProductEntry[]>();
  let currentInvoice: string | null = null;

  const invoiceNoRe = /Invoice\s+Nr\s*:\s*([a-zA-Z0-9]+)/i;
  const productLineRe = /^(\d{5,7})\s+(.+?)\s*\t(\d+(?:[.,]\d+)?)\s*\t/;

  for (const line of lines) {
    const invMatch = invoiceNoRe.exec(line);
    if (invMatch) {
      currentInvoice = invMatch[1].trim();
      if (!invoiceProductsMap.has(currentInvoice)) {
        invoiceProductsMap.set(currentInvoice, []);
        invoiceOrder.push(currentInvoice);
      }
      continue;
    }

    if (currentInvoice) {
      const prodMatch = productLineRe.exec(line);
      if (prodMatch) {
        const code = prodMatch[1];
        const name = prodMatch[2].trim();
        const phCase = parseFloat(prodMatch[3].replace(",", "."));
        if (!isNaN(phCase) && phCase > 0 && name) {
          const list = invoiceProductsMap.get(currentInvoice) || [];
          list.push({ code, name, phCase });
          invoiceProductsMap.set(currentInvoice, list);
        }
      }
    }
  }

  return invoiceOrder
    .map((invNo) => ({
      invoice_no: invNo,
      products: invoiceProductsMap.get(invNo) || [],
    }))
    .filter((entry) => entry.products.length > 0);
}


export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PDFParse } = require("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer), verbosity: 0 });
    await parser.load();
    const result = await parser.getText();

    const text: string =
      result && typeof result === "object" && typeof result.text === "string"
        ? result.text
        : typeof result === "string"
        ? result
        : "";

    const invoiceProducts = parseSaleDetailPdf(text);

    return NextResponse.json({
      success: true,
      data: invoiceProducts,
      rawText: text.slice(0, 5000),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
