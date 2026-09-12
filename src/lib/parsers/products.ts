export interface ParsedProduct {
  name: string;
  qty: number;
}

export interface ParsedProductWithCode {
  code: string;  // leading numeric product code, e.g. "104386"
  name: string;  // the rest of the label after the code
  qty: number;
}

export function parseProducts(input: string): ParsedProduct[] {
  if (!input || !input.trim()) return [];

  return input
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^(.*?)\s*(?:[×xX])\s*(\d+)$/);
      if (match) {
        let name = match[1].trim();
        name = name.replace(/\+[\d\.]+[\-\–\—][\d\.]+$/, "").trim();
        const qty = parseInt(match[2], 10);
        return { name, qty: isNaN(qty) ? 1 : qty };
      }
      let rawName = entry.trim();
      rawName = rawName.replace(/\+[\d\.]+[\-\–\—][\d\.]+$/, "").trim();
      return { name: rawName, qty: 1 };
    });
}

export function serializeProducts(products: ParsedProduct[]): string {
  return products.map((p) => `${p.name}×${p.qty}`).join(", ");
}

/**
 * Parses the invoice products string that contains leading product codes.
 * Format: "104386     CC PET1L X6-PS×5, 110576     CC PET 2L 1X6 -PS×80"
 * Returns entries with { code, name, qty } where code is the numeric prefix.
 */
export function parseProductsWithCode(input: string): ParsedProductWithCode[] {
  if (!input || !input.trim()) return [];

  // Matches: <code (digits)>  <spaces>  <name>  ×  <qty>
  const CODE_RE = /^(\d{4,9})\s+(.+?)\s*[×xX*]\s*(\d+(?:\.\d+)?)$/;

  return input
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const m = CODE_RE.exec(entry);
      if (m) {
        return [{ code: m[1], name: m[2].trim(), qty: parseFloat(m[3]) || 1 }];
      }
      // Fallback: no code prefix — return empty (we can only match by code)
      return [];
    });
}
