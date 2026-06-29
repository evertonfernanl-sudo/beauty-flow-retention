import { runImportParse, convertPdfBufferToCsvRaw } from "./worker.server";

export async function runImportParseV2(
  admin: any,
  job: { payload: Record<string, unknown> | null; company_id: string | null },
) {
  const { import_id } = (job.payload ?? {}) as { import_id?: string };
  if (!import_id || !job.company_id) throw new Error("import.parse_v2: missing import_id/company_id");

  console.log(`[SIE V2] Iniciando runImportParseV2 para import_id: ${import_id}`);

  // Fetch the import record first to check if it is PDF
  const { data: imp, error: impErr } = await admin
    .from("imports")
    .select("id, source, storage_path, filename")
    .eq("id", import_id)
    .single();

  if (impErr || !imp) {
    throw new Error(impErr?.message ?? "import not found");
  }

  console.log(`[SIE V2] Registro obtido: source=${imp.source}, storage_path=${imp.storage_path}`);

  if (imp.source === "pdf") {
    // 1. Download the PDF file from storage
    if (!imp.storage_path) throw new Error("import sem storage_path");
    const { data: file, error: dlErr } = await admin.storage
      .from("imports")
      .download(imp.storage_path);
    if (dlErr || !file) throw new Error(`download do PDF falhou: ${dlErr?.message}`);

    const buf = new Uint8Array(await file.arrayBuffer());
    console.log(`[SIE V2] PDF baixado com sucesso. Tamanho: ${buf.length} bytes. Convertendo para CSV...`);

    // 2. Convert PDF to CSV in memory using the existing converter
    const csvText = await convertPdfBufferToCsvRaw(buf, imp.filename || "extrato.pdf");
    console.log(`[SIE V2] Conversão PDF -> CSV concluída. CSV gerado com ${csvText.split("\n").length} linhas.`);

    // 3. Salvar o CSV fisicamente no storage no bucket "imports"
    const csvStoragePath = imp.storage_path.replace(/\.[^/.]+$/, "") + ".converted.csv";
    console.log(`[SIE V2] Gravando arquivo CSV convertido no storage path: ${csvStoragePath}`);
    
    const csvBuffer = Buffer.from(csvText, "utf8");
    const { error: upErr } = await admin.storage
      .from("imports")
      .upload(csvStoragePath, csvBuffer, {
        contentType: "text/csv",
        upsert: true,
      });
    if (upErr) throw new Error(`Falha ao salvar CSV convertido no storage: ${upErr.message}`);

    // 4. Atualizar a origem e o caminho do arquivo no registro da importação no banco
    console.log(`[SIE V2] Atualizando registro de importação no banco de dados para source="csv" e storage_path="${csvStoragePath}"`);
    const { error: updErr } = await admin
      .from("imports")
      .update({
        source: "csv",
        storage_path: csvStoragePath,
      })
      .eq("id", import_id);
    if (updErr) throw new Error(`Falha ao atualizar registro de importação no banco: ${updErr.message}`);

    // 5. Delegar o processamento diretamente para a lógica de importação clássica (sem Proxy)
    console.log(`[SIE V2] Delegando diretamente para runImportParse clássico...`);
    return runImportParse(admin, job);
  }

  // If CSV or XLSX, run it directly without changes
  console.log(`[SIE V2] Arquivo não é PDF. Delegando diretamente para runImportParse clássico.`);
  return runImportParse(admin, job);
}
