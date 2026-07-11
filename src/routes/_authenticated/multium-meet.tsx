import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Apple,
  Monitor,
  Download,
  Mic,
  Brain,
  Shield,
  Sparkles,
  CheckCircle2,
  Github,
} from "lucide-react";
import logo from "@/assets/multium-logo.png.asset.json";

const PAGE_TITLE = "Multium Meet — Transcrição de calls com IA";
const PAGE_DESCRIPTION =
  "App desktop da Multium para gravar, transcrever e resumir calls de vendas localmente na máquina do closer.";

const logoUrl =
  typeof logo === "object" && logo !== null && "url" in logo
    ? String((logo as { url?: string }).url ?? "/favicon.webp")
    : "/favicon.webp";

const DOWNLOADS = {
  windows: "#", // TODO: link do release do GitHub após primeiro build
  macIntel: "#",
  macArm: "#",
};

const downloadOptions = [
  { label: "Baixar pra Windows", href: DOWNLOADS.windows, icon: Monitor },
  { label: "Baixar pra Mac (Apple Silicon)", href: DOWNLOADS.macArm, icon: Apple, variant: "outline" as const },
  { label: "Mac (Intel)", href: DOWNLOADS.macIntel, icon: Apple, variant: "outline" as const },
];

const featureCards = [
  {
    icon: Mic,
    title: "Captura o áudio da call",
    desc: "Pega tanto seu microfone quanto o áudio do sistema (a voz do lead). Zoom, Meet, WhatsApp Web, o que for.",
  },
  {
    icon: Brain,
    title: "Transcrição + resumo com IA",
    desc: "Whisper local + LLM pra gerar transcrição, resumo, próximos passos e objeções levantadas.",
  },
  {
    icon: Shield,
    title: "Privado por padrão",
    desc: "Tudo processa offline no seu computador. Nenhum áudio sai da sua máquina sem você mandar.",
  },
];

const setupSteps = [
  "Baixe o instalador pra sua plataforma (Windows ou Mac).",
  "Abra o Multium Meet e deixe ele baixar o modelo de transcrição (uma vez só, ~2GB).",
  "Antes da call, clique em Gravar. Ao terminar, o resumo aparece em segundos.",
  "Cole o resumo direto no card do lead no Kanban Closer.",
];

const statusItems = [
  "Fork do repositório com nome, ícones e cores Multium",
  "GitHub Actions gerando .exe (Win) e .dmg (Mac) por release",
  "Integração opcional: transcrição vai direto pro card do lead",
];

export const Route = createFileRoute("/_authenticated/multium-meet")({
  component: MultiumMeetPage,
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      {
        name: "description",
        content: PAGE_DESCRIPTION,
      },
    ],
  }),
});

function MultiumMeetPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      <div className="mx-auto max-w-5xl px-6 py-12">
        {/* Hero */}
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex h-28 w-28 items-center justify-center rounded-3xl bg-foreground/95 p-4 shadow-xl">
            <img
              src={logoUrl}
              alt="Multium"
              className="h-full w-full object-contain"
            />
          </div>
          <Badge variant="secondary" className="mb-4">
            Beta interno · exclusivo Multium
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            Multium Meet
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            Grave, transcreva e resuma suas calls com IA rodando{" "}
            <strong>100% na sua máquina</strong>. Nada de áudio subindo pra
            nuvem de terceiros — o que fica na call, fica na call.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {(downloadOptions ?? []).map((option) => {
              const Icon = option.icon;
              const disabled = option.href === "#";
              return (
                <Button
                  key={option.label}
                  size="lg"
                  variant={option.variant ?? "default"}
                  asChild
                  disabled={disabled}
                >
                  <a
                    href={option.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-disabled={disabled}
                    onClick={(event) => {
                      if (disabled) event.preventDefault();
                    }}
                  >
                    <Icon className="mr-2 h-5 w-5" />
                    {option.label}
                  </a>
                </Button>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Precisa de ~4GB livres pra baixar o modelo Whisper na primeira vez.
          </p>
        </div>

        {/* Features */}
        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {featureCards.map((f) => (
            <Card key={f.title} className="border-border/60">
              <CardContent className="p-6">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Setup */}
        <div className="mt-16">
          <h2 className="text-2xl font-bold">Como começar</h2>
          <div className="mt-6 space-y-4">
            {setupSteps.map((step, i) => (
              <div key={i} className="flex gap-4">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {i + 1}
                </div>
                <p className="pt-1 text-sm text-foreground/90">{step}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Status / roadmap */}
        <Card className="mt-16 border-primary/30 bg-primary/5">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-1 h-5 w-5 text-primary" />
              <div>
                <h3 className="font-semibold">
                  Status: gerando os primeiros instaladores
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enquanto os builds oficiais da Multium não saem, os botões
                  acima ficam desativados. O core roda em cima do{" "}
                  <a
                    href="https://github.com/Zackriya-Solutions/meetily"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    Meetily
                  </a>{" "}
                  (open-source, Apache 2.0), com fork rebrandeado pra Multium.
                </p>
                <div className="mt-4 space-y-2 text-sm">
                  {statusItems.map((item) => (
                    <div key={item} className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 flex justify-center">
          <Button variant="ghost" size="sm" asChild>
            <a
              href="https://github.com/Zackriya-Solutions/meetily"
              target="_blank"
              rel="noreferrer"
            >
              <Github className="mr-2 h-4 w-4" />
              Ver o projeto original (Meetily)
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
