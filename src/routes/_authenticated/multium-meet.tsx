import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Mic,
  Brain,
  Shield,
  Sparkles,
  CheckCircle2,
  Chrome,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const PAGE_TITLE = "Multium Meet — Extensão de transcrição de calls";
const PAGE_DESCRIPTION =
  "Extensão Chrome da Multium: grava mic + áudio da aba (Meet/Zoom) e transcreve com IA.";

const EXTENSION_VERSION = "0.3.0";
const EXTENSION_ZIP_URL = `/downloads/multium-meet-extension-v${EXTENSION_VERSION}.zip`;

export const Route = createFileRoute("/_authenticated/multium-meet")({
  component: MultiumMeetPage,
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESCRIPTION },
    ],
  }),
});

function MultiumMeetPage() {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(EXTENSION_ZIP_URL);
      if (!res.ok) throw new Error(`Download falhou: ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `multium-meet-extension-v${EXTENSION_VERSION}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast.success("Extensão baixada! Siga os passos abaixo pra instalar.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao baixar");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-primary/10 text-primary shadow-xl">
            <Chrome className="h-12 w-12" />
          </div>
          <Badge variant="secondary" className="mb-4">
            Beta interno · Extensão Chrome v{EXTENSION_VERSION}
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Multium Meet</h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            Extensão que captura seu <strong>microfone + áudio da aba</strong> do Meet,
            Zoom Web ou WhatsApp Web e devolve a transcrição da call com IA em segundos.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" onClick={handleDownload} disabled={downloading}>
              <Download className="mr-2 h-5 w-5" />
              {downloading ? "Baixando..." : "Baixar extensão (.zip)"}
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Baixe a v{EXTENSION_VERSION}; remova a v0.2.0 antes de carregar de novo.
          </p>
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-3">
          <FeatureCard
            icon={<Mic className="h-5 w-5" />}
            title="Mic + áudio da aba"
            desc="Captura sua voz e a voz do lead simultaneamente. Meet, Zoom Web, WhatsApp Web."
          />
          <FeatureCard
            icon={<Brain className="h-5 w-5" />}
            title="Transcrição por IA"
            desc="Áudio vai pro endpoint da Multium e é transcrito com a OpenAI configurada no app."
          />
          <FeatureCard
            icon={<Shield className="h-5 w-5" />}
            title="Só a Multium vê"
              desc="Sua chave da OpenAI fica no servidor do app; a extensão só chama o endpoint da Multium."
          />
        </div>

        <div className="mt-16">
          <h2 className="text-2xl font-bold">Como instalar (2 minutos)</h2>
          <div className="mt-6 space-y-4">
            <SetupStep index={1}>
              Clique em <strong>Baixar extensão</strong> acima e descompacte o .zip
              numa pasta que você não vá deletar.
            </SetupStep>
            <SetupStep index={2}>
              Abra <code className="rounded bg-muted px-1.5 py-0.5 text-sm">chrome://extensions</code>{" "}
              no Chrome (ou Edge/Brave/Arc).
            </SetupStep>
            <SetupStep index={3}>
              Ative o <strong>Modo desenvolvedor</strong> no canto superior direito.
            </SetupStep>
            <SetupStep index={4}>
              Clique em <strong>Carregar sem compactação</strong> e selecione a pasta
              descompactada.
            </SetupStep>
            <SetupStep index={5}>
              Remova a versão antiga, fixe a Multium Meet v{EXTENSION_VERSION}, abra sua call, clique no ícone
              e aperte <strong>Iniciar gravação</strong>. Se pedir, a aba de autorização do microfone vai abrir.
            </SetupStep>
          </div>
        </div>

        <Card className="mt-16 border-primary/30 bg-primary/5">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-1 h-5 w-5 text-primary" />
              <div>
                <h3 className="font-semibold">Como funciona por dentro</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  A extensão usa <code>chrome.tabCapture</code> pra pegar o áudio da aba +{" "}
                  <code>getUserMedia</code> pro mic, mistura os dois via Web Audio API,
                  grava em <code>audio/webm;opus</code>, e envia pro endpoint{" "}
                  <code>/api/public/transcribe</code> deste app, que fala com o
                  OpenAI (<code>gpt-4o-transcribe</code>).
                </p>
                <div className="mt-4 space-y-2 text-sm">
                  <StatusItem>✅ Áudio da aba (voz do lead)</StatusItem>
                  <StatusItem>✅ Microfone (sua voz)</StatusItem>
                  <StatusItem>✅ Mixdown num único arquivo</StatusItem>
                  <StatusItem>✅ Transcrição volta pro painel lateral + botão copiar</StatusItem>
                  <StatusItem>⚠️ Precisa estar tocando áudio na aba pra captura começar (ex: já no Meet)</StatusItem>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-6">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
      </CardContent>
    </Card>
  );
}

function SetupStep({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
        {index}
      </div>
      <p className="pt-1 text-sm text-foreground/90">{children}</p>
    </div>
  );
}

function StatusItem({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <CheckCircle2 className="h-4 w-4 text-primary" />
      <span>{children}</span>
    </div>
  );
}
