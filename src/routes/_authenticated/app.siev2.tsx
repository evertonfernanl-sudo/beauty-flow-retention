import { createFileRoute, Link } from "@tanstack/react-router";
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
import { registerImportV2 as registerImport, applyImportRowV2 as applyImportRow, applyImportBatchV2 as applyImportBatch, convertPdfToCsvV2 as convertPdfToCsv } from "@/lib/api/siev2.functions";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";
import { useFeature } from "@/lib/hooks/use-feature";
import { formatPhoneBR } from "@/lib/phone";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";


export const Route = createFileRoute("/_authenticated/app/siev2")({
  head: () => ({ meta: [{ title: "Importar Dados V2 · BeautyFlow" }] }),
  component: SieV2Page,
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

function SieV2Page() {
  const profile = useCurrentProfile().data;
  const companyId = profile?.company?.id;
  const feature = useFeature(companyId, "smart_import");
  const register = useServerFn(registerImport);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  // PDF to CSV Converter states
  const convertFn = useServerFn(convertPdfToCsv);
  const [converting, setConverting] = useState(false);
  const convertFileRef = useRef<HTMLInputElement>(null);

  const imports = useQuery({
    enabled: !!companyId,
    queryKey: ["sie-imports-v2", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("imports")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;

      const now = new Date().getTime();
      const mapped = (data ?? []).map((imp) => {
        const createdTime = new Date(imp.created_at).getTime();
        const elapsed = now - createdTime;
        if ((imp.status === "processing" || imp.status === "uploaded") && elapsed > 120_000) {
          return {
            ...imp,
            status: "failed",
            last_error: imp.last_error || "O processamento síncrono excedeu o limite de 2 minutos e foi interrompido na nuvem (Gateway Timeout). O arquivo pode ser muito complexo ou o motor de OCR sofreu timeout do container da plataforma.",
          };
        }
        return imp;
      });
      return mapped as ImportRow[];
    },
    refetchInterval: 5_000,
  });

  async function onPick(file: File) {
    if (!companyId) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["csv", "xlsx", "xls", "pdf"].includes(ext)) {
      toast.error("Use CSV, XLSX ou PDF (nativo/OCR).");
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
      if (res && "success" in res && !res.success) {
        throw new Error(res.error || "Falha no processamento de importação");
      }
      toast.success(
        source === "pdf"
          ? "PDF enviado — convertendo em memória e unificando pipeline…"
          : "Arquivo enviado — processamento em segundo plano.",
      );
      setSelected(res.importId);
      qc.invalidateQueries({ queryKey: ["sie-imports-v2"] });
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
      qc.invalidateQueries({ queryKey: ["sie-imports-v2"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function onConvertPdf(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "pdf") {
      toast.error("Por favor, selecione apenas arquivos PDF.");
      return;
    }
    setConverting(true);
    const toastId = toast.loading("Convertendo PDF para CSV... Isso pode levar alguns segundos se o arquivo necessitar de OCR.");
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
          const res = reader.result as string;
          const base64Str = res.split(",")[1];
          resolve(base64Str);
        };
        reader.onerror = (error) => reject(error);
      });

      const res = await convertFn({
        data: {
          base64,
          filename: file.name,
        }
      });

      if (res && "success" in res && !res.success) {
        throw new Error(res.error || "Falha na conversão do PDF.");
      }

      const csvText = (res as any).csvText;
      if (!csvText) {
        throw new Error("O arquivo CSV gerado está vazio.");
      }

      const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", file.name.replace(/\.pdf$/i, ".csv"));
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("PDF convertido com sucesso! O download iniciou automaticamente.", { id: toastId });
    } catch (err: any) {
      console.error("[onConvertPdf Error]:", err);
      toast.error(`Falha ao converter PDF: ${err.message || String(err)}`, { id: toastId });
    } finally {
      setConverting(false);
      if (convertFileRef.current) convertFileRef.current.value = "";
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
          <Sparkles className="h-6 w-6 text-primary" /> Importar Dados V2 (SIE V2)
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Envie CSV, XLSX ou PDF (nativo/OCR). O sistema converte PDFs em memória de forma transparente
          e unifica o pipeline sob o mesmo fluxo de validação e importação.
        </p>
      </div>

      {/* SIE V1 Back Banner */}
      <Card className="p-4 border border-muted bg-muted/20 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="font-semibold text-muted-foreground flex items-center gap-1.5 text-sm">
            <Sparkles className="h-4 w-4 text-muted-foreground" /> Você está usando a versão V2 (SIE V2)
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Esta é a versão experimental com pipeline unificado. Para voltar à versão clássica, use o botão ao lado.
          </p>
        </div>
        <Link to="/app/sie">
          <Button size="sm" variant="outline">Voltar para V1</Button>
        </Link>
      </Card>

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
                Aceita <strong>CSV</strong>, <strong>XLSX</strong> e <strong>PDF (nativo/OCR)</strong>.
                Todos convertidos e processados sob o mesmo pipeline unificado.
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

      {/* PDF to CSV Direct Converter Tool */}
      <Card className="p-5 border border-primary/20 bg-primary/5">
        <input
          ref={convertFileRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onConvertPdf(f);
          }}
        />
        <div
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) onConvertPdf(f);
          }}
          className="border-2 border-dashed border-primary/30 rounded-lg p-6 flex items-center justify-between gap-3 flex-wrap hover:border-primary/60 transition"
        >
          <div className="flex items-center gap-3">
            <Sparkles className="h-8 w-8 text-primary animate-pulse" />
            <div>
              <div className="font-semibold text-primary">
                Ferramenta: Converter PDF diretamente para Planilha (CSV)
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Arraste um PDF (nativo ou escaneado) para baixar sua tabela limpa de dados em CSV. 
                Nenhuma regra de negócio (clientes, transações ou deduplicação) será aplicada.
              </div>
            </div>
          </div>
          <Button 
            variant="outline"
            className="border-primary/40 hover:bg-primary/10 text-primary"
            onClick={() => convertFileRef.current?.click()} 
            disabled={converting}
          >
            {converting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Convertendo…
              </>
            ) : (
              <>
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Converter PDF
              </>
            )}
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Importações V2</h2>
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
                  <div className="text-xs text-destructive mt-2 p-3 bg-destructive/5 border border-destructive/10 rounded-md whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">
                    <div className="flex items-center gap-1.5 font-semibold mb-1 text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" /> Falha no Processamento
                    </div>
                    {imp.last_error}
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
    revenueKindSet?: boolean;
    expenseScope?: "empresa" | "pessoal";
    originalPayerName?: string;
    clientIdOverride?: string;
    isBankFee?: boolean;
    isBankInterest?: boolean;
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
    internal: { label: "Mov. Interna", className: "bg-purple-50 text-purple-700 border-purple-200" },
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
  const [pickerRow, setPickerRow] = useState<Row | null>(null);

  function canConfirm(r: Row): boolean {
    const p = r.parsed || {};
    if (p.isExpense) return p.expenseScope === "empresa" || p.expenseScope === "pessoal";
    return p.revenueKindSet === true;
  }
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  const rows = useQuery({
    queryKey: ["sie-rows-v2", importId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_rows")
        .select(
          "id,row_index,client_name,client_phone,description,amount,occurred_at,payment_method,confidence,status,notes,parsed",
        )
        .eq("import_id", importId)
        .order("occurred_at", { ascending: true })
        .order("row_index", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    refetchInterval: 4_000,
  });

  useEffect(() => {
    qc.invalidateQueries({ queryKey: ["sie-imports-v2"] });
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
    qc.setQueryData(["sie-rows-v2", importId], (old: Row[] | undefined) => {
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
      qc.invalidateQueries({ queryKey: ["sie-rows-v2", importId] });
    }
  }

  async function setRevenueKind(row: Row, kind: "receita" | "aporte") {
    const currentParsed = row.parsed || {};
    const updatedParsed = {
      ...currentParsed,
      isExpense: false,
      isContribution: kind === "aporte",
      revenueKindSet: true,
    };
    qc.setQueryData(["sie-rows-v2", importId], (old: Row[] | undefined) => {
      if (!old) return [];
      return old.map((item) => (item.id === row.id ? { ...item, parsed: updatedParsed } : item));
    });
    try {
      const { error } = await supabase
        .from("import_rows")
        .update({ parsed: updatedParsed as any })
        .eq("id", row.id);
      if (error) throw error;
      toast.success(`Lançamento definido como ${kind === "aporte" ? "Aporte" : "Receita"}`);
    } catch (e) {
      toast.error("Erro ao alterar tipo: " + (e as Error).message);
      qc.invalidateQueries({ queryKey: ["sie-rows-v2", importId] });
    }
  }

  async function setExpenseScope(row: Row, scope: "empresa" | "pessoal") {
    const currentParsed = row.parsed || {};
    const updatedParsed = { ...currentParsed, expenseScope: scope, isExpense: true };
    qc.setQueryData(["sie-rows-v2", importId], (old: Row[] | undefined) => {
      if (!old) return [];
      return old.map((item) => (item.id === row.id ? { ...item, parsed: updatedParsed } : item));
    });
    try {
      const { error } = await supabase
        .from("import_rows")
        .update({ parsed: updatedParsed as any })
        .eq("id", row.id);
      if (error) throw error;
      toast.success(`Despesa classificada como ${scope === "empresa" ? "Empresa" : "Pessoal"}`);
    } catch (e) {
      toast.error("Erro ao classificar despesa: " + (e as Error).message);
      qc.invalidateQueries({ queryKey: ["sie-rows-v2", importId] });
    }
  }

  async function setClientOverride(
    row: Row,
    client: { id: string; name: string; phone: string | null },
  ) {
    const currentParsed = row.parsed || {};
    const originalPayerName = currentParsed.originalPayerName ?? row.client_name ?? "";
    const updatedParsed = {
      ...currentParsed,
      originalPayerName,
      clientIdOverride: client.id,
    };
    qc.setQueryData(["sie-rows-v2", importId], (old: Row[] | undefined) => {
      if (!old) return [];
      return old.map((item) =>
        item.id === row.id
          ? {
              ...item,
              client_name: client.name,
              client_phone: client.phone,
              parsed: updatedParsed,
              notes: originalPayerName ? `Pagador: ${originalPayerName}` : item.notes,
            }
          : item,
      );
    });
    try {
      const { error } = await supabase
        .from("import_rows")
        .update({
          parsed: updatedParsed as any,
          client_name: client.name,
          client_phone: client.phone,
          resolved_client_id: client.id,
          notes: originalPayerName ? `Pagador: ${originalPayerName}` : null,
          status: "matched",
        })
        .eq("id", row.id);
      if (error) throw error;
      toast.success(`Cliente associado: ${client.name}`);
    } catch (e) {
      toast.error("Erro ao associar cliente: " + (e as Error).message);
      qc.invalidateQueries({ queryKey: ["sie-rows-v2", importId] });
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
      qc.invalidateQueries({ queryKey: ["sie-rows-v2", importId] });
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
      qc.invalidateQueries({ queryKey: ["sie-rows-v2", importId] });
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
      qc.invalidateQueries({ queryKey: ["sie-rows-v2", importId] });
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
      qc.invalidateQueries({ queryKey: ["sie-rows-v2", importId] });
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
              <th className="text-left p-1 w-[130px] max-w-[130px] truncate">Cliente</th>
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
              const rowLocked = r.status === "applied" || r.status === "skipped" || busy != null;

              return (
                <tr
                  key={r.id}
                  className="border-t animate-fade-in hover:bg-muted/10 transition-colors"
                >
                  <td className="p-1 w-8 text-center">
                    {r.status !== "applied" && r.status !== "skipped" && r.status !== "internal" ? (
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
                    ) : r.status === "skipped" ? (
                      <div
                        className="text-rose-500 font-bold text-center"
                        title="Lançamento Recusado"
                      >
                        ✗
                      </div>
                    ) : null}
                  </td>
                  <td className="p-1 font-medium w-[130px] max-w-[130px] truncate">
                    {r.status !== "applied" && r.status !== "skipped" && r.status !== "internal" && !r.parsed?.isBankFee && !r.parsed?.isBankInterest ? (
                      <button
                        type="button"
                        onClick={() => setPickerRow(r)}
                        className="text-left hover:text-primary hover:underline underline-offset-2 transition-colors"
                        title="Tocar para associar a outro cliente"
                      >
                        {r.client_name || "— associar cliente"}
                      </button>
                    ) : (
                      <span>{r.client_name || "—"}</span>
                    )}
                    {r.parsed?.originalPayerName &&
                      r.parsed.originalPayerName !== r.client_name && (
                        <div className="text-[10px] text-muted-foreground italic mt-0.5">
                          Pagador: {r.parsed.originalPayerName}
                        </div>
                      )}
                  </td>
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
                    {r.status !== "internal" && !r.parsed?.isBankFee && !r.parsed?.isBankInterest ? (
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
                        {isExpense ? (
                          <Select
                            value={r.parsed?.expenseScope ?? ""}
                            onValueChange={(v) =>
                              setExpenseScope(r, v as "empresa" | "pessoal")
                            }
                            disabled={rowLocked}
                          >
                            <SelectTrigger
                              className={`h-6 text-[10px] px-2 py-0 w-[96px] ${
                                !r.parsed?.expenseScope ? "border-amber-400" : ""
                              }`}
                            >
                              <SelectValue placeholder="Selecionar" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="empresa" className="text-[11px]">
                                Empresa
                              </SelectItem>
                              <SelectItem value="pessoal" className="text-[11px]">
                                Pessoal
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Select
                            value={
                              r.parsed?.revenueKindSet
                                ? r.parsed?.isContribution
                                  ? "aporte"
                                  : "receita"
                                : ""
                            }
                            onValueChange={(v) =>
                              setRevenueKind(r, v as "receita" | "aporte")
                            }
                            disabled={rowLocked}
                          >
                            <SelectTrigger
                              className={`h-6 text-[10px] px-2 py-0 w-[96px] ${
                                !r.parsed?.revenueKindSet ? "border-amber-400" : ""
                              }`}
                            >
                              <SelectValue placeholder="Selecionar" />
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
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
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
                    {r.status !== "applied" && r.status !== "skipped" && r.status !== "internal" && !r.parsed?.isBankFee && !r.parsed?.isBankInterest && (
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant={r.parsed?.isDuplicate ? "default" : "ghost"}
                          className={
                            r.parsed?.isDuplicate
                              ? "bg-amber-500 text-white hover:bg-amber-600 shadow-sm"
                              : "hover:bg-primary/10 hover:text-primary"
                          }
                          disabled={busy !== null || !canConfirm(r)}
                          onClick={() => approve(r.id)}
                          title={
                            canConfirm(r)
                              ? "Confirmar lançamento"
                              : isExpense
                                ? "Selecione Empresa ou Pessoal"
                                : "Selecione Receita ou Aporte"
                          }
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
      <ClientPickerDialog
        row={pickerRow}
        onClose={() => setPickerRow(null)}
        onPick={(client) => {
          if (pickerRow) setClientOverride(pickerRow, client);
          setPickerRow(null);
        }}
      />
    </div>
  );
}

function ClientPickerDialog({
  row,
  onClose,
  onPick,
}: {
  row: Row | null;
  onClose: () => void;
  onPick: (client: { id: string; name: string; phone: string | null }) => void;
}) {
  const profile = useCurrentProfile().data;
  const companyId = profile?.company?.id;
  const [search, setSearch] = useState("");

  const clients = useQuery({
    enabled: !!companyId && !!row,
    queryKey: ["sie-client-picker-v2", companyId, search],
    queryFn: async () => {
      let q = supabase
        .from("clients")
        .select("id, name, phone")
        .eq("company_id", companyId!)
        .order("name", { ascending: true })
        .limit(50);
      if (search.trim()) q = q.ilike("name", `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; phone: string | null }>;
    },
  });

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Associar cliente</DialogTitle>
        </DialogHeader>
        {row?.parsed?.originalPayerName || row?.client_name ? (
          <p className="text-xs text-muted-foreground -mt-2">
            Pagador no extrato:{" "}
            <strong>{row?.parsed?.originalPayerName ?? row?.client_name}</strong> — será mantido
            como anotação.
          </p>
        ) : null}
        <Input
          autoFocus
          placeholder="Buscar cliente por nome…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="max-h-80 overflow-y-auto divide-y border rounded-md">
          {clients.isLoading ? (
            <div className="p-3 text-sm text-muted-foreground">Carregando…</div>
          ) : (clients.data ?? []).length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">Nenhum cliente encontrado.</div>
          ) : (
            (clients.data ?? []).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onPick(c)}
                className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors"
              >
                <div className="font-medium text-sm">{c.name}</div>
                {c.phone && (
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {formatPhoneBR(c.phone)}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConfidenceChip({ value }: { value: number }) {
  const tone = value >= 95 ? "text-emerald-600" : value >= 70 ? "text-amber-600" : "text-rose-600";
  return <span className={`font-semibold ${tone}`}>{value}%</span>;
}
