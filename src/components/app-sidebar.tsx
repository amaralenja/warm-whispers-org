import { useEffect, useState } from "react";
import { canSee, htDefaultPermissoes, mergePermissoes, type Permissoes } from "@/lib/menu-permissions";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getVendorSession } from "@/lib/vendor-session";
import {
  LayoutDashboard,
  LineChart,
  Trophy,
  Tv,
  Wallet,
  Activity,
  HelpCircle,
  Users,
  Calendar,
  LogOut,
  Crown,
  ChevronDown,
  MessageCircle,
  MessagesSquare,
  Workflow,
  Briefcase,
  User,
  BookOpenText,
  CheckSquare,
  BarChart3,
  KeyRound,
  Settings2,
  Kanban,
  Target,
  Zap,
  Percent,
  Mic,
  HeartHandshake,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { saveVendorSession } from "@/lib/vendor-session";
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

type Item = { title: string; url: string; icon: any };

const mainItems: Item[] = [
  { title: "Início", url: "/dashboard", icon: LayoutDashboard },
  { title: "Relatórios", url: "/relatorios", icon: LineChart },
  { title: "Ranking", url: "/ranking", icon: Trophy },
  { title: "Ranking TV", url: "/ranking-tv", icon: Tv },
  { title: "Financeiro", url: "/financeiro", icon: Wallet },
  { title: "Tarefas", url: "/tasks", icon: CheckSquare },
  { title: "SOPs / Processos", url: "/sops", icon: BookOpenText },
];



const operacaoX1Items: Item[] = [
  { title: "Analytics X1", url: "/x1-analytics", icon: BarChart3 },
  { title: "CRM Leads X1", url: "/crm", icon: Users },
  { title: "Vendedores", url: "/vendedores", icon: Briefcase },
  { title: "Comissões", url: "/comissoes", icon: Percent },
  { title: "WhatsApp", url: "/whatsapp", icon: MessageCircle },
  { title: "Chat ao Vivo", url: "/chat", icon: MessagesSquare },
  { title: "Fluxos", url: "/flows", icon: Workflow },
  { title: "Remarketing 24h", url: "/remarketing", icon: Zap },
];

const highTicketItems: Item[] = [
  { title: "Analytics", url: "/ht-analytics", icon: LineChart },
  { title: "Métricas SDR", url: "/ht-sdr-metrics", icon: LineChart },
  { title: "Kanban SDR", url: "/ht-kanban-sdr", icon: Kanban },
  { title: "Kanban Closer", url: "/ht-kanban-closer", icon: Target },
  { title: "SDRs & Closers", url: "/ht-team", icon: Briefcase },
  { title: "Sucesso do Cliente", url: "/ht-customer-success", icon: HeartHandshake },
  { title: "Quiz", url: "/quiz", icon: HelpCircle },
  { title: "Facebook Ads", url: "/meta-ads", icon: Activity },
  
  { title: "API", url: "/ht-api", icon: KeyRound },
];

const pv24hItems: Item[] = [
  { title: "Analytics", url: "/pv24h-analytics", icon: BarChart3 },
];

const URL_TO_KEY: Record<string, string> = {
  "/dashboard": "dashboard",
  "/relatorios": "relatorios",
  "/ranking": "ranking",
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
  "/ht-sdr-metrics": "ht-sdr-metrics",
  "/ht-kanban-sdr": "ht-kanban-sdr",
  "/ht-kanban-closer": "ht-kanban-closer",
  "/ht-api": "ht-api",
  "/ht-team": "ht-team",
  "/ht-customer-success": "ht-customer-success",
  "/sops": "sops",
  "/tasks": "tasks",
  "/x1-analytics": "x1-analytics",
  "/pv24h-analytics": "pv24h-analytics",
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

  // Permissões do vendedor (admins: null = vê tudo)
  const [perm, setPerm] = useState<Permissoes | null>(null);
  useEffect(() => {
    let cancelled = false;
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("vendor_session") : null;
      if (raw) {
        const s = JSON.parse(raw);
        if (s?.permissoes && typeof s.permissoes === "object") setPerm(s.permissoes);
        else setPerm({});
        if (s?.id) {
          supabase
            .rpc("login_vendedor_by_codigo" as any, { _codigo: s.codigo })
            .then(({ data }) => {
              if (cancelled || !data) return;
              const row = data as any;
              if (Number(row.id) !== Number(s.id)) return;
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
            });
        }
        return;
      }
      // Sessão SDR/Closer (High Ticket)
      const rawHt = typeof window !== "undefined" ? localStorage.getItem("ht_team_session") : null;
      if (rawHt) {
        const s = JSON.parse(rawHt);
        const tipo = (s?.tipo === "sdr" || s?.tipo === "closer") ? s.tipo : "closer";
        const initial = (s?.permissoes && typeof s.permissoes === "object")
          ? (s.permissoes as Permissoes)
          : htDefaultPermissoes(tipo);
        setPerm(initial);
        if (s?.codigo) {
          supabase
            .rpc("login_ht_team_by_codigo" as any, { _codigo: s.codigo })
            .then(({ data }) => {
              if (cancelled || !data) return;
              const row = data as any;
              if (Number(row.id) !== Number(s.id)) return;
              const rowTipo = (row.tipo === "sdr" || row.tipo === "closer") ? row.tipo : tipo;
              const base = htDefaultPermissoes(rowTipo);
              const cur = (row.permissoes && typeof row.permissoes === "object") ? row.permissoes : base;
              const next = mergePermissoes(base, cur);
              setPerm(next);
              try {
                localStorage.setItem("ht_team_session", JSON.stringify({ ...s, ...row, permissoes: next }));
                window.dispatchEvent(new Event("vendor-session-updated"));
              } catch { /* noop */ }
            });
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

  const visibleMain = mainItems.filter((i) => i.url === "/tasks" || canSee(perm, keyFromUrl(i.url)));
  const visibleOpX1 = operacaoX1Items.filter((i) => canSee(perm, "operacao-x1", keyFromUrl(i.url)));
  const visibleHT = highTicketItems.filter((i) => canSee(perm, "high-ticket", keyFromUrl(i.url)));
  const visiblePV24H = pv24hItems.filter((i) => canSee(perm, "pv24h", keyFromUrl(i.url)));
  const showOpX1Group = canSee(perm, "operacao-x1") && visibleOpX1.length > 0;
  const showHTGroup = canSee(perm, "high-ticket") && visibleHT.length > 0;
  const showPV24HGroup = canSee(perm, "pv24h") && visiblePV24H.length > 0;

  const highTicketActive = visibleHT.some((i) => pathname === i.url);
  const [highTicketOpen, setHighTicketOpen] = useState(highTicketActive);
  const operacaoX1Active = visibleOpX1.some((i) => pathname === i.url);
  const [operacaoX1Open, setOperacaoX1Open] = useState(operacaoX1Active);
  const pv24hActive = visiblePV24H.some((i) => pathname === i.url);
  const [pv24hOpen, setPv24hOpen] = useState(pv24hActive);


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
            "group/menu relative h-12 rounded-lg px-3 text-[0.95rem] font-medium transition-all",
            active
              ? "bg-accent/15 text-accent hover:bg-accent/20 hover:text-accent"
              : "text-muted-foreground hover:bg-accent/10 hover:text-foreground",
          ].join(" ")}
        >
          <Link to={item.url} className="flex items-center gap-3">
            {active && (
              <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" />
            )}
            <span className="relative shrink-0">
              <item.icon
                className={[
                  "!h-[1.35rem] !w-[1.35rem] transition-transform group-hover/menu:scale-110",
                  active ? "text-accent" : "",
                ].join(" ")}
              />
              {showDot && (
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-background animate-pulse" />
              )}
            </span>
            {!collapsed && <span className="truncate flex-1">{item.title}</span>}
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
      <SidebarHeader className="border-b border-border px-4 py-5">
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
                return renderMenuItem({ title: "Meu Painel", url: targetUrl, icon: User });
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
                    "group/menu relative h-12 rounded-lg px-3 text-[0.95rem] font-medium transition-all",
                    operacaoX1Active
                      ? "bg-accent/15 text-accent hover:bg-accent/20 hover:text-accent"
                      : "text-muted-foreground hover:bg-accent/10 hover:text-foreground",
                  ].join(" ")}
                >
                  {operacaoX1Active && (
                    <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" />
                  )}
                  <Briefcase
                    className={[
                      "!h-[1.35rem] !w-[1.35rem] shrink-0 transition-transform group-hover/menu:scale-110",
                      operacaoX1Active ? "text-accent" : "",
                    ].join(" ")}
                  />
                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate text-left">Operação X1</span>
                      <ChevronDown
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
                    "group/menu relative h-12 rounded-lg px-3 text-[0.95rem] font-medium transition-all",
                    highTicketActive
                      ? "bg-accent/15 text-accent hover:bg-accent/20 hover:text-accent"
                      : "text-muted-foreground hover:bg-accent/10 hover:text-foreground",
                  ].join(" ")}
                >
                  {highTicketActive && (
                    <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" />
                  )}
                  <Crown
                    className={[
                      "!h-[1.35rem] !w-[1.35rem] shrink-0 transition-transform group-hover/menu:scale-110",
                      highTicketActive ? "text-accent" : "",
                    ].join(" ")}
                  />
                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate text-left">High Ticket</span>
                      <ChevronDown
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

              {/* Operação PV24H — colapsável */}
              {showPV24HGroup && (
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Operação PV24H"
                  isActive={pv24hActive && !pv24hOpen}
                  onClick={() => {
                    if (collapsed) {
                      setPv24hOpen(true);
                      return;
                    }
                    setPv24hOpen((v) => !v);
                  }}
                  className={[
                    "group/menu relative h-12 rounded-lg px-3 text-[0.95rem] font-medium transition-all",
                    pv24hActive
                      ? "bg-accent/15 text-accent hover:bg-accent/20 hover:text-accent"
                      : "text-muted-foreground hover:bg-accent/10 hover:text-foreground",
                  ].join(" ")}
                >
                  {pv24hActive && (
                    <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-accent" />
                  )}
                  <Zap
                    className={[
                      "!h-[1.35rem] !w-[1.35rem] shrink-0 transition-transform group-hover/menu:scale-110",
                      pv24hActive ? "text-accent" : "",
                    ].join(" ")}
                  />
                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate text-left">Operação PV24H</span>
                      <ChevronDown
                        className={[
                          "h-4 w-4 transition-transform",
                          pv24hOpen ? "rotate-180" : "",
                        ].join(" ")}
                      />
                    </>
                  )}
                </SidebarMenuButton>

                {!collapsed && pv24hOpen && (
                  <SidebarMenuSub className="mt-1 gap-1">
                    {visiblePV24H.map((sub) => {
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
              <LogOut className="!h-[1.35rem] !w-[1.35rem] shrink-0 transition-transform group-hover/menu:scale-110" />
              {!collapsed && <span>Sair</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
