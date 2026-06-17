// Brazilian phone normalization helpers.
// Display format: "(11) 99999-9999"
// Storage format: "+55 11 99999-9999"
// API format:     "5511999999999"

const onlyDigits = (s: string) => s.replace(/\D/g, "");

/** Strip any formatting and a leading "55" country code. */
function stripBR(input: string): string {
  let d = onlyDigits(input);
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  return d;
}

/** True if value is a valid BR phone (10 = landline, 11 = mobile). */
export function isValidBRPhone(input: string | null | undefined): boolean {
  if (!input) return false;
  const d = stripBR(input);
  return d.length === 10 || d.length === 11;
}

/** Storage representation: "+55 11 99999-9999" (or null). */
export function toStoragePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const d = stripBR(input);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  const mid = rest.length === 9 ? rest.slice(0, 5) : rest.slice(0, 4);
  const end = rest.length === 9 ? rest.slice(5) : rest.slice(4);
  return `+55 ${ddd} ${mid}-${end}`;
}

/** wa.me / API format: "5511999999999". */
export function toWhatsappApi(input: string | null | undefined): string | null {
  if (!input) return null;
  const d = stripBR(input);
  if (d.length !== 10 && d.length !== 11) return null;
  return `55${d}`;
}

/** Friendly display: "(11) 99999-9999". */
export function formatPhoneBR(input: string | null | undefined): string {
  if (!input) return "";
  const d = stripBR(input);
  if (d.length !== 10 && d.length !== 11) return input;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  const mid = rest.length === 9 ? rest.slice(0, 5) : rest.slice(0, 4);
  const end = rest.length === 9 ? rest.slice(5) : rest.slice(4);
  return `(${ddd}) ${mid}-${end}`;
}

/** Build a wa.me deep link with a pre-filled message. */
export function whatsappLink(phone: string | null | undefined, message?: string): string | null {
  const api = toWhatsappApi(phone);
  if (!api) return null;
  const base = `https://wa.me/${api}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
