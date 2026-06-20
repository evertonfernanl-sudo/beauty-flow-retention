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
    if (!confirm("Tem certeza que deseja excluir esta importação? Isso removerá o histórico do arquivo, mas NÃO apagará os clientes ou agendamentos criados por ela.")) {
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
};

function ImportReview({ importId, status }: { importId: string; status: string }) {
  const qc = useQueryClient();
  const apply = useServerFn(applyImportRow);
  const applyBatch = useServerFn(applyImportBatch);
  const [busy, setBusy] = useState<string | null>(null);

  const rows = useQuery({
    queryKey: ["sie-rows", importId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("import_rows")
        .select(
          "id,row_index,client_name,client_phone,description,amount,occurred_at,payment_method,confidence,status,notes",
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

  async function approveAll() {
    try {
      const res = await applyBatch({ data: { importId, minConfidence: 85 } });
      toast.success(`${res.queued} linhas enfileiradas (≥85% de confiança).`);
      qc.invalidateQueries({ queryKey: ["sie-rows", importId] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="mt-3 border-t pt-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{rows.data?.length ?? 0} linhas</div>
        <Button size="sm" variant="secondary" onClick={approveAll}>
          <Check className="h-3.5 w-3.5 mr-1" /> Aprovar todas ≥85%
        </Button>
      </div>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left p-1">Cliente</th>
              <th className="text-left p-1">Telefone</th>
              <th className="text-left p-1">Descrição</th>
              <th className="text-right p-1">Valor</th>
              <th className="text-left p-1">Data</th>
              <th className="text-right p-1">Score</th>
              <th className="text-left p-1">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(rows.data ?? []).map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-1">{r.client_name || "—"}</td>
                <td className="p-1">{r.client_phone ? formatPhoneBR(r.client_phone) : "—"}</td>
                <td className="p-1 max-w-[200px] truncate" title={r.description ?? ""}>
                  {r.description ?? "—"}
                </td>
                <td className="p-1 text-right tabular-nums">
                  {r.amount != null ? `R$ ${Number(r.amount).toFixed(2)}` : "—"}
                </td>
                <td className="p-1">{r.occurred_at ?? "—"}</td>
                <td className="p-1 text-right tabular-nums">
                  <ConfidenceChip value={r.confidence} />
                </td>
                <td className="p-1">
                  <Badge variant="outline">{r.status}</Badge>
                </td>
                <td className="p-1 text-right">
                  {r.status !== "applied" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === r.id}
                      onClick={() => approve(r.id)}
                    >
                      {busy === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Aplicar"}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
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
