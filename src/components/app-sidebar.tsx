


import { useEffect, useState } from "react";
import { canSee, htDefaultPermissoes, mergePermissoes, type Permissoes } from "@/lib/menu-permissions";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getVendorSession, saveVendorSession, clearVendorSession } from "@/lib/vendor-session";
import AccountCircleTwoTone from "@mui/icons-material/AccountCircleTwoTone";
import DashboardTwoTone from "@mui/icons-material/DashboardTwoTone";
import TvTwoTone from "@mui/icons-material/TvTwoTone";
import AccountBalanceWalletTwoTone from "@mui/icons-material/AccountBalanceWalletTwoTone";
import AssignmentTurnedInTwoTone from "@mui/icons-material/AssignmentTurnedInTwoTone";
import PriceCheckTwoTone from "@mui/icons-material/PriceCheckTwoTone";
import MenuBookTwoTone from "@mui/icons-material/MenuBookTwoTone";
import AssessmentTwoTone from "@mui/icons-material/AssessmentTwoTone";
import GroupTwoTone from "@mui/icons-material/GroupTwoTone";
import BadgeTwoTone from "@mui/icons-material/BadgeTwoTone";
import ChatTwoTone from "@mui/icons-material/ChatTwoTone";
import ForumTwoTone from "@mui/icons-material/ForumTwoTone";
import AccountTreeTwoTone from "@mui/icons-material/AccountTreeTwoTone";
import BoltTwoTone from "@mui/icons-material/BoltTwoTone";
import TimelineTwoTone from "@mui/icons-material/TimelineTwoTone";
import LinkTwoTone from "@mui/icons-material/LinkTwoTone";
import InsightsTwoTone from "@mui/icons-material/InsightsTwoTone";
import ViewColumnTwoTone from "@mui/icons-material/ViewColumnTwoTone";
import TrackChangesTwoTone from "@mui/icons-material/TrackChangesTwoTone";
import GroupsTwoTone from "@mui/icons-material/GroupsTwoTone";
import HandshakeTwoTone from "@mui/icons-material/HandshakeTwoTone";
import QuizTwoTone from "@mui/icons-material/QuizTwoTone";
import CampaignTwoTone from "@mui/icons-material/CampaignTwoTone";
import RocketLaunchTwoTone from "@mui/icons-material/RocketLaunchTwoTone";
import VpnKeyTwoTone from "@mui/icons-material/VpnKeyTwoTone";
import WorkTwoTone from "@mui/icons-material/WorkTwoTone";
import WorkspacePremiumTwoTone from "@mui/icons-material/WorkspacePremiumTwoTone";
import KeyboardArrowDownTwoTone from "@mui/icons-material/KeyboardArrowDownTwoTone";
import WbSunnyTwoTone from "@mui/icons-material/WbSunnyTwoTone";
import NightsStayTwoTone from "@mui/icons-material/NightsStayTwoTone";
import LogoutTwoTone from "@mui/icons-material/LogoutTwoTone";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import logoMultium from "@/assets/logo-multium.webp";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { useTheme } from "@/lib/theme-context";

import RadioButtonCheckedTwoTone from "@mui/icons-material/RadioButtonCheckedTwoTone";

type Item = { title: string; url: string; icon: any; isLive?: boolean; adminOnly?: boolean };

const mainItems: Item[] = [
  { title: "Início", url: "/dashboard", icon: DashboardTwoTone },
  { title: "Monitoramento ao VIVO", url: "/live-monitoring", icon: RadioButtonCheckedTwoTone, isLive: true, adminOnly: true },
  { title: "Ranking TV", url: "/ranking-tv", icon: TvTwoTone },
  { title: "Financeiro", url: "/financeiro", icon: AccountBalanceWalletTwoTone },
  { title: "Tarefas", url: "/tasks", icon: AssignmentTurnedInTwoTone },
  { title: "Comissões", url: "/comissoes", icon: PriceCheckTwoTone },
  { title: "SOPs / Processos", url: "/sops", icon: MenuBookTwoTone },
];

const operacaoX1Items: Item[] = [
  { title: "Analytics X1", url: "/x1-analytics", icon: AssessmentTwoTone },
  { title: "CRM Leads X1", url: "/crm", icon: GroupTwoTone },
  { title: "Vendedores", url: "/vendedores", icon: BadgeTwoTone },
  { title: "WhatsApp", url: "/whatsapp", icon: ChatTwoTone },
  { title: "Chat ao Vivo", url: "/chat", icon: ForumTwoTone },
  { title: "Fluxos", url: "/flows", icon: AccountTreeTwoTone },
  { title: "Remarketing 24h", url: "/remarketing", icon: BoltTwoTone },
];

const highTicketItems: Item[] = [
  { title: "Analytics", url: "/ht-analytics", icon: TimelineTwoTone },
  { title: "Gerador de UTM", url: "/ht-utm", icon: LinkTwoTone },
  { title: "Métricas SDR", url: "/ht-sdr-metrics", icon: InsightsTwoTone },
  { title: "Kanban SDR", url: "/ht-kanban-sdr", icon: ViewColumnTwoTone },
  { title: "Kanban Closer", url: "/ht-kanban-closer", icon: TrackChangesTwoTone },
  { title: "SDRs & Closers", url: "/ht-team", icon: GroupsTwoTone },
  { title: "Sucesso do Cliente", url: "/ht-customer-success", icon: HandshakeTwoTone },
  { title: "Quiz", url: "/quiz", icon: QuizTwoTone },
  { title: "Facebook Ads", url: "/meta-ads", icon: CampaignTwoTone },
  { title: "SaaS em Construção", url: "/ht-saas", icon: RocketLaunchTwoTone },
  { title: "API", url: "/ht-api", icon: VpnKeyTwoTone },
];



const URL_TO_KEY: Record<string, string> = {
  "/dashboard": "dashboard",
  "/ranking-tv": "ranking-tv",
  "/financeiro": "financeiro",
  "/crm": "crm",
  "/vendedores": "vendedores",
  "/whatsapp": "whatsapp",
  "/chat": "chat",
  "/flows": "flows",
  "/calendar": "calendar",
  "/quiz": "quiz",
  "/meta-ads": "meta-ads",
  "/ht-analytics": "ht-analytics",
  "/ht-utm": "ht-utm",
  "/ht-sdr-metrics": "ht-sdr-metrics",
  "/ht-kanban-sdr": "ht-kanban-sdr",
  "/ht-kanban-closer": "ht-kanban-closer",
  "/ht-api": "ht-api",
  "/ht-team": "ht-team",
  "/ht-customer-success": "ht-customer-success",
  "/sops": "sops",
  "/tasks": "tasks",
  "/x1-analytics": "x1-analytics",
  "/comissoes": "comissoes",
  "/remarketing": "remarketing",
};
const keyFromUrl = (u: string) => URL_TO_KEY[u] ?? u.replace(/^\//, "");

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { theme, toggle } = useTheme();

  // Permissões do vendedor (admins: null = vê tudo)
  const [perm, setPerm] = useState<Permissoes | null>(null);
  useEffect(() => {
    let cancelled = false;
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("vendor_session") : null;
      if (raw) {
        const s = JSON.parse(raw);
        if (s?.id && s?.codigo) {
          Promise.resolve(supabase.rpc("login_vendedor_by_codigo" as any, { _codigo: String(s.codigo).trim() }))
            .then(({ data, error }: any) => {
              if (cancelled) return;
              const row = data as any;
              if (error || !row || Number(row.id) !== Number(s.id)) {
                clearVendorSession();
                setPerm({});
                window.dispatchEvent(new Event("vendor-session-updated"));
                window.location.href = "/auth";
                return;
              }
              const next = (row.permissoes ?? {}) as Permissoes;
              setPerm(next);
              try {
                saveVendorSession({
                  ...s,
                  ...row,
                  permissoes: next,
                  wa_channel_ids: Array.isArray(row.wa_channel_ids) ? row.wa_channel_ids : s.wa_channel_ids,
                  workspace_ids: Array.isArray(row.workspace_ids) ? row.workspace_ids : s.workspace_ids,
                } as any);
                window.dispatchEvent(new Event("vendor-session-updated"));
              } catch { /* noop */ }
            })
            .catch(() => {
              if (cancelled) return;
              clearVendorSession();
              setPerm({});
              window.dispatchEvent(new Event("vendor-session-updated"));
              window.location.href = "/auth";
            });
        } else {
          clearVendorSession();
          setPerm({});
          window.dispatchEvent(new Event("vendor-session-updated"));
          window.location.href = "/auth";
        }
        return;
      }
      // Sessão SDR/Closer (High Ticket)
      const rawHt = typeof window !== "undefined" ? localStorage.getItem("ht_team_session") : null;
      if (rawHt) {
        const s = JSON.parse(rawHt);
        const tipo = (s?.tipo === "sdr" || s?.tipo === "closer") ? s.tipo : "closer";
        if (s?.codigo && s?.id) {
          Promise.resolve(supabase.rpc("login_ht_team_by_codigo" as any, { _codigo: String(s.codigo).trim() }))
            .then(({ data, error }: any) => {
              if (cancelled) return;
              const row = data as any;
              if (error || !row || Number(row.id) !== Number(s.id)) {
                localStorage.removeItem("ht_team_session");
                setPerm({});
                window.dispatchEvent(new Event("vendor-session-updated"));
                window.location.href = "/auth";
                return;
              }
              const rowTipo = (row.tipo === "sdr" || row.tipo === "closer") ? row.tipo : tipo;
              const base = htDefaultPermissoes(rowTipo);
              const cur = (row.permissoes && typeof row.permissoes === "object") ? row.permissoes : base;
              const next = mergePermissoes(base, cur);
              setPerm(next);
              try {
                localStorage.setItem("ht_team_session", JSON.stringify({ ...s, ...row, permissoes: next }));
                window.dispatchEvent(new Event("vendor-session-updated"));
              } catch { /* noop */ }
            })
            .catch(() => {
              if (cancelled) return;
              localStorage.removeItem("ht_team_session");
              setPerm({});
              window.dispatchEvent(new Event("vendor-session-updated"));
              window.location.href = "/auth";
            });
        } else {
          localStorage.removeItem("ht_team_session");
          setPerm({});
          window.dispatchEvent(new Event("vendor-session-updated"));
          window.location.href = "/auth";
        }
      }
    } catch {
      /* noop */
    }
    return () => { cancelled = true; };
  }, []);


  const vendorSession = perm !== null ? getVendorSession() : null;
  const vendorAssigneeId = vendorSession?.id ? `v:${vendorSession.id}` : null;

  const pendingTasksQ = useQuery({
    queryKey: ["sidebar_pending_tasks", vendorAssigneeId],
    enabled: !!vendorAssigneeId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("tasks" as any)
        .select("id", { count: "exact", head: true })
        .contains("assignee_ids", [vendorAssigneeId!])
        .or("concluida.is.false,concluida.is.null");
      if (error) return 0;
      return count ?? 0;
    },
  });
  const hasPendingTasks = (pendingTasksQ.data ?? 0) > 0;

  const isUserAdmin = perm === null || (typeof perm === "object" && Object.keys(perm).length === 0 && !localStorage.getItem("vendor_session") && !localStorage.getItem("ht_team_session"));

  const visibleMain = mainItems.filter((i) => {
    if (i.adminOnly && !isUserAdmin) return false;
    return i.url === "/tasks" || canSee(perm, keyFromUrl(i.url));
  });
  const visibleOpX1 = operacaoX1Items.filter((i) => canSee(perm, "operacao-x1", keyFromUrl(i.url)));
  const visibleHT = highTicketItems.filter((i) => canSee(perm, "high-ticket", keyFromUrl(i.url)));
  const showOpX1Group = canSee(perm, "operacao-x1") && visibleOpX1.length > 0;
  const showHTGroup = canSee(perm, "high-ticket") && visibleHT.length > 0;


  const highTicketActive = visibleHT.some((i) => pathname === i.url);
  const [highTicketOpen, setHighTicketOpen] = useState(highTicketActive);
  const operacaoX1Active = visibleOpX1.some((i) => pathname === i.url);
  const [operacaoX1Open, setOperacaoX1Open] = useState(operacaoX1Active);


  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    try { localStorage.removeItem("vendor_session"); localStorage.removeItem("ht_team_session"); } catch { /* noop */ }
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const renderMenuItem = (item: Item) => {
    const active = pathname === item.url;
    const showDot = item.url === "/tasks" && hasPendingTasks;
    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton
          asChild
          isActive={active}
          tooltip={item.title}
          className={[
            "group/menu relative h-11 rounded-xl transition-all",
            collapsed ? "w-10 h-10 mx-auto justify-center !p-0" : "px-3 w-full text-[0.95rem] font-medium",
            active
              ? "bg-accent/15 text-accent hover:bg-accent/20 hover:text-accent"
              : "text-muted-foreground hover:bg-accent/10 hover:text-foreground",
          ].join(" ")}
        >
          <Link to={item.url} className={collapsed ? "flex items-center justify-center w-full h-full" : "flex items-center gap-3 w-full"}>
            {active && !collapsed && (
              <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" />
            )}
            <span className="relative flex items-center justify-center shrink-0">
              <item.icon
                className={[
                  "!h-5 !w-5 shrink-0 transition-transform group-hover/menu:scale-110",
                  active ? "text-accent" : item.isLive ? "text-rose-400" : "",
                ].join(" ")}
              />
              {showDot && (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background animate-pulse" />
              )}
              {item.isLive && collapsed && (
                <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                </span>
              )}
            </span>
            {!collapsed && (
              <span className="truncate flex-1 flex items-center justify-between">
                <span>{item.title}</span>
                {item.isLive && (
                  <span className="relative flex h-2.5 w-2.5 shrink-0 ml-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                  </span>
                )}
              </span>
            )}
            {showDot && !collapsed && (
              <span className="ml-auto rounded-full bg-red-500/20 px-1.5 py-0.5 text-[0.6rem] font-bold text-red-400">
                {pendingTasksQ.data}
              </span>
            )}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };


  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="border-b border-border px-3 py-4">
        <div className="flex items-center justify-center">
          <img
            src={logoMultium}
            alt="MULTIUM"
            className={collapsed ? "h-8 w-8 object-contain" : "h-10 w-auto object-contain"}
          />
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-4 scrollbar-fancy">
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="mb-2 px-2 text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
              Navegação
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {perm !== null && (() => {
                const isHt = typeof window !== "undefined" && !!localStorage.getItem("ht_team_session");
                const targetUrl = isHt ? "/ht-analytics" : "/vendor";
                return renderMenuItem({ title: "Meu Painel", url: targetUrl, icon: AccountCircleTwoTone });
              })()}
              {visibleMain.map(renderMenuItem)}
              

              {/* Operação X1 — colapsável */}
              {showOpX1Group && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Operação X1"
                  isActive={operacaoX1Active && !operacaoX1Open}
                  onClick={() => {
                    if (collapsed) {
                      setOperacaoX1Open(true);
                      return;
                    }
                    setOperacaoX1Open((v) => !v);
                  }}
                  className={[
                    "group/menu relative h-11 rounded-xl transition-all",
                    collapsed ? "w-10 h-10 mx-auto justify-center !p-0" : "px-3 w-full text-[0.95rem] font-medium",
                    operacaoX1Active
                      ? "bg-accent/15 text-accent hover:bg-accent/20 hover:text-accent"
                      : "text-muted-foreground hover:bg-accent/10 hover:text-foreground",
                  ].join(" ")}
                >
                  {operacaoX1Active && !collapsed && (
                    <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" />
                  )}
                  <WorkTwoTone
                    className={[
                      "!h-5 !w-5 shrink-0 transition-transform group-hover/menu:scale-110",
                      operacaoX1Active ? "text-accent" : "",
                    ].join(" ")}
                  />
                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate text-left">Operação X1</span>
                      <KeyboardArrowDownTwoTone
                        className={[
                          "h-4 w-4 transition-transform",
                          operacaoX1Open ? "rotate-180" : "",
                        ].join(" ")}
                      />
                    </>
                  )}
                </SidebarMenuButton>

                {!collapsed && operacaoX1Open && (
                  <SidebarMenuSub className="mt-1 gap-1">
                    {visibleOpX1.map((sub) => {
                      const subActive = pathname === sub.url;
                      return (
                        <SidebarMenuSubItem key={sub.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={subActive}
                            className={[
                              "h-9 rounded-md px-3 text-[0.9rem]",
                              subActive
                                ? "bg-accent/15 text-accent hover:bg-accent/20 hover:text-accent"
                                : "text-muted-foreground hover:bg-accent/10 hover:text-foreground",
                            ].join(" ")}
                          >
                            <Link to={sub.url} className="flex items-center gap-2">
                              <sub.icon className="!h-4 !w-4 shrink-0" />
                              <span className="truncate">{sub.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      );
                    })}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>
              )}



              {/* High Ticket — colapsável */}
              {showHTGroup && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="High Ticket"
                  isActive={highTicketActive && !highTicketOpen}
                  onClick={() => {
                    if (collapsed) {
                      setHighTicketOpen(true);
                      return;
                    }
                    setHighTicketOpen((v) => !v);
                  }}
                  className={[
                    "group/menu relative h-11 rounded-xl transition-all",
                    collapsed ? "w-10 h-10 mx-auto justify-center !p-0" : "px-3 w-full text-[0.95rem] font-medium",
                    highTicketActive
                      ? "bg-accent/15 text-accent hover:bg-accent/20 hover:text-accent"
                      : "text-muted-foreground hover:bg-accent/10 hover:text-foreground",
                  ].join(" ")}
                >
                  {highTicketActive && !collapsed && (
                    <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" />
                  )}
                  <WorkspacePremiumTwoTone
                    className={[
                      "!h-5 !w-5 shrink-0 transition-transform group-hover/menu:scale-110",
                      highTicketActive ? "text-accent" : "",
                    ].join(" ")}
                  />
                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate text-left">High Ticket</span>
                      <KeyboardArrowDownTwoTone
                        className={[
                          "h-4 w-4 transition-transform",
                          highTicketOpen ? "rotate-180" : "",
                        ].join(" ")}
                      />
                    </>
                  )}
                </SidebarMenuButton>

                {!collapsed && highTicketOpen && (
                  <SidebarMenuSub className="mt-1 gap-1">
                    {visibleHT.map((sub) => {
                      const subActive = pathname === sub.url;
                      return (
                        <SidebarMenuSubItem key={sub.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={subActive}
                            className={[
                              "h-9 rounded-md px-3 text-[0.9rem]",
                              subActive
                                ? "bg-accent/15 text-accent hover:bg-accent/20 hover:text-accent"
                                : "text-muted-foreground hover:bg-accent/10 hover:text-foreground",
                            ].join(" ")}
                          >
                            <Link to={sub.url} className="flex items-center gap-2">
                              <sub.icon className="!h-4 !w-4 shrink-0" />
                              <span className="truncate">{sub.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      );
                    })}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <div className="px-2 pb-2">
        {!collapsed && <WorkspaceSwitcher />}
      </div>

      <SidebarFooter className="border-t border-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleSignOut}
              tooltip="Sair"
              className="group/menu h-12 rounded-lg px-3 text-[0.95rem] font-medium text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive"
            >
              <LogoutTwoTone className="!h-[1.35rem] !w-[1.35rem] shrink-0 transition-transform group-hover/menu:scale-110" />
              {!collapsed && <span>Sair</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
