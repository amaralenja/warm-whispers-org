import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, Trash2, SlidersHorizontal, DollarSign, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ht-utm")({
  component: () => <UtmGeneratorPage />,
});

export function UtmGeneratorPage() {
  const [url, setUrl] = useState("https://criarsaas.com/");
  const [source, setSource] = useState("");
  const [medium, setMedium] = useState("");
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [term, setTerm] = useState("");

  const [history, setHistory] = useState<Array<{
    id: string;
    url: string;
    finalUrl: string;
    source: string;
    medium: string;
    campaign: string;
    content: string;
    term: string;
    created_at: string;
  }>>(() => {
    try {
      const stored = localStorage.getItem("ht_utm_history");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const finalUrl = useMemo(() => {
    let cleanUrl = url.trim();
    if (!cleanUrl) return "";
    
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = "https://" + cleanUrl;
    }

    try {
      const parsed = new URL(cleanUrl);
      const params = new URLSearchParams(parsed.search);

      const slugify = (val: string) => {
        const trimmed = val.trim();
        if (/^\{\{.*\}\}$/.test(trimmed)) return trimmed;
        return trimmed.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_.-]/g, "");
      };

      if (source.trim()) params.set("utm_source", slugify(source));
      else params.delete("utm_source");

      if (medium.trim()) params.set("utm_medium", slugify(medium));
      else params.delete("utm_medium");

      if (campaign.trim()) params.set("utm_campaign", slugify(campaign));
      else params.delete("utm_campaign");

      if (content.trim()) params.set("utm_content", slugify(content));
      else params.delete("utm_content");

      if (term.trim()) params.set("utm_term", slugify(term));
      else params.delete("utm_term");

      parsed.search = params.toString();
      let res = parsed.toString();
      return res.replace(/%7[Bb]%7[Bb]/g, "{{").replace(/%7[Dd]%7[Dd]/g, "}}");
    } catch {
      return "URL Inválida";
    }
  }, [url, source, medium, campaign, content, term]);

  const utmParamsString = useMemo(() => {
    try {
      if (finalUrl === "URL Inválida") return "";
      // Usamos decode manual direto das tags dinâmicas do Facebook na string
      return finalUrl.split("?")[1]?.replace(/%7[Bb]%7[Bb]/g, "{{").replace(/%7[Dd]%7[Dd]/g, "}}") ?? "";
    } catch {
      return "";
    }
  }, [finalUrl]);

  const handleCopy = (link: string) => {
    if (!link || link === "URL Inválida") return;
    navigator.clipboard.writeText(link);
    toast.success("Link copiado para a área de transferência!");

    setHistory((prev) => {
      const exists = prev.find((h) => h.finalUrl === link);
      if (exists) return prev;
      const item = {
        id: crypto.randomUUID(),
        url: url.trim(),
        finalUrl: link,
        source: source.trim(),
        medium: medium.trim(),
        campaign: campaign.trim(),
        content: content.trim(),
        term: term.trim(),
        created_at: new Date().toISOString()
      };
      const updated = [item, ...prev].slice(0, 50);
      localStorage.setItem("ht_utm_history", JSON.stringify(updated));
      return updated;
    });
  };

  const handleDeleteHistory = (id: string) => {
    setHistory((prev) => {
      const updated = prev.filter((h) => h.id !== id);
      localStorage.setItem("ht_utm_history", JSON.stringify(updated));
      return updated;
    });
    toast.success("Link removido do histórico");
  };

  const handleClearForm = () => {
    setUrl("https://criarsaas.com/");
    setSource("");
    setMedium("");
    setCampaign("");
    setContent("");
    setTerm("");
  };

  const sourcePresets = [
    { label: "Instagram", value: "ig" },
    { label: "Facebook Ads", value: "fb_ads" },
    { label: "Google Ads", value: "google_ads" },
    { label: "YouTube", value: "youtube" },
    { label: "WhatsApp", value: "whatsapp" },
    { label: "E-mail", value: "email" }
  ];

  const mediumPresets = [
    { label: "Tráfego Pago (CPC)", value: "cpc" },
    { label: "Orgânico", value: "organic" },
    { label: "Stories", value: "stories" },
    { label: "Bio Link", value: "bio" },
    { label: "Feed", value: "feed" },
    { label: "Status / Status", value: "status" }
  ];

  return (
    <div className="px-6 md:px-10 py-8 space-y-8 bg-background text-foreground min-h-screen">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Gerador de Links & UTM</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Crie links parametrizados com tags UTM para monitorar a origem, o canal e as campanhas dos seus leads com precisão.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2 border-border/50 bg-card/50 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-border/20">
            <CardTitle className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">Configurar Parâmetros</CardTitle>
            <Button variant="ghost" size="sm" type="button" className="h-8 text-xs text-muted-foreground" onClick={handleClearForm}>
              Limpar Tudo
            </Button>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center justify-between">
                <span>URL de Destino (Site / Quiz)</span>
                <span className="text-[10px] text-muted-foreground lowercase">Obrigatório</span>
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Ex: https://criarsaas.com/quiz"
                className="w-full h-10 px-3 bg-background/50 border border-border/50 rounded-lg text-sm focus:outline-none focus:border-accent transition-colors text-foreground"
              />
            </div>

            <div className="pt-2 border-t border-border/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-blue-500/5 p-3 rounded-lg border border-blue-500/10">
              <div className="text-xs text-muted-foreground">
                <span className="font-semibold text-accent block sm:inline mr-1">Rastreamento do Facebook Ads:</span>
                Preencha as UTMs usando os parâmetros dinâmicos nativos do Meta.
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 font-semibold gap-1.5 shrink-0"
                onClick={() => {
                  setSource("fb");
                  setMedium("cpc");
                  setCampaign("{{campaign.name}}");
                  setContent("{{ad.name}}");
                  setTerm("{{adset.name}}");
                  toast.success("Parâmetros do Meta Ads aplicados!");
                }}
              >
                ⚡ Usar Parâmetros do Meta Ads
              </Button>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center justify-between">
                  <span>Origem da Campanha (utm_source)</span>
                  <span className="text-[10px] text-muted-foreground lowercase">Ex: ig, google_ads</span>
                </label>
                <input
                  type="text"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="Ex: ig"
                  className="w-full h-10 px-3 bg-background/50 border border-border/50 rounded-lg text-sm focus:outline-none focus:border-accent transition-colors text-foreground"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sourcePresets.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setSource(preset.value)}
                    className={`text-[10px] px-2 py-1 rounded border transition-all ${
                      source === preset.value
                        ? "bg-accent/20 border-accent text-accent font-semibold"
                        : "bg-muted/30 border-border/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center justify-between">
                  <span>Meio da Campanha (utm_medium)</span>
                  <span className="text-[10px] text-muted-foreground lowercase">Ex: cpc, organic, stories</span>
                </label>
                <input
                  type="text"
                  value={medium}
                  onChange={(e) => setMedium(e.target.value)}
                  placeholder="Ex: cpc"
                  className="w-full h-10 px-3 bg-background/50 border border-border/50 rounded-lg text-sm focus:outline-none focus:border-accent transition-colors text-foreground"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {mediumPresets.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setMedium(preset.value)}
                    className={`text-[10px] px-2 py-1 rounded border transition-all ${
                      medium === preset.value
                        ? "bg-accent/20 border-accent text-accent font-semibold"
                        : "bg-muted/30 border-border/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-foreground uppercase tracking-wide">Nome da Campanha (utm_campaign)</label>
                <input
                  type="text"
                  value={campaign}
                  onChange={(e) => setCampaign(e.target.value)}
                  placeholder="Ex: lancamento_julho"
                  className="w-full h-10 px-3 bg-background/50 border border-border/50 rounded-lg text-sm focus:outline-none focus:border-accent transition-colors text-foreground"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-foreground uppercase tracking-wide">Conteúdo (utm_content)</label>
                <input
                  type="text"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Ex: ad_01"
                  className="w-full h-10 px-3 bg-background/50 border border-border/50 rounded-lg text-sm focus:outline-none focus:border-accent transition-colors text-foreground"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-foreground uppercase tracking-wide">Termo / Palavra-Chave (utm_term)</label>
                <input
                  type="text"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="Ex: sass"
                  className="w-full h-10 px-3 bg-background/50 border border-border/50 rounded-lg text-sm focus:outline-none focus:border-accent transition-colors text-foreground"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border/50 bg-card/50 backdrop-blur">
            <CardHeader className="pb-2 border-b border-border/20">
              <CardTitle className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">Link Final</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="bg-background/80 border border-border/40 rounded-lg p-3 min-h-[100px] flex items-center justify-center break-all text-xs font-mono select-all">
                {finalUrl || "Preencha a URL de destino"}
              </div>
              <Button
                type="button"
                className="w-full h-11 bg-accent text-accent-foreground hover:bg-accent/90 flex items-center justify-center gap-2 rounded-lg font-medium transition-colors"
                onClick={() => handleCopy(finalUrl)}
                disabled={!finalUrl || finalUrl === "URL Inválida"}
              >
                <Copy className="h-4 w-4" />
                Copiar Link Final
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 border-border/50 bg-background/50 hover:bg-muted text-foreground flex items-center justify-center gap-2 rounded-lg font-medium transition-colors"
                onClick={() => {
                  if (utmParamsString) {
                    navigator.clipboard.writeText(utmParamsString);
                    toast.success("Apenas os parâmetros de UTM foram copiados!");
                  } else {
                    toast.error("Nenhum parâmetro UTM configurado");
                  }
                }}
                disabled={!utmParamsString}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Copiar Apenas UTMs
              </Button>
            </CardContent>
          </Card>

          <div className="bg-accent/5 border border-accent/10 rounded-lg p-4 text-[11px] text-muted-foreground leading-relaxed">
            <p className="font-semibold text-accent mb-1 uppercase tracking-wide">💡 Dicas do Gerador</p>
            O gerador limpa espaços em branco e caracteres especiais automaticamente, criando URLs slug-friendly recomendadas pelas boas práticas de ads (Facebook, Google, etc.).
          </div>
        </div>
      </div>

      <Card className="border-border/50 bg-card/50 backdrop-blur">
        <CardHeader className="pb-2 border-b border-border/20">
          <CardTitle className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">Histórico de Links Recentes ({history.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border/30 max-h-[400px] overflow-y-auto">
            {history.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-10">
                Nenhum link gerado no histórico local. Copie links gerados acima para registrá-los aqui.
              </div>
            ) : (
              history.map((h) => (
                <div key={h.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-muted/10 transition-colors">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <p className="text-xs font-mono truncate text-foreground/90 font-semibold">{h.finalUrl}</p>
                    <div className="flex flex-wrap gap-1">
                      {h.source && (
                        <span className="text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20 px-1.5 py-0.5 rounded font-mono">
                          src: {h.source}
                        </span>
                      )}
                      {h.medium && (
                        <span className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded font-mono">
                          med: {h.medium}
                        </span>
                      )}
                      {h.campaign && (
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-mono">
                          cam: {h.campaign}
                        </span>
                      )}
                      {h.content && (
                        <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded font-mono">
                          cnt: {h.content}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="icon" type="button" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted" onClick={() => {
                      navigator.clipboard.writeText(h.finalUrl);
                      toast.success("Link copiado!");
                    }}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" type="button" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => handleDeleteHistory(h.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
