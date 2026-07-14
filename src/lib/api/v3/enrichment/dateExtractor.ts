import { MONTHS } from "./aliases";

export function extractDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = String(s).trim();

  // ISO com timestamp/timezone
  if (/T\d{2}:\d{2}/.test(t)) {
    const d = new Date(t);
    if (!isNaN(d.getTime())) {
      const shifted = new Date(d.getTime() - 3 * 3600_000); // UTC-3 fallback
      return shifted.toISOString().slice(0, 10);
    }
  }

  // Suporte a mês textual (ex: "01 JAN" ou "15 MAR 2026" ou "15 de Março de 2026")
  const cleanTextDate = t.replace(/\bde\b/gi, "").replace(/\s+/g, " ").trim();
  const textMonthMatch = cleanTextDate.match(/^(\d{1,2})[\s\-./]+([a-zA-ZÀ-ÿ]{3,15})(?:[\s\-./]+(\d{2,4}))?$/i);
  if (textMonthMatch) {
    const [, dd, monthName, yy] = textMonthMatch;
    const mm = MONTHS[monthName.toLowerCase().substring(0, 3)];
    if (mm) {
      const year = yy ? (yy.length === 2 ? `20${yy}` : yy) : String(new Date().getFullYear());
      return `${year}-${mm}-${dd.padStart(2, "0")}`;
    }
  }

  // DD/MM/YYYY ou DD/MM/YY
  const br = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (br) {
    const a = parseInt(br[1], 10);
    const b = parseInt(br[2], 10);
    let yy = br[3];
    if (yy.length === 2) yy = (parseInt(yy, 10) > 50 ? "19" : "20") + yy;
    if (a > 12 && b <= 12) return `${yy}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    if (b > 12 && a <= 12) return `${yy}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`;
    if (a <= 31 && b <= 12) return `${yy}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
  }

  // DD/MM ou DD-MM ou DD.MM (sem ano)
  const brShort = t.match(/^(\d{1,2})[\/\-.](\d{1,2})$/);
  if (brShort) {
    const a = parseInt(brShort[1], 10);
    const b = parseInt(brShort[2], 10);
    const currentYear = new Date().getFullYear();
    if (a <= 31 && b <= 12) {
      return `${currentYear}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`;
    }
  }

  // ISO YYYY-MM-DD
  const iso = t.match(/^(\d{4})[\-.](\d{1,2})[\-.](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;

  return null;
}
