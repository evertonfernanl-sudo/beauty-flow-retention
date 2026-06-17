import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Upload, Check, Loader2, Trash2, Lock } from "lucide-react";
import { toast } from "sonner";
import {
  parseImportText,
  enqueueImportClients,
  type ParsedClient,
} from "@/lib/api/import.functions";
import { formatPhoneBR } from "@/lib/phone";
import { useFeature } from "@/lib/hooks/use-feature";
import { useCurrentProfile } from "@/lib/hooks/use-current-profile";

export const Route = createFileRoute("/_authenticated/app/import")({
  head: () => ({ meta: [{ title: "Smart Import · BeautyFlow" }] }),
  component: ImportPage,
});

const EXAMPLE = `Maria Silva - (11) 99999-1234 - maria@email.com
João Souza, 11988887777
Ana Costa | 11977776666 | aniversário 12/05
Pedro Lima - 11966665555`;

function ImportPage() {
  const profile = useCurrentProfile().data;
  const companyId = profile?.company?.id;
  const feature = useFeature(companyId, "smart_import");

  const parse = useServerFn(parseImportText);
  const enqueue = useServerFn(enqueueImportClients);
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ParsedClient[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  async function runParse() {
    if (text.trim().length < 3) return toast.error("Cole pelo menos algumas linhas.");
    setParsing(true);
    try {
      const res = await parse({ data: { text } });
      setRows(res.clients);
      if (res.clients.length === 0) toast.warning("Nenhum cliente encontrado no texto.");
      else toast.success(`${res.clients.length} clientes identificados pela IA.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setParsing(false);
    }
  }

  async function runCommit() {
    if (rows.length === 0) return;
    setSaving(true);
    try {
      const res = await enqueue({ data: { clients: rows } });
      toast.success(
        `${res.count} clientes enfileirados — importação roda em segundo plano.`,
      );
      setRows([]);
      setText("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }

  if (!feature.loading && !feature.enabled) {
    return (
      <div className="max-w-2xl">
        <Card className="p-8 text-center space-y-3">
          <Lock className="h-10 w-10 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-semibold">Smart Import desativado</h1>
          <p className="text-sm text-muted-foreground">
            Este módulo está desligado para sua empresa. Ative em Admin → Feature Flags.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" /> Smart Import
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cole uma lista de contatos em qualquer formato — CSV, contatos do celular, planilha — e a IA extrai automaticamente.
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Cole seus contatos</label>
          <Button variant="ghost" size="sm" onClick={() => setText(EXAMPLE)}>
            Ver exemplo
          </Button>
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder="Cole CSV, lista do WhatsApp, planilha, etc..."
          className="font-mono text-xs"
        />
        <div className="flex justify-end">
          <Button onClick={runParse} disabled={parsing || !text.trim()}>
            {parsing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analisando…</> : <><Sparkles className="h-4 w-4 mr-2" /> Analisar com IA</>}
          </Button>
        </div>
      </Card>

      {rows.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">Pré-visualização</h2>
              <Badge variant="secondary">{rows.length}</Badge>
            </div>
            <Button onClick={runCommit} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enfileirando…</> : <><Upload className="h-4 w-4 mr-2" /> Importar {rows.length} clientes</>}
            </Button>
          </div>
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground border-b">
                <tr>
                  <th className="text-left px-4 py-2">Nome</th>
                  <th className="text-left px-4 py-2">WhatsApp</th>
                  <th className="text-left px-4 py-2">E-mail</th>
                  <th className="text-left px-4 py-2">Aniversário</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium">{r.name}</td>
                    <td className="px-4 py-2 tabular-nums">{r.phone ? formatPhoneBR(r.phone) : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-2">{r.email || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-2">{r.birthday || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-2 text-right">
                      <Button variant="ghost" size="icon" onClick={() => removeRow(i)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
            <Check className="h-3 w-3" /> Importação roda em fila — o worker processa em segundo plano (1 min).
          </p>
        </Card>
      )}
    </div>
  );
}
