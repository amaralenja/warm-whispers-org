import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { KeyRound, Plus, Copy, ShieldOff, Loader2, ShieldAlert, Radio, Download } from "lucide-react";

import {
  listHtApiTokens,
  createHtApiToken,
  revokeHtApiToken,
  listHtQuizSubmissions,
} from "@/lib/ht-api.functions";
import { getVendorSession } from "@/lib/vendor-session";

export const Route = createFileRoute("/_authenticated/ht-api")({
  component: HtApiPage,
});

function HtApiPage() {
  const qc = useQueryClient();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    // Só administradores (sem vendor_session) enxergam essa aba.
    setIsAdmin(getVendorSession() === null);
  }, []);

  const listTokens = useServerFn(listHtApiTokens);
  const createTok = useServerFn(createHtApiToken);
  const revokeTok = useServerFn(revokeHtApiToken);
  const listSubs = useServerFn(listHtQuizSubmissions);

  const tokensQ = useQuery({
    queryKey: ["ht-api-tokens"],
    queryFn: () => listTokens(),
    enabled: isAdmin === true,
  });

  const subsQ = useQuery({
    queryKey: ["ht-quiz-submissions"],
    queryFn: () => listSubs(),
    enabled: isAdmin === true,
    refetchInterval: 15000,
  });

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [freshToken, setFreshToken] = useState<string | null>(null);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return toast.error("Dá um nome pro token");
    setCreating(true);
    try {
      const res = await createTok({ data: { name } });
      setFreshToken(res.token);
      setNewName("");
      qc.invalidateQueries({ queryKey: ["ht-api-tokens"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao gerar token");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string, name: string) {
    if (!confirm(`Revogar o token "${name}"? Depois de revogado, ele para de funcionar imediatamente.`)) return;
    try {
      await revokeTok({ data: { id } });
      qc.invalidateQueries({ queryKey: ["ht-api-tokens"] });
      toast.success("Token revogado");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao revogar");
    }
  }

  const endpoint = "https://multium.vercel.app/api/public/ht-quiz/submit";


  const curlSample = `curl -X POST '${endpoint}' \\
  -H 'Authorization: Bearer SEU_TOKEN' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "nome": "João da Silva",
    "email": "joao@email.com",
    "whatsapp": "+5511999999999",
    "instagram": "@joao",
    "utm_source": "fb",
    "utm_campaign": "ht_setembro",
    "utm_content": "criativo_01",
    "fbc": "fb.1.1700000000.IwAR...",
    "fbp": "fb.1.1700000000.987654",
    "fbclid": "IwAR...",
    "respostas": {
      "faturamento": "R$ 10k-30k",
      "momento": "escalando",
      "objetivo": "faturar mais"
    }
  }'`;

  if (isAdmin === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <ShieldAlert className="h-10 w-10 text-amber-400" />
            <h2 className="text-lg font-semibold">Área restrita</h2>
            <p className="text-sm text-muted-foreground">
              Essa aba é só pra administradores.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tokens = tokensQ.data?.tokens ?? [];
  const subs = subsQ.data?.submissions ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <KeyRound className="h-6 w-6 text-accent" />
            API do High Ticket
          </h1>
          <p className="text-sm text-muted-foreground">
            Endpoint público, write-only, pra o quiz externo (Typebot) enviar leads pra dentro do sistema.
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <Radio className="h-3 w-3" /> {subs.length} envios recentes
        </Badge>
      </header>

      {/* Tokens */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Tokens de acesso
            </h2>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome do token (ex: Typebot Quiz HT)"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              maxLength={80}
            />
            <Button onClick={handleCreate} disabled={creating} className="gap-2">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Gerar token
            </Button>
          </div>

          <div className="rounded-md border border-border">
            {tokensQ.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : tokens.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Nenhum token ainda. Gera o primeiro aí em cima.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left">Nome</th>
                    <th className="p-3 text-left">Prefixo</th>
                    <th className="p-3 text-left">Criado</th>
                    <th className="p-3 text-left">Último uso</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((t) => (
                    <tr key={t.id} className="border-b border-border/50 last:border-0">
                      <td className="p-3 font-medium">{t.name}</td>
                      <td className="p-3 font-mono text-xs">{t.token_prefix}…</td>
                      <td className="p-3 text-muted-foreground">
                        {new Date(t.created_at).toLocaleString("pt-BR")}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {t.last_used_at ? new Date(t.last_used_at).toLocaleString("pt-BR") : "—"}
                      </td>
                      <td className="p-3">
                        {t.revoked_at ? (
                          <Badge variant="outline" className="bg-rose-500/10 text-rose-300">Revogado</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-300">Ativo</Badge>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {!t.revoked_at && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRevoke(t.id, t.name)}
                            className="text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
                          >
                            <ShieldOff className="mr-1 h-3 w-3" /> Revogar
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Docs */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Documentação da API
          </h2>

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Endpoint</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border border-border bg-muted/40 p-2 font-mono text-xs">
                POST {endpoint}
              </code>
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(endpoint); toast.success("Copiado"); }}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Autenticação</p>
            <p className="text-sm">
              Envie o token no header <code className="rounded bg-muted/50 px-1 font-mono text-xs">Authorization: Bearer &lt;token&gt;</code>.
              O endpoint é <b>write-only</b>: só aceita POST, nunca devolve dados.
            </p>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Campos aceitos (todos opcionais, tudo string exceto <code>respostas</code>)</p>
            <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
              {[
                "nome","email","whatsapp","instagram",
                "utm_source","utm_medium","utm_campaign","utm_content",
                "fbc","fbp","fbclid","gclid",
                "respostas (JSON)",
              ].map((f) => (
                <code key={f} className="rounded bg-muted/40 px-2 py-1 font-mono">{f}</code>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Qualquer campo extra vira parte do payload cru (<code>raw</code>) e fica salvo pra análise depois.
            </p>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Exemplo cURL</p>
            <div className="relative">
              <pre className="max-h-72 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
{curlSample}
              </pre>
              <Button
                size="sm"
                variant="outline"
                className="absolute right-2 top-2"
                onClick={() => { navigator.clipboard.writeText(curlSample); toast.success("Copiado"); }}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Respostas</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li><code className="text-emerald-300">200</code> — <code>{`{ ok: true, id, received_at }`}</code></li>
              <li><code className="text-amber-300">400</code> — JSON inválido</li>
              <li><code className="text-rose-300">401</code> — token ausente, inválido ou revogado</li>
              <li><code className="text-rose-300">500</code> — erro interno</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Formulário pronto pra baixar */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Formulário 2 (HTML pronto)
          </h2>
          <p className="text-sm text-muted-foreground">
            Formulário do quiz já configurado pra enviar os leads pra essa API — <strong>já vem com token embutido</strong>{" "}
            (<code className="rounded bg-muted/50 px-1 font-mono text-xs">HT_API_TOKEN</code> preenchido em{" "}
            <code className="rounded bg-muted/50 px-1 font-mono text-xs">index.html</code>). Só baixar, descompactar
            e subir no servidor do cliente. O token é apenas de <strong>POST</strong>, não permite leitura.
          </p>

          <div className="flex flex-wrap gap-2">
            <a href="/downloads/form-multium.zip" download>
              <Button className="gap-2">
                <Download className="h-4 w-4" /> Baixar form-multium.zip
              </Button>
            </a>
            <Badge variant="outline" className="gap-1 self-center">
              endpoint já apontado pra <code className="font-mono">{endpoint}</code>
            </Badge>
          </div>
        </CardContent>
      </Card>


      {/* Últimos envios */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Últimos envios recebidos
          </h2>
          <div className="rounded-md border border-border">
            {subsQ.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : subs.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Nenhum envio ainda. Configura o Typebot pra usar o endpoint acima.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-border text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left">Quando</th>
                    <th className="p-3 text-left">Nome</th>
                    <th className="p-3 text-left">Email</th>
                    <th className="p-3 text-left">WhatsApp</th>
                    <th className="p-3 text-left">Instagram</th>
                    <th className="p-3 text-left">Respostas</th>
                    <th className="p-3 text-left">Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map((s: any) => {
                    const r = (s.respostas && typeof s.respostas === "object") ? s.respostas : null;
                    const CAIXA_LABELS: Record<string, string> = {
                      A: "Até R$ 1k", B: "R$ 1k–5k", C: "R$ 5k–10k",
                      D: "R$ 10k–30k", E: "R$ 30k–50k", F: "R$ 50k–100k", G: "R$ 100k+",
                    };
                    const KEY_LABELS: Record<string, string> = {
                      caixa: "Caixa", caixa_letra: "Caixa", caixa_label: "Caixa",
                      faturamento: "Faturamento", momento: "Momento", objetivo: "Objetivo",
                      investir: "Já investiu?", minicurso: "Ideia SaaS",
                      socio: "Sócio/Cônjuge", comprometimento: "Comprometimento",
                    };
                    const prettyVal = (k: string, v: any): string => {
                      if (v == null || v === "") return "";
                      if (typeof v === "object") {
                        v = (v as any).label ?? (v as any).value ?? JSON.stringify(v);
                      }
                      const str = String(v).trim();
                      if (/^caixa/i.test(k) && /^[A-G]$/i.test(str)) {
                        return `${str.toUpperCase()} · ${CAIXA_LABELS[str.toUpperCase()]}`;
                      }
                      return str;
                    };
                    const respEntries = r
                      ? Object.entries(r)
                          .map(([k, v]) => [k, prettyVal(k, v)] as [string, string])
                          .filter(([, v]) => v !== "")
                      : [];
                    return (
                      <tr key={s.id} className="border-b border-border/50 last:border-0 align-top">
                        <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(s.received_at).toLocaleString("pt-BR")}
                        </td>
                        <td className="p-3">{s.nome ?? "—"}</td>
                        <td className="p-3">{s.email ?? "—"}</td>
                        <td className="p-3 font-mono text-xs">{s.whatsapp ?? "—"}</td>
                        <td className="p-3 text-xs">{s.instagram ?? "—"}</td>
                        <td className="p-3 text-xs max-w-[280px]">
                          {respEntries.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <details>
                              <summary className="cursor-pointer text-accent">
                                {respEntries.length} campo{respEntries.length > 1 ? "s" : ""}
                              </summary>
                              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                                {respEntries.map(([k, v]) => (
                                  <li key={k}>
                                    <b className="text-foreground">{KEY_LABELS[k] ?? k}:</b> {v}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </td>
                        <td className="p-3 text-xs max-w-[280px]">
                          {(() => {
                            const hasFb = !!(s.fbc || s.fbp || s.fbclid);
                            const hasG = !!s.gclid;
                            const src = (s.utm_source ?? "").toLowerCase();
                            const isPaid = hasFb || hasG || ["fb","facebook","ig","instagram","meta","google","tiktok","ads","paid"].some((k) => src.includes(k));
                            const badge = isPaid
                              ? { label: "PAGO", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" }
                              : (s.utm_source ? { label: "REFERRAL", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30" }
                                              : { label: "ORGÂNICO", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" });
                            const parts = [
                              s.utm_source && ["source", s.utm_source],
                              s.utm_medium && ["medium", s.utm_medium],
                              s.utm_campaign && ["campaign", s.utm_campaign],
                              s.utm_content && ["content", s.utm_content],
                              s.fbclid && ["fbclid", String(s.fbclid).slice(0, 20) + "…"],
                              s.gclid && ["gclid", String(s.gclid).slice(0, 20) + "…"],
                              s.fbc && ["fbc", "✓"],
                              s.fbp && ["fbp", "✓"],
                            ].filter(Boolean) as [string, string][];
                            return (
                              <div className="space-y-1">
                                <span className={`inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${badge.cls}`}>
                                  {badge.label}
                                </span>
                                {parts.length === 0 ? (
                                  <div className="text-muted-foreground">Sem UTM/pixel</div>
                                ) : (
                                  <details>
                                    <summary className="cursor-pointer text-accent">
                                      {parts.length} parâmetro{parts.length > 1 ? "s" : ""}
                                    </summary>
                                    <ul className="mt-1 space-y-0.5 text-muted-foreground break-all">
                                      {parts.map(([k, v]) => (
                                        <li key={k}><b className="text-foreground">{k}:</b> {v}</li>
                                      ))}
                                    </ul>
                                  </details>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dialog: token gerado */}
      <Dialog open={!!freshToken} onOpenChange={(v) => !v && setFreshToken(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-emerald-400" />
              Token gerado
            </DialogTitle>
            <DialogDescription>
              <b>Copia agora.</b> Por segurança, esse token não vai aparecer de novo — só o prefixo fica salvo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-md border border-border bg-muted/40 p-3 font-mono text-xs">
              {freshToken}
            </code>
            <Button
              onClick={() => {
                if (!freshToken) return;
                navigator.clipboard.writeText(freshToken);
                toast.success("Token copiado");
              }}
            >
              <Copy className="mr-1 h-4 w-4" /> Copiar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
