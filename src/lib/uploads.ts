// Centralized upload validation — use before sending any file to Storage.

export const ALLOWED_IMAGE_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
export const ALLOWED_DOC_MIME = ["application/pdf"] as const;
export const ALLOWED_ALL_MIME = [...ALLOWED_IMAGE_MIME, ...ALLOWED_DOC_MIME] as const;

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_DOC_BYTES = 10 * 1024 * 1024; // 10 MB

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export type UploadValidationResult = { ok: true; ext: string } | { ok: false; error: string };

export function validateUpload(
  file: File,
  opts: { kind?: "image" | "doc" | "any"; maxBytes?: number } = {},
): UploadValidationResult {
  const kind = opts.kind ?? "any";
  const allowed =
    kind === "image" ? ALLOWED_IMAGE_MIME : kind === "doc" ? ALLOWED_DOC_MIME : ALLOWED_ALL_MIME;
  const maxBytes = opts.maxBytes ?? (kind === "doc" ? MAX_DOC_BYTES : MAX_IMAGE_BYTES);

  if (!file) return { ok: false, error: "Arquivo ausente" };
  if (!(allowed as readonly string[]).includes(file.type)) {
    return { ok: false, error: `Tipo não permitido: ${file.type || "desconhecido"}` };
  }
  if (file.size <= 0) return { ok: false, error: "Arquivo vazio" };
  if (file.size > maxBytes) {
    return {
      ok: false,
      error: `Arquivo excede ${(maxBytes / 1024 / 1024).toFixed(0)} MB`,
    };
  }

  const ext = EXT_BY_MIME[file.type] ?? file.name.split(".").pop()?.toLowerCase() ?? "bin";
  // Defense in depth: reject if filename extension doesn't match expected
  const nameExt = file.name.split(".").pop()?.toLowerCase();
  if (nameExt && nameExt !== ext && !(ext === "jpg" && nameExt === "jpeg")) {
    return { ok: false, error: "Extensão do arquivo não confere com o tipo" };
  }

  return { ok: true, ext };
}

export function safeStoragePath(companyId: string, prefix: string, ext: string) {
  const safePrefix = prefix.replace(/[^a-z0-9_-]/gi, "");
  return `${companyId}/${safePrefix}-${Date.now()}.${ext}`;
}
