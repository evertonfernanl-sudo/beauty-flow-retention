import { runImportParse, convertPdfBufferToCsvRaw } from "./worker.server";

export async function runImportParseV2(
  admin: any,
  job: { payload: Record<string, unknown> | null; company_id: string | null },
) {
  const { import_id } = (job.payload ?? {}) as { import_id?: string };
  if (!import_id || !job.company_id) throw new Error("import.parse_v2: missing import_id/company_id");

  // Fetch the import record first to check if it is PDF
  const { data: imp, error: impErr } = await admin
    .from("imports")
    .select("id, source, storage_path, filename")
    .eq("id", import_id)
    .single();

  if (impErr || !imp) {
    throw new Error(impErr?.message ?? "import not found");
  }

  if (imp.source === "pdf") {
    // 1. Download the PDF file from storage
    if (!imp.storage_path) throw new Error("import sem storage_path");
    const { data: file, error: dlErr } = await admin.storage
      .from("imports")
      .download(imp.storage_path);
    if (dlErr || !file) throw new Error(`download do PDF falhou: ${dlErr?.message}`);

    const buf = new Uint8Array(await file.arrayBuffer());

    // 2. Convert PDF to CSV in memory using the existing converter
    const csvText = await convertPdfBufferToCsvRaw(buf, imp.filename || "extrato.pdf");

    // 3. Mock the admin client to intercept and return the in-memory CSV
    const mockedAdmin = new Proxy(admin, {
      get(target, prop) {
        if (prop === "from") {
          return (table: string) => {
            const queryBuilder = target.from(table);
            if (table === "imports") {
              return new Proxy(queryBuilder, {
                get(qTarget, qProp) {
                  if (qProp === "select") {
                    return (fields: string) => {
                      const selectBuilder = qTarget.select(fields);
                      return new Proxy(selectBuilder, {
                        get(sTarget, sProp) {
                          if (sProp === "eq") {
                            return (field: string, value: any) => {
                              const eqBuilder = sTarget.eq(field, value);
                              return new Proxy(eqBuilder, {
                                get(eTarget, eProp) {
                                  if (eProp === "single") {
                                    return async () => {
                                      const res = await eTarget.single();
                                      if (res.data) {
                                        res.data.source = "csv"; // spoof to CSV
                                      }
                                      return res;
                                    };
                                  }
                                  const eVal = Reflect.get(eTarget, eProp);
                                  return typeof eVal === "function" ? eVal.bind(eTarget) : eVal;
                                }
                              });
                            };
                          }
                          const sVal = Reflect.get(sTarget, sProp);
                          return typeof sVal === "function" ? sVal.bind(sTarget) : sVal;
                        }
                      });
                    };
                  }
                  const qVal = Reflect.get(qTarget, qProp);
                  return typeof qVal === "function" ? qVal.bind(qTarget) : qVal;
                }
              });
            }
            return queryBuilder;
          };
        }
        if (prop === "storage") {
          return {
            from(bucket: string) {
              const bucketObj = target.storage.from(bucket);
              return {
                ...bucketObj,
                async download(path: string) {
                  if (bucket === "imports" && path === imp.storage_path) {
                    return {
                      data: new Blob([csvText], { type: "text/csv" }),
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
    return runImportParse(mockedAdmin, job);
  }

  // If CSV or XLSX, run it directly without changes
  return runImportParse(admin, job);
}
