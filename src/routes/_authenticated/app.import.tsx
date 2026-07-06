import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Upload, Trash2, ShieldCheck, FileText, CheckCircle2, AlertCircle, XCircle, Undo2 } from "lucide-react";
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
  updateRowV3,
} from "@/lib/api/siev3.functions";

export const Route = createFileRoute("/_authenticated/app/import")({
  head: () => ({ meta: [{ title: "Import (SIE V3)" }] }),
  component: ImportV3Page,
});

// Layout com ordenação de colunas e formatação de valores preservada
const formatDateBr = (dateStr: string | null | undefined) => {
  if (!dateStr) return "—";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

function ImportV3Page() {
  const profileQ = useCurrentProfile();
  const companyId = (profileQ.data as any)?.company_id ?? profileQ.data?.company?.id ?? null;
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [auditRowId, setAuditRowId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelectedRowIds([]);
  }, [selected]);

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

  const clientsQ = useQuery({
    enabled: !!companyId,
    queryKey: ["v3-clients", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .eq("company_id", companyId!)
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    }
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

  const updateRowMut = useMutation({
    mutationFn: async (args: {
      rowId: string;
      updates: any;
      oldValue: any;
      newValue: any;
      auditEvent: string;
      auditReason: string;
    }) => {
      await updateRowV3({
        data: {
          rowId: args.rowId,
          updates: args.updates,
          auditEvent: args.auditEvent,
          auditReason: args.auditReason,
          oldValue: args.oldValue,
          newValue: args.newValue
        }
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["v3-rows", selected] });
      toast.success("Linha atualizada com sucesso");
    },
    onError: (e: any) => toast.error("Erro ao atualizar linha: " + e.message),
  });

  const batchApplyMut = useMutation({
    mutationFn: async (rowIds: string[]) => {
      let applied = 0;
      for (const rowId of rowIds) {
        await applyRowV3({ data: { rowId } });
        applied++;
      }
      return applied;
    },
    onSuccess: (count) => {
      toast.success(`${count} linhas aplicadas com sucesso`);
      setSelectedRowIds([]);
      qc.invalidateQueries({ queryKey: ["v3-rows", selected] });
    },
    onError: (e: any) => toast.error("Erro ao aplicar lote: " + e.message),
  });

  const batchSkipMut = useMutation({
    mutationFn: async (rowIds: string[]) => {
      let skipped = 0;
      for (const rowId of rowIds) {
        const { data: row } = await supabase
          .from("v3_import_rows")
          .select("status")
          .eq("id", rowId)
          .single();
        
        if (row && row.status !== "applied" && row.status !== "skipped") {
          await updateRowV3({
            data: {
              rowId,
              updates: { status: "skipped" },
              auditEvent: "ROW_SKIPPED",
              auditReason: "Usuário recusou a linha manualmente via ação em lote",
              oldValue: row.status,
              newValue: "skipped",
            }
          });
          skipped++;
        }
      }
      return skipped;
    },
    onSuccess: (count) => {
      toast.success(`${count} linhas recusadas com sucesso`);
      setSelectedRowIds([]);
      qc.invalidateQueries({ queryKey: ["v3-rows", selected] });
    },
    onError: (e: any) => toast.error("Erro ao recusar lote: " + e.message),
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
      if (res && "success" in res && !res.success) {
        toast.error(res.error || "Falha no pipeline V3");
      } else {
        toast.success("Pipeline V3 executado — revisar linhas.");
        if (res && "csvText" in res && res.csvText) {
          const blob = new Blob([res.csvText], { type: "text/csv;charset=utf-8;" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.setAttribute("download", file.name.replace(/\.[a-zA-Z0-9]+$/i, ".csv"));
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          toast.success("Arquivo CSV exportado com sucesso.");
        }
      }
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

      <div className="space-y-4">
        {(importsQ.data ?? []).map((imp) => {
          const isExpanded = selected === imp.id;
          
          return (
            <Card key={imp.id} className={`p-4 transition-all ${isExpanded ? "border-primary ring-1 ring-primary/20" : "hover:bg-muted/10 cursor-pointer"}`}
                  onClick={() => !isExpanded && setSelected(imp.id)}>
              {/* Cabeçalho do Extrato / Importação */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex-1 min-w-0" onClick={(e) => { if (isExpanded) { e.stopPropagation(); setSelected(null); } }}>
                  <div className="font-semibold text-sm truncate flex items-center gap-1.5 text-foreground cursor-pointer">
                    <FileText className="h-4 w-4 text-primary" /> {imp.filename}
                  </div>
                  {(imp.total_rows ?? 0) > 0 && (
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {imp.total_rows} linhas · {imp.failed_rows ?? 0} falha · {imp.review_rows ?? 0} revisão
                      {imp.ocr_confidence != null && ` · OCR ${(imp.ocr_confidence * 100).toFixed(0)}%`}
                    </div>
                  )}
                  {imp.last_error && <div className="text-destructive text-[11px] mt-1 line-clamp-2">{imp.last_error}</div>}
                </div>
                
                <div className="flex items-center gap-3 justify-between md:justify-end">
                  <Badge variant={imp.final_state === "FAILED" ? "destructive" : imp.final_state === "SUCCESS" ? "default" : "secondary"}>
                    {imp.final_state ?? imp.status}
                  </Badge>
                  <span className="text-muted-foreground text-xs">{new Date(imp.created_at).toLocaleString("pt-BR")}</span>
                  
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0"
                            onClick={(e) => { e.stopPropagation(); if (confirm("Excluir esta importação?")) deleteMut.mutate({ id: imp.id, storagePath: imp.storage_path }); }}>
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Listagem de operações integrada (Expandível) */}
              {isExpanded && (
                <div className="mt-4 pt-4 border-t space-y-3 cursor-default" onClick={(e) => e.stopPropagation()}>
                  {rowsQ.isLoading && <div className="text-xs text-muted-foreground">Carregando lançamentos...</div>}
                  {rowsQ.isError && <div className="text-xs text-destructive">Erro ao carregar lançamentos.</div>}
                  {rowsQ.data && rowsQ.data.length === 0 && (
                    <div className="text-xs text-muted-foreground">Nenhum lançamento encontrado nesta importação.</div>
                  )}
                  
                  {rowsQ.data && rowsQ.data.length > 0 && (
                    <div className="space-y-3">
                      {/* Painel de Ações em Lote */}
                      {selectedRowIds.length > 0 && (
                        <div className="flex items-center justify-between bg-muted/40 p-2 rounded border mb-2">
                          <span className="text-xs font-medium">
                            {selectedRowIds.length} linha{selectedRowIds.length > 1 ? "s" : ""} selecionada{selectedRowIds.length > 1 ? "s" : ""}
                          </span>
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              onClick={() => batchApplyMut.mutate(selectedRowIds)}
                              disabled={batchApplyMut.isPending || batchSkipMut.isPending}
                            >
                              Aprovar em Lote
                            </Button>
                            <Button 
                              size="sm" 
                              variant="destructive"
                              onClick={() => batchSkipMut.mutate(selectedRowIds)}
                              disabled={batchApplyMut.isPending || batchSkipMut.isPending}
                            >
                              Recusar em Lote
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Tabela com scroll horizontal independente e scroll vertical interno limitado */}
                      <div className="w-full overflow-x-auto max-h-[500px] overflow-y-auto border rounded-md">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/40 sticky top-0 z-10">
                            <tr>
                              <th className="p-2 text-left w-6">
                                <input 
                                  type="checkbox" 
                                  checked={(rowsQ.data ?? []).length > 0 && selectedRowIds.length === (rowsQ.data ?? []).filter(r => r.status !== 'applied').length}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedRowIds((rowsQ.data ?? []).filter(r => r.status !== 'applied').map(r => r.id));
                                    } else {
                                      setSelectedRowIds([]);
                                    }
                                  }}
                                />
                              </th>
                              <th className="p-2 text-left">#</th>
                              <th className="p-2 text-left">Cliente</th>
                              <th className="p-2 text-left w-24">Data</th>
                              <th className="p-2 text-left w-24">Descrição</th>
                              <th className="p-2 text-right">Valor</th>
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
                              const isSkipped = r.status === "skipped";
                              const isApplied = r.status === "applied";
                              
                              return (
                                <tr key={r.id} className={`border-t transition-colors ${isSkipped ? "opacity-50 line-through text-muted-foreground bg-muted/20" : ""} ${isApplied ? "bg-muted/5 text-muted-foreground" : ""}`}>
                                  <td className="p-2">
                                    {!isApplied && (
                                      <input 
                                        type="checkbox"
                                        checked={selectedRowIds.includes(r.id)}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                              setSelectedRowIds(prev => [...prev, r.id]);
                                            } else {
                                              setSelectedRowIds(prev => prev.filter(id => id !== r.id));
                                            }
                                        }}
                                      />
                                    )}
                                  </td>
                                  <td className="p-2">{r.row_index}</td>
                                  
                                  {/* Cliente */}
                                  <td className="p-2">
                                    {isApplied ? (
                                      <span>{sugg.client?.name ?? c.client_name ?? "—"}</span>
                                    ) : (
                                      <div className="flex flex-col gap-1">
                                        {/* Nome do cliente importado/extraído sempre visível */}
                                        <div className="font-semibold text-foreground">
                                          {c.client_name ?? "—"}
                                        </div>
                                        <select 
                                          className="bg-background border rounded px-1 py-0.5 max-w-[150px] truncate text-[11px] text-muted-foreground"
                                          value={r.resolved_client_id ?? ""}
                                          disabled={updateRowMut.isPending}
                                          onChange={(e) => {
                                            const val = e.target.value || null;
                                            const clientName = clientsQ.data?.find(cl => cl.id === val)?.name ?? null;
                                            updateRowMut.mutate({
                                              rowId: r.id,
                                              updates: { 
                                                resolved_client_id: val,
                                                suggestions: {
                                                  ...sugg,
                                                  client: val ? { id: val, name: clientName } : null
                                                }
                                              },
                                              oldValue: r.resolved_client_id,
                                              newValue: val,
                                              auditEvent: "MANUAL_CLIENT_CHANGE",
                                              auditReason: `Alterado cliente para ${clientName ?? "Nenhum"}`
                                            });
                                          }}
                                        >
                                          <option value="">(Associar da base...)</option>
                                          {(clientsQ.data ?? []).map(cl => (
                                            <option key={cl.id} value={cl.id}>{cl.name}</option>
                                          ))}
                                        </select>
                                      </div>
                                    )}
                                  </td>

                                  <td className="p-2 w-24 truncate">{formatDateBr(c.transaction_date)}</td>
                                  <td className="p-2 w-24 max-w-[96px] truncate" title={c.description ?? ""}>{c.description ?? "—"}</td>
                                  <td className="p-2 text-right">{c.amount != null ? Number(c.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</td>
                                  
                                  {/* Tipo / Classificação */}
                                  <td className="p-2">
                                    {isApplied ? (
                                      <Badge variant="outline">{sugg.subtype ?? sugg.type ?? "—"}</Badge>
                                    ) : (
                                      <select
                                        className="bg-background border rounded px-1 py-0.5 text-[11px]"
                                        value={`${sugg.type ?? ""}:${sugg.subtype ?? ""}`}
                                        disabled={updateRowMut.isPending}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          const [type, subtype] = val.split(":");
                                          updateRowMut.mutate({
                                            rowId: r.id,
                                            updates: {
                                              suggestions: {
                                                ...sugg,
                                                type,
                                                subtype
                                              }
                                            },
                                            oldValue: `${sugg.type ?? ""}:${sugg.subtype ?? ""}`,
                                            newValue: val,
                                            auditEvent: "MANUAL_CLASSIFICATION_CHANGE",
                                            auditReason: `Alterada classificação para ${type} / ${subtype}`
                                          });
                                        }}
                                      >
                                        <option value="INCOME:RECEITA">Receita</option>
                                        <option value="INCOME:APORTE">Aporte</option>
                                        <option value="EXPENSE:DESPESA_EMPRESA">Despesa Empresa</option>
                                        <option value="EXPENSE:DESPESA_PESSOAL">Despesa Pessoal</option>
                                      </select>
                                    )}
                                  </td>
                                  
                                  <td className="p-2 text-center">{r.confidence}</td>
                                  <td className="p-2">
                                    <Badge variant={
                                      r.status === "applied" ? "default" : 
                                      r.status === "skipped" ? "secondary" : 
                                      r.status === "LINE_FAILED" ? "destructive" : 
                                      "outline"
                                    }>
                                      {r.status === "applied" ? <CheckCircle2 className="h-3 w-3 mr-1 inline" /> : <AlertCircle className="h-3 w-3 mr-1 inline" />}
                                      {r.status === "applied" ? "Aplicado" : 
                                       r.status === "skipped" ? "Ignorado" : 
                                       r.status === "LINE_FAILED" ? "Falha" : 
                                       "Pendente"}
                                    </Badge>
                                    {r.possible_duplicate && <Badge variant="destructive" className="ml-1">DUP</Badge>}
                                  </td>
                                  <td className="p-2 flex gap-1 justify-end">
                                    {!isApplied && r.status !== "LINE_FAILED" && (
                                      <>
                                        {isSkipped ? (
                                          <Button 
                                            size="sm" 
                                            variant="outline" 
                                            className="h-7 text-xs flex items-center gap-1"
                                            onClick={() => updateRowMut.mutate({
                                              rowId: r.id,
                                              updates: { status: "LINE_REVIEW" },
                                              oldValue: "skipped",
                                              newValue: "LINE_REVIEW",
                                              auditEvent: "ROW_RESTORED",
                                              auditReason: "Usuário reverteu a recusa da linha manualmente"
                                            })}
                                            disabled={updateRowMut.isPending}
                                          >
                                            <Undo2 className="h-3 w-3" /> Restaurar
                                          </Button>
                                        ) : (
                                          <Button 
                                            size="sm" 
                                            variant="ghost" 
                                            className="h-7 text-destructive text-xs flex items-center gap-1 hover:bg-destructive/10 hover:text-destructive"
                                            onClick={() => updateRowMut.mutate({
                                              rowId: r.id,
                                              updates: { status: "skipped" },
                                              oldValue: r.status,
                                              newValue: "skipped",
                                              auditEvent: "ROW_SKIPPED",
                                              auditReason: "Usuário recusou a linha manualmente"
                                            })}
                                            disabled={updateRowMut.isPending}
                                          >
                                            <XCircle className="h-3 w-3" /> Recusar
                                          </Button>
                                        )}
                                        
                                        {!isSkipped && (
                                          <Button 
                                            size="sm" 
                                            className="h-7" 
                                            onClick={() => applyMut.mutate(r.id)} 
                                            disabled={applyMut.isPending}
                                          >
                                            Aplicar
                                          </Button>
                                        )}
                                      </>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
        {(!importsQ.data || importsQ.data.length === 0) && (
          <div className="text-xs text-muted-foreground p-4 bg-card border rounded text-center">Nenhuma importação ainda.</div>
        )}
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
