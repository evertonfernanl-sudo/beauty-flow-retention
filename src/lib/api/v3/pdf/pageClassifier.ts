export type PageType = "NATIVE" | "IMAGE";

/**
 * Classifies a PDF page based on the presence of a native text layer.
 * A page is NATIVE if it has extractable text content, and IMAGE if it contains no extractable text.
 */
export function classifyPage(items: Array<{ str: string }>): PageType {
  if (!items || items.length === 0) {
    return "IMAGE";
  }
  const hasText = items.some(item => item && typeof item.str === "string" && item.str.trim().length > 0);
  return hasText ? "NATIVE" : "IMAGE";
}
