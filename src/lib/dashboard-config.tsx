import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type DashboardConfig = {
  /** % do faturamento bruto que fica como "nossa parte" — por expert. 0..100. */
  sharePct: Record<string, number>;
  /** Inclui ht_vendas (High Ticket) no Total Geral + Saldo. */
  includeHighTicket: boolean;
  /** Mostra a seção KPIs Financeiros (Lucro / Gastos / Saldo). */
  showFinanceiro: boolean;
  /** Mostra o card de Gastos do Mês. */
  showGastosCard: boolean;
};

const DEFAULTS: DashboardConfig = {
  sharePct: {},
  includeHighTicket: false,
  showFinanceiro: true,
  showGastosCard: true,
};

const STORAGE_KEY = "multium.dashboard.config";

type Ctx = {
  config: DashboardConfig;
  update: (patch: Partial<DashboardConfig>) => void;
  setShare: (expertName: string, pct: number) => void;
  getShare: (expertName: string) => number; // default 100
};

const DashboardConfigContext = createContext<Ctx | null>(null);

export function DashboardConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<DashboardConfig>(DEFAULTS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setConfig({ ...DEFAULTS, ...parsed, sharePct: { ...DEFAULTS.sharePct, ...(parsed?.sharePct ?? {}) } });
      }
    } catch {}
  }, []);

  function persist(next: DashboardConfig) {
    setConfig(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  }

  function update(patch: Partial<DashboardConfig>) {
    persist({ ...config, ...patch });
  }

  function setShare(expertName: string, pct: number) {
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    persist({ ...config, sharePct: { ...config.sharePct, [expertName]: clamped } });
  }

  function getShare(expertName: string) {
    const v = config.sharePct[expertName];
    return typeof v === "number" ? v : 100;
  }

  return (
    <DashboardConfigContext.Provider value={{ config, update, setShare, getShare }}>
      {children}
    </DashboardConfigContext.Provider>
  );
}

export function useDashboardConfig() {
  const ctx = useContext(DashboardConfigContext);
  if (!ctx) throw new Error("useDashboardConfig must be used within DashboardConfigProvider");
  return ctx;
}
