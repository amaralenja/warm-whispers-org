import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { enrichInstagramLeads } from "@/lib/instagram.functions";
import { Crown, Wallet, Instagram as InstagramIcon, MessageCircle } from "lucide-react";

export type KanbanLeadLike = {
  id: string;
  nome?: string | null;
  whatsapp?: string | null;
  instagram?: string | null;
  caixa_letra?: string | null;
  caixa_label?: string | null;
  utm_source?: string | null;
  data_criacao?: string | null;
};

export type IgLite = {
  username: string;
  full_name?: string | null;
  followers?: number | null;
  profile_pic_url?: string | null;
  verification_status?: string | null;
};

const TICKET_TIERS: Record<
  string,
  { label: string; cls: string; weight: number; ring: string }
> = {
  A: { label: "Até R$ 1k", cls: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30", weight: 1, ring: "" },
  B: { label: "R$ 1k–5k", cls: "bg-blue-500/15 text-blue-300 border-blue-500/30", weight: 2, ring: "" },
  C: { label: "R$ 5k–10k", cls: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30", weight: 3, ring: "" },
  D: { label: "R$ 10k–30k", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", weight: 4, ring: "ring-1 ring-emerald-500/30" },
  E: { label: "R$ 30k–50k", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30", weight: 5, ring: "ring-1 ring-amber-500/40" },
  F: { label: "R$ 50k–100k", cls: "bg-orange-500/15 text-orange-300 border-orange-500/30", weight: 6, ring: "ring-2 ring-orange-500/50" },
  G: { label: "R$ 100k+", cls: "bg-yellow-500/15 text-yellow-300 border-yellow-500/40", weight: 7, ring: "ring-2 ring-yellow-500/60 shadow-[0_0_25px_-6px_rgba(234,179,8,0.7)]" },
};

const HIGH = new Set(["E", "F", "G"]);
const LOW = new Set(["", "A", "B"]);

function cleanHandle(u?: string | null): string {
  return (u || "").toLowerCase().trim().replace(/^@/, "").replace(/\/+$/, "");
}

/** Puxa o cache do banco (mesmo cache da aba Quiz) para os @ visíveis. Nunca chama Bright Data. */
export function useIgProfileMap(usernames: string[]): Map<string, IgLite> {
  const listFn = useServerFn(listInstagramLeads);
  const [map, setMap] = useState<Map<string, IgLite>>(new Map());

  const key = useMemo(() => {
    const uniq = Array.from(
      new Set(usernames.map(cleanHandle).filter((u) => /^[a-z0-9._]+$/.test(u))),
    );
    uniq.sort();
    return uniq.join(",");
  }, [usernames]);

  useEffect(() => {
    if (!key) { setMap(new Map()); return; }
    let cancelled = false;
    (async () => {
      const list = key.split(",");
      try {
        const rows: any[] = await listFn({ data: { usernames: list } });
        if (cancelled) return;
        const m = new Map<string, IgLite>();
        for (const r of rows || []) {
          const u = cleanHandle(r?.username);
          if (u) m.set(u, r as IgLite);
        }
        setMap(m);
      } catch {
        /* silencioso: cache indisponível → cards seguem sem foto */
      }
    })();
    return () => { cancelled = true; };
  }, [key, listFn]);

  return map;
}

function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  if (!d) return "";
  const s = Math.max(0, Math.floor((Date.now() - d) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const dd = Math.floor(h / 24);
  if (dd < 30) return `${dd}d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function KanbanLeadCard({
  lead,
  ig,
  onClick,
  onDragStart,
  onDragEnd,
  dragging,
  footer,
}: {
  lead: KanbanLeadLike;
  ig?: IgLite | null;
  onClick?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  dragging?: boolean;
  footer?: React.ReactNode;
}) {
  const letter = (lead.caixa_letra ?? "").toUpperCase();
  const tier = TICKET_TIERS[letter];
  const isHigh = HIGH.has(letter);
  const isLow = LOW.has(letter);
  const handle = cleanHandle(lead.instagram);
  const pic = ig?.profile_pic_url
    ? `/api/public/ig-image?u=${encodeURIComponent(ig.profile_pic_url)}`
    : null;
  const name = ig?.full_name || lead.nome || "sem nome";
  const initials = (name || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0] || "")
    .join("")
    .toUpperCase();

  return (
    <div
      draggable
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={[
        "relative p-2.5 rounded-lg border transition-all",
        onClick ? "cursor-pointer" : "cursor-grab",
        "active:cursor-grabbing",
        isHigh
          ? `bg-card/80 border-yellow-500/30 ${tier?.ring ?? ""} hover:border-yellow-500/60`
          : isLow
            ? "bg-background/40 border-border/30 opacity-70 hover:opacity-90 hover:border-border/60"
            : "bg-background/70 border-border/50 hover:border-accent/50",
        dragging ? "opacity-40" : "",
      ].join(" ")}
    >
      {isHigh && (
        <Crown className="absolute -top-1.5 -right-1.5 h-4 w-4 text-yellow-400 drop-shadow" />
      )}
      <div className="flex items-start gap-2.5">
        {pic ? (
          <img
            src={pic}
            alt={handle}
            loading="lazy"
            className={`h-10 w-10 rounded-full object-cover shrink-0 border ${
              isHigh ? "border-yellow-500/50" : "border-border/50"
            }`}
            onError={(e) => { (e.currentTarget.style.display = "none"); }}
          />
        ) : (
          <div
            className={`h-10 w-10 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold border ${
              isHigh
                ? "bg-yellow-500/10 text-yellow-300 border-yellow-500/40"
                : "bg-muted/40 text-muted-foreground border-border/40"
            }`}
          >
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className={`text-xs font-semibold truncate ${isHigh ? "text-foreground" : ""}`}>
            {name}
          </div>
          {handle && (
            <a
              href={`https://instagram.com/${handle}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[10px] text-pink-300/80 hover:text-pink-300 flex items-center gap-0.5 truncate"
            >
              <InstagramIcon className="h-2.5 w-2.5" />@{handle}
            </a>
          )}
          <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
            {timeAgo(lead.data_criacao)}
          </div>
        </div>
      </div>

      {tier && (
        <div
          className={`mt-2 flex items-center justify-between rounded-md border px-2 py-1 ${tier.cls}`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Wallet className="h-3 w-3 shrink-0 opacity-70" />
            <span className="text-[10px] font-bold truncate">{lead.caixa_label || tier.label}</span>
          </div>
          <span className="text-[10px] font-mono font-bold opacity-70">{letter}</span>
        </div>
      )}

      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        {lead.utm_source && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20 truncate max-w-[110px]">
            {lead.utm_source}
          </span>
        )}
        {lead.whatsapp && (
          <a
            href={`https://wa.me/${String(lead.whatsapp).replace(/\D/g, "")}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 flex items-center gap-0.5"
          >
            <MessageCircle className="h-2.5 w-2.5" /> WA
          </a>
        )}
      </div>

      {footer && (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          {footer}
        </div>
      )}
    </div>
  );
}
