import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  Loader2,
  FileSpreadsheet,
  RefreshCw,
  Sparkles,
  Check,
  AlertTriangle,
  Lock,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { registerImport, applyImportRow, applyImportBatch } from "@/lib/api/sie.functions";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { useFeature } from "@/lib/hooks/use-feature";
import { formatPhoneBR } from "@/lib/phone";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/app/sie")({
  head: () => ({ meta: [{ title: "Importar Dados · BeautyFlow" }] }),
  component: SiePage,
});

type ImportRow = {
  id: string;
  filename: string;
  status: string;
  source: string;
  rows_total: number;
  rows_matched: number;
  rows_review: number;
  rows_failed: number;
  clients_created: number;
  appointments_created: number;
  transactions_created: number;
  revenue_identified: number;
  created_at: string;
  last_error: string | null;
  storage_path: string | null;
};

function SiePage() {
  const profile = useCurrentProfile().data;
  const companyId = profile?.company?.id;
  const feature = useFeature(companyId, "smart_import");
  const register = useServerFn(registerImport);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  const imports = useQuery({
    enabled: !!companyId,
    queryKey: ["sie-imports", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("imports")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as ImportRow[];
    },
    refetchInterval: 5_000,
  });

  async function onPick(file: File) {
    if (!companyId) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["csv", "xlsx", "xls", "pdf"].includes(ext)) {
      toast.error("Use CSV, XLSX ou PDF (texto nativo).");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Arquivo > 20 MB.");
      return;
    }
    const source: "csv" | "xlsx" | "pdf" = ext === "csv" ? "csv" : ext === "pdf" ? "pdf" : "xlsx";
    setUploading(true);
    try {
      const path = `${companyId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("imports")
        .upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const res = await register({
        data: { filename: file.name, storagePath: path, size: file.size, source },
      });
      toast.success(
        source === "pdf"
          ? "PDF enviado — extraindo texto e detectando estrutura…"
          : "Arquivo enviado — processamento em segundo plano.",
      );
      setSelected(res.importId);
      qc.invalidateQueries({ queryKey: ["sie-imports"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onDeleteImport(id: string, storagePath: string | null) {
    if (
      !confirm(
        "Tem certeza que deseja excluir esta importação? Isso removerá o histórico do arquivo, mas NÃO apagará os clientes ou agendamentos criados por ela.",
      )
    ) {
      return;
    }
    try {
      if (storagePath) {
        await supabase.storage.from("imports").remove([storagePath]);
      }
      const { error } = await supabase.from("imports").delete().eq("id", id);
      if (error) throw error;
      toast.success("Importação excluída com sucesso.");
      if (selected === id) {
        setSelected(null);
      }
      qc.invalidateQueries({ queryKey: ["sie-imports"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!feature.loading && !feature.enabled) {
    return (
      <div className="max-w-2xl">
        <Card className="p-8 text-center space-y-3">
          <Lock className="h-10 w-10 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-semibold">Smart Import desativado</h1>
          <p className="text-sm text-muted-foreground">Ative em Admin → Feature Flags.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" /> Importar Dados
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Envie CSV, XLSX ou PDF (texto nativo). A plataforma detecta o formato, identifica
          clientes, recria atendimentos e aprende seus padrões a cada importação.
        </p>
      </div>

      <Card className="p-5">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
          }}
        />
        <div
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) onPick(f);
          }}
          className="border-2 border-dashed rounded-lg p-6 flex items-center justify-between gap-3 flex-wrap hover:border-primary/50 transition"
        >
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-8 w-8 text-primary" />
            <div>
              <div className="font-medium">
                Arraste um arquivo ou clique para escolher (até 20 MB)
              </div>
              <div className="text-xs text-muted-foreground">
                Aceita <strong>CSV</strong>, <strong>XLSX</strong> e <strong>PDF nativo</strong>.
                Detecta clientes, agendamentos e financeiro automaticamente.
              </div>
            </div>
          </div>
          <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" /> Escolher arquivo
              </>
            )}
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Importações</h2>
          <Button variant="ghost" size="sm" onClick={() => imports.refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Atualizar
          </Button>
        </div>
        {imports.isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : (imports.data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">Nenhuma importação ainda.</div>
        ) : (
          <ul className="divide-y">
            {imports.data!.map((imp) => (
              <li key={imp.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={() => setSelected((s) => (s === imp.id ? null : imp.id))}
                    className="flex-1 flex items-center justify-between text-left min-w-0 gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{imp.filename}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(imp.created_at).toLocaleString()} · {imp.source.toUpperCase()} ·{" "}
                        {imp.rows_total} linhas
                      </div>
                    </div>
                    <StatusBadge status={imp.status} />
                  </button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 h-8 w-8 flex-shrink-0"
                    onClick={() => onDeleteImport(imp.id, imp.storage_path)}
                    title="Excluir histórico de importação"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {imp.status === "processing" && <Progress value={50} className="mt-2 h-1" />}
                {imp.last_error && (
                  <div className="text-xs text-destructive mt-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {imp.last_error}
                  </div>
                )}
                {imp.status === "completed" && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>✓ {imp.rows_matched} match</span>
                    <span>~ {imp.rows_review} revisar</span>
                    <span>✗ {imp.rows_failed} falhas</span>
                    <span>+ {imp.clients_created} clientes</span>
                    <span>+ {imp.appointments_created} atendimentos</span>
                    <span>R$ {Number(imp.revenue_identified).toFixed(2)} identificado</span>
                  </div>
                )}
                {selected === imp.id && <ImportReview importId={imp.id} status={imp.status} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { label: string; v: "default" | "secondary" | "destructive" | "outline" }
  > = {
    uploaded: { label: "Enviado", v: "outline" },
    processing: { label: "Processando", v: "secondary" },
    completed: { label: "Concluído", v: "default" },
    failed: { label: "Falhou", v: "destructive" },
  };
  const m = map[status] ?? { label: status, v: "outline" as const };
  return <Badge variant={m.v}>{m.label}</Badge>;
}

type Row = {
  id: string;
  row_index: number;
  client_name: string | null;
  client_phone: string | null;
  description: string | null;
  amount: number | null;
  occurred_at: string | null;
  payment_method: string | null;
  confidence: number;
  status: string;
  notes: string | null;
  parsed?: {
    name?: string;
    phoneRaw?: string;
    phoneRaw2?: string;
    description?: string;
    amount?: number;
    occurred?: string;
    paymentMethod?: string;
    isExpense?: boolean;
    isContribution?: boolean;
    isDuplicate?: boolean;
  };

};

function RowStatusBadge({ status, isDuplicate }: { status: string; isDuplicate?: boolean }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "Pendente", className: "bg-gray-100 text-gray-800 border-gray-200" },
    matched: { label: "Mapeado", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    review: {
      label: isDuplicate ? "Duplicado?" : "Revisar",
      className: isDuplicate
        ? "bg-amber-50 text-amber-700 border-amber-200 animate-pulse font-semibold"
        : "bg-amber-50 text-amber-700 border-amber-200",
    },
    manual: { label: "Manual", className: "bg-blue-50 text-blue-700 border-blue-200" },
    applied: { label: "Aplicado", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    skipped: { label: "Recusado", className: "bg-rose-50 text-rose-700 border-rose-200" },
    failed: { label: "Falhou", className: "bg-rose-100 text-rose-800 border-rose-200" },
  };
  const m = map[status] ?? { label: status, className: "bg-gray-100 text-gray-800" };
  return (
    <Badge variant="outline" className={m.className}>
      {m.label}
    </Badge>
  );
}

function ImportReview({ importId, status }: { importId: string; status: string }) {
  const qc = useQueryClient();
  const apply = useServerFn(applyImportRow);
  const applyBatch = useServerFn(applyImportBatch);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  const rows = useQuery({
    queryKey: ["sie-rows", importId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_rows")
        .select(
          "id,row_index,client_name,client_phone,description,amount,occurred_at,payment_method,confidence,status,notes,parsed",
        )
        .eq("import_id", importId)
        .order("confidence", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    refetchInterval: 4_000,
  });

  useEffect(() => {
    qc.invalidateQueries({ queryKey: ["sie-imports"] });
  }, [rows.data, qc]);

  const checkableRows =
    rows.data?.filter((r) => r.status !== "applied" && r.status !== "skipped") ?? [];
  const allChecked =
    checkableRows.length > 0 && checkableRows.every((r) => selectedRowIds.has(r.id));
  const someChecked =
    checkableRows.length > 0 && checkableRows.some((r) => selectedRowIds.has(r.id)) && !allChecked;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRowIds(new Set(checkableRows.map((r) => r.id)));
    } else {
      setSelectedRowIds(new Set());
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    const next = new Set(selectedRowIds);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    setSelectedRowIds(next);
  };

  async function toggleIsExpense(row: Row) {
    const currentParsed = row.parsed || {};
    const isExpenseCurrent = currentParsed.isExpense ?? false;
    const nextIsExpense = !isExpenseCurrent;
    const updatedParsed = {
      ...currentParsed,
      isExpense: nextIsExpense,
    };

    // Update local query cache optimistically
    qc.setQueryData(["sie-rows", importId], (old: Row[] | undefined) => {
      if (!old) return [];
      return old.map((item) => (item.id === row.id ? { ...item, parsed: updatedParsed } : item));
    });

    try {
      const { error } = await supabase
        .from("import_rows")
        .update({ parsed: updatedParsed as any })
        .eq("id", row.id);

      if (error) throw error;
      toast.success(`Lançamento alterado para ${nextIsExpense ? "Despesa" : "Receita"}`);
    } catch (e) {
      toast.error("Erro ao alterar tipo: " + (e as Error).message);
      qc.invalidateQueries({ queryKey: ["sie-rows", importId] });
    }
  }

  async function toggleIsContribution(row: Row) {
    const currentParsed = row.parsed || {};
    const nextIsContribution = !(currentParsed.isContribution ?? false);
    const updatedParsed = { ...currentParsed, isContribution: nextIsContribution, isExpense: false };

    qc.setQueryData(["sie-rows", importId], (old: Row[] | undefined) => {
      if (!old) return [];
      return old.map((item) => (item.id === row.id ? { ...item, parsed: updatedParsed } : item));
    });

    try {
      const { error } = await supabase
        .from("import_rows")
        .update({ parsed: updatedParsed as any })
        .eq("id", row.id);
      if (error) throw error;
      toast.success(`Lançamento alterado para ${nextIsContribution ? "Aporte" : "Receita"}`);
    } catch (e) {
      toast.error("Erro ao alterar tipo: " + (e as Error).message);
      qc.invalidateQueries({ queryKey: ["sie-rows", importId] });
    }
  }


  if (status === "uploaded" || status === "processing") {
    return (
      <div className="mt-3 border-t pt-6 pb-8 flex flex-col items-center justify-center text-center space-y-3 bg-muted/20 rounded-lg">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <div>
          <p className="text-sm font-medium">Análise em andamento...</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
            Estamos extraindo as linhas e identificando os dados do arquivo de forma inteligente.
            Esta tela se atualizará sozinha em instantes.
          </p>
        </div>
      </div>
    );
  }

  async function approve(id: string) {
    setBusy(id);
    try {
      await apply({ data: { rowId: id, createAppointment: true } });
      toast.success("Linha enfileirada para aplicação.");
      qc.invalidateQueries({ queryKey: ["sie-rows", importId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function refuse(id: string) {
    setBusy(`refuse-${id}`);
    try {
      const { error } = await supabase
        .from("import_rows")
        .update({ status: "skipped" })
        .eq("id", id);
      if (error) throw error;
      toast.success("Lançamento recusado.");
      qc.invalidateQueries({ queryKey: ["sie-rows", importId] });
    } catch (e) {
      toast.error("Erro ao recusar: " + (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function approveAll() {
    try {
      const res = await applyBatch({ data: { importId, minConfidence: 85 } });
      toast.success(`${res.queued} linhas enfileiradas (≥85% de confiança).`);
      qc.invalidateQueries({ queryKey: ["sie-rows", importId] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function approveSelected() {
    if (selectedRowIds.size === 0) return;
    setBusy("batch-selected");
    try {
      const res = await applyBatch({ data: { rowIds: Array.from(selectedRowIds) } });
      toast.success(`${res.queued} lançamentos selecionados enfileirados para aplicação.`);
      setSelectedRowIds(new Set());
      qc.invalidateQueries({ queryKey: ["sie-rows", importId] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-3 border-t pt-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <span>{rows.data?.length ?? 0} linhas</span>
          {selectedRowIds.size > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {selectedRowIds.size} selecionadas
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedRowIds.size > 0 && (
            <Button size="sm" variant="default" disabled={busy != null} onClick={approveSelected}>
              {busy === "batch-selected" ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5 mr-1" />
              )}
              Aplicar Selecionados ({selectedRowIds.size})
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={approveAll} disabled={busy != null}>
            <Check className="h-3.5 w-3.5 mr-1" /> Aprovar todas ≥85%
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="p-1 w-8 text-center">
                <Checkbox
                  checked={allChecked || (someChecked ? "indeterminate" : false)}
                  onCheckedChange={(checked) => handleSelectAll(!!checked)}
                  aria-label="Selecionar todas as linhas"
                />
              </th>
              <th className="text-left p-1">Cliente</th>
              <th className="text-left p-1">Telefone</th>
              <th className="text-left p-1">Descrição</th>
              <th className="text-left p-1">Tipo</th>
              <th className="text-right p-1">Valor</th>
              <th className="text-left p-1">Data</th>
              <th className="text-right p-1">Score</th>
              <th className="text-left p-1">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(rows.data ?? []).map((r) => {
              const isExpense = r.parsed?.isExpense ?? false;
              const isContribution = r.parsed?.isContribution ?? false;
              const rowLocked = r.status === "applied" || r.status === "skipped" || busy != null;

              return (
                <tr
                  key={r.id}
                  className="border-t animate-fade-in hover:bg-muted/10 transition-colors"
                >
                  <td className="p-1 w-8 text-center">
                    {r.status !== "applied" && r.status !== "skipped" ? (
                      <Checkbox
                        checked={selectedRowIds.has(r.id)}
                        onCheckedChange={(checked) => handleSelectRow(r.id, !!checked)}
                        aria-label={`Selecionar linha ${r.row_index}`}
                      />
                    ) : r.status === "applied" ? (
                      <div
                        className="text-emerald-500 font-bold text-center"
                        title="Lançamento Aplicado"
                      >
                        ✓
                      </div>
                    ) : (
                      <div
                        className="text-rose-500 font-bold text-center"
                        title="Lançamento Recusado"
                      >
                        ✗
                      </div>
                    )}
                  </td>
                  <td className="p-1 font-medium">{r.client_name || "—"}</td>
                  <td className="p-1 tabular-nums">
                    {r.client_phone ? formatPhoneBR(r.client_phone) : "—"}
                  </td>
                  <td className="p-1 max-w-[200px]">
                    <div className="font-medium truncate" title={r.description ?? ""}>
                      {r.description ?? "—"}
                    </div>
                    {r.notes && (
                      <div
                        className={`text-[10px] flex items-center gap-1 mt-0.5 ${
                          r.parsed?.isDuplicate
                            ? "text-amber-600 font-semibold"
                            : "text-muted-foreground"
                        }`}
                        title={r.notes}
                      >
                        {r.parsed?.isDuplicate && (
                          <AlertTriangle className="h-3 w-3 shrink-0 animate-bounce" />
                        )}
                        <span className="truncate">{r.notes}</span>
                      </div>
                    )}
                  </td>
                  <td className="p-1">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <Switch
                          id={`type-switch-${r.id}`}
                          checked={isExpense}
                          onCheckedChange={() => toggleIsExpense(r)}
                          disabled={rowLocked}
                        />
                        <Label
                          htmlFor={`type-switch-${r.id}`}
                          className={`text-[10px] font-semibold cursor-pointer select-none transition-colors ${
                            isExpense ? "text-rose-500" : "text-emerald-500"
                          }`}
                        >
                          {isExpense ? "Despesa" : "Receita"}
                        </Label>
                      </div>
                      {!isExpense && (
                        <Select
                          value={isContribution ? "aporte" : "receita"}
                          onValueChange={(v) => {
                            const next = v === "aporte";
                            if (next !== isContribution) toggleIsContribution(r);
                          }}
                          disabled={rowLocked}
                        >
                          <SelectTrigger className="h-6 text-[10px] px-2 py-0 w-[88px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="receita" className="text-[11px]">
                              Receita
                            </SelectItem>
                            <SelectItem value="aporte" className="text-[11px]">
                              Aporte
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </td>

                  <td className="p-1 text-right tabular-nums">
                    {r.amount != null ? `R$ ${Number(r.amount).toFixed(2)}` : "—"}
                  </td>
                  <td className="p-1">{r.occurred_at ?? "—"}</td>
                  <td className="p-1 text-right tabular-nums">
                    <ConfidenceChip value={r.confidence} />
                  </td>
                  <td className="p-1">
                    <RowStatusBadge status={r.status} isDuplicate={r.parsed?.isDuplicate} />
                  </td>
                  <td className="p-1 text-right">
                    {r.status !== "applied" && r.status !== "skipped" && (
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant={r.parsed?.isDuplicate ? "default" : "ghost"}
                          className={
                            r.parsed?.isDuplicate
                              ? "bg-amber-500 text-white hover:bg-amber-600 shadow-sm"
                              : "hover:bg-primary/10 hover:text-primary"
                          }
                          disabled={busy !== null}
                          onClick={() => approve(r.id)}
                          title="Confirmar lançamento"
                        >
                          {busy === r.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Confirmar"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-rose-500 hover:text-rose-700 hover:bg-rose-50 font-medium"
                          disabled={busy !== null}
                          onClick={() => refuse(r.id)}
                          title="Recusar lançamento"
                        >
                          {busy === `refuse-${r.id}` ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Recusar"
                          )}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConfidenceChip({ value }: { value: number }) {
  const tone = value >= 95 ? "text-emerald-600" : value >= 70 ? "text-amber-600" : "text-rose-600";
  return <span className={`font-semibold ${tone}`}>{value}%</span>;
}
