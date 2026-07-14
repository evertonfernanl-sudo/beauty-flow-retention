export type PageType = "NATIVE" | "IMAGE";

/**
 * Classifies a PDF page based on the presence of a native text layer.
 * A page is NATIVE if it has extractable text content, and IMAGE if it contains no extractable text.
 */
export function classifyPage(items: Array<{ str: string }>): PageType {
  if (!items || items.length === 0) {
    return "IMAGE";
  }

  // Count characters in all text items, ignoring whitespace
  const charCount = items.reduce((sum, item) => sum + (item.str || "").replace(/\s+/g, "").length, 0);

  // If there is any extractable text (threshold of 5 non-whitespace characters), we treat it as native
  if (charCount >= 5) {
    return "NATIVE";
  }

  return "IMAGE";
}
