import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Upload, Trash2, ShieldCheck, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import {
  registerImportV3,
  applyRowV3,
  deleteImportV3,
} from "@/lib/api/siev3.functions";

export const Route = createFileRoute("/_authenticated/app/import")({
  head: () => ({ meta: [{ title: "Import (SIE V3)" }] }),
  component: ImportV3Page,
});

function ImportV3Page() {
  const profileQ = useCurrentProfile();
  const companyId = (profileQ.data as any)?.company_id ?? profileQ.data?.company?.id ?? null;
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [auditRowId, setAuditRowId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const importsQ = useQuery({
    enabled: !!companyId,
    queryKey: ["v3-imports", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v3_imports").select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 4000,
  });

  const rowsQ = useQuery({
    enabled: !!selected,
    queryKey: ["v3-rows", selected],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v3_import_rows").select("*")
        .eq("import_id", selected!).order("row_index", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 4000,
  });

  const auditQ = useQuery({
    enabled: !!auditRowId,
    queryKey: ["v3-audit", auditRowId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v3_row_audit").select("*").eq("id", auditRowId!).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const applyMut = useMutation({
    mutationFn: async (rowId: string) => applyRowV3({ data: { rowId } }),
    onSuccess: () => {
      toast.success("Linha aplicada");
      qc.invalidateQueries({ queryKey: ["v3-rows", selected] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (args: { id: string; storagePath: string }) =>
      deleteImportV3({ data: { importId: args.id, storagePath: args.storagePath } }),
    onSuccess: () => {
      toast.success("Importação removida");
      setSelected(null);
      qc.invalidateQueries({ queryKey: ["v3-imports"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  async function onPick(file: File) {
    if (!companyId) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["csv", "xlsx", "xls", "pdf"].includes(ext)) {
      toast.error("Use CSV, XLSX ou PDF."); return;
    }
    if (file.size > 20 * 1024 * 1024) { toast.error("Arquivo > 20 MB."); return; }
    const source: "csv" | "xlsx" | "pdf" = ext === "csv" ? "csv" : ext === "pdf" ? "pdf" : "xlsx";
    setUploading(true);
    try {
      const path = `${companyId}/v3/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("imports").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const res = await registerImportV3({ data: { filename: file.name, storagePath: path, size: file.size, source } });
      if (res && "success" in res && !res.success) toast.error(res.error || "Falha no pipeline V3");
      else toast.success("Pipeline V3 executado — revisar linhas.");
      if (res?.importId) setSelected(res.importId);
      qc.invalidateQueries({ queryKey: ["v3-imports"] });
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" /> Import (SIE V3)
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pipeline determinístico em camadas. Modelo Canônico é a fonte operacional;
          o Snapshot Original é imutável e usado apenas para auditoria e restauração.
        </p>
      </div>

      <Card className="p-4 flex items-center gap-3 flex-wrap">
        <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-2">
          <Upload className="h-4 w-4" /> {uploading ? "Processando…" : "Enviar arquivo (CSV / XLSX / PDF)"}
        </Button>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.pdf" className="hidden"
               onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])} />
        <Badge variant="outline" className="gap-1"><ShieldCheck className="h-3 w-3" /> Determinístico</Badge>
        <Badge variant="outline">v3.0.0</Badge>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4">
        <Card className="p-3 max-h-[70vh] overflow-y-auto">
          <h3 className="text-sm font-semibold mb-2">Importações</h3>
          <div className="space-y-1">
            {(importsQ.data ?? []).map((imp) => (
              <button key={imp.id} onClick={() => setSelected(imp.id)}
                      className={`w-full text-left p-2 rounded border text-xs ${selected === imp.id ? "bg-primary/10 border-primary" : "bg-card"}`}>
                <div className="font-medium truncate flex items-center gap-1">
                  <FileText className="h-3 w-3" /> {imp.filename}
                </div>
                <div className="flex items-center justify-between mt-1 gap-1">
                  <Badge variant={imp.final_state === "FAILED" ? "destructive" : imp.final_state === "SUCCESS" ? "default" : "secondary"}>
                    {imp.final_state ?? imp.status}
                  </Badge>
                  <span className="text-muted-foreground text-[10px]">{new Date(imp.created_at).toLocaleString("pt-BR")}</span>
                </div>
                {(imp.total_rows ?? 0) > 0 && (
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {imp.total_rows} linhas · {imp.failed_rows ?? 0} falha · {imp.review_rows ?? 0} revisão
                    {imp.ocr_confidence != null && ` · OCR ${(imp.ocr_confidence * 100).toFixed(0)}%`}
                  </div>
                )}
                {imp.last_error && <div className="text-destructive text-[10px] mt-1 line-clamp-2">{imp.last_error}</div>}
                <div className="flex justify-end mt-1">
                  <Button size="sm" variant="ghost" className="h-6 px-1"
                          onClick={(e) => { e.stopPropagation(); if (confirm("Excluir esta importação?")) deleteMut.mutate({ id: imp.id, storagePath: imp.storage_path }); }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </button>
            ))}
            {(!importsQ.data || importsQ.data.length === 0) && (
              <div className="text-xs text-muted-foreground p-2">Nenhuma importação ainda.</div>
            )}
          </div>
        </Card>

        <Card className="p-3 max-h-[70vh] overflow-auto">
          {!selected && <div className="text-sm text-muted-foreground p-4">Selecione uma importação para revisar as linhas.</div>}
          {selected && (
            <table className="w-full text-xs">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="p-2 text-left">#</th>
                  <th className="p-2 text-left">Data</th>
                  <th className="p-2 text-left">Descrição</th>
                  <th className="p-2 text-right">Valor</th>
                  <th className="p-2 text-left">Cliente</th>
                  <th className="p-2 text-left">Tipo</th>
                  <th className="p-2 text-center">Conf.</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {(rowsQ.data ?? []).map((r: any) => {
                  const c = r.canonical ?? {};
                  const sugg = r.suggestions ?? {};
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="p-2">{r.row_index}</td>
                      <td className="p-2">{c.transaction_date ?? "—"}</td>
                      <td className="p-2 max-w-[260px] truncate" title={c.description ?? ""}>{c.description ?? "—"}</td>
                      <td className="p-2 text-right">{c.amount != null ? Number(c.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</td>
                      <td className="p-2">{c.client_name ?? "—"}{sugg.client ? <span className="text-emerald-600"> → {sugg.client.name}</span> : null}</td>
                      <td className="p-2">{sugg.type ?? "—"}</td>
                      <td className="p-2 text-center">{r.confidence}</td>
                      <td className="p-2">
                        <Badge variant={r.status === "applied" ? "default" : r.status === "matched" ? "secondary" : "outline"}>
                          {r.status === "applied" ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <AlertCircle className="h-3 w-3 mr-1" />}
                          {r.status}
                        </Badge>
                      </td>
                      <td className="p-2 flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => setAuditRowId(r.id)}>Auditoria</Button>
                        {r.status !== "applied" && (
                          <Button size="sm" onClick={() => applyMut.mutate(r.id)} disabled={applyMut.isPending}>Aplicar</Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {rowsQ.data && rowsQ.data.length === 0 && (
                  <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">Sem linhas. Aguardando processamento ou arquivo vazio.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Sheet open={!!auditRowId} onOpenChange={(o) => !o && setAuditRowId(null)}>
        <SheetContent className="w-[640px] sm:max-w-[640px] overflow-y-auto">
          <SheetHeader><SheetTitle>Auditoria da linha</SheetTitle></SheetHeader>
          {auditQ.data && (
            <div className="space-y-4 mt-4 text-xs">
              <Section title="Snapshot Original (imutável)" data={auditQ.data.original_snapshot} />
              <Section title="Modelo Canônico (fonte operacional)" data={auditQ.data.canonical} />
              <Section title="Sugestões (Resolução)" data={auditQ.data.suggestions} />
              <Section title="Metadados de Processamento" data={auditQ.data.processing_metadata} />
              <div>
                <div className="font-semibold mb-1">Trilha de auditoria</div>
                <div className="space-y-1">
                  {(auditQ.data.audit_trail ?? []).map((a: any, i: number) => (
                    <div key={i} className="border rounded p-2">
                      <div className="flex justify-between"><span className="font-mono">{a.stage} · {a.event}</span><span className="text-muted-foreground">{new Date(a.created_at).toLocaleString("pt-BR")}</span></div>
                      <div className="mt-1"><b>Motivo:</b> {a.reason}</div>
                    </div>
                  ))}
                  {(!auditQ.data.audit_trail || auditQ.data.audit_trail.length === 0) && <div className="text-muted-foreground">Sem eventos.</div>}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Section({ title, data }: { title: string; data: any }) {
  return (
    <div>
      <div className="font-semibold mb-1">{title}</div>
      <pre className="bg-muted/40 rounded p-2 overflow-x-auto text-[11px]">{JSON.stringify(data ?? {}, null, 2)}</pre>
    </div>
  );
}
