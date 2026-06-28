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

    // Helper to wrap builders recursively
    const wrapBuilder = (builder: any): any => {
      return new Proxy(builder, {
        get(target, prop) {
          if (prop === "single") {
            return async (...args: any[]) => {
              console.log(`[SIE V2 PROXY] Interceptando .single()`);
              const res = await target.single(...args);
              if (res && res.data) {
                console.log(`[SIE V2 PROXY] Alterando source de ${res.data.source} para 'csv' em .single()`);
                res.data.source = "csv";
              }
              return res;
            };
          }
          if (prop === "then") {
            return (onfulfilled: any, onrejected: any) => {
              console.log(`[SIE V2 PROXY] Interceptando .then()`);
              return target.then((res: any) => {
                if (res && res.data) {
                  if (Array.isArray(res.data)) {
                    res.data.forEach((item: any) => {
                      if (item) {
                        console.log(`[SIE V2 PROXY] Alterando source de ${item.source} para 'csv' em array .then()`);
                        item.source = "csv";
                      }
                    });
                  } else if (typeof res.data === "object") {
                    console.log(`[SIE V2 PROXY] Alterando source de ${res.data.source} para 'csv' em objeto .then()`);
                    res.data.source = "csv";
                  }
                }
                return onfulfilled ? onfulfilled(res) : res;
              }, onrejected);
            };
          }
          const val = Reflect.get(target, prop);
          if (typeof val === "function") {
            return (...args: any[]) => {
              const res = val.apply(target, args);
              if (res && typeof res === "object") {
                return wrapBuilder(res);
              }
              return res;
            };
          }
          return val;
        }
      });
    };

    // 3. Mock the admin client to intercept and return the in-memory CSV
    const mockedAdmin = new Proxy(admin, {
      get(target, prop) {
        if (prop === "from") {
          return (table: string) => {
            console.log(`[SIE V2 PROXY] Acessando tabela: ${table}`);
            const queryBuilder = target.from(table);
            if (table === "imports") {
              return wrapBuilder(queryBuilder);
            }
            return queryBuilder;
          };
        }
        if (prop === "storage") {
          return {
            from(bucket: string) {
              console.log(`[SIE V2 PROXY] Acessando bucket: ${bucket}`);
              const bucketObj = target.storage.from(bucket);
              return {
                ...bucketObj,
                async download(path: string) {
                  console.log(`[SIE V2 PROXY] Interceptando download do path: ${path}`);
                  if (bucket === "imports") {
                    console.log(`[SIE V2 PROXY] Retornando CSV em memória como mockBlob`);
                    const mockBlob = {
                      text: async () => csvText,
                      arrayBuffer: async () => {
                        const encoder = new TextEncoder();
                        return encoder.encode(csvText).buffer;
                      },
                      size: Buffer.byteLength(csvText, "utf8"),
                      type: "text/csv",
                    };
                    return {
                      data: mockBlob as any,
                      error: null,
                    };
                  }
                  return bucketObj.download(path);
                },
              };
            },
          };
        }
        const val = Reflect.get(target, prop);
        return typeof val === "function" ? val.bind(target) : val;
      },
    });

    // 4. Run the parser with the mocked client
    console.log(`[SIE V2] Delegando para runImportParse clássico com mockedAdmin...`);
    return runImportParse(mockedAdmin, job);
  }

  // If CSV or XLSX, run it directly without changes
  console.log(`[SIE V2] Arquivo não é PDF. Delegando diretamente para runImportParse clássico.`);
  return runImportParse(admin, job);
}
