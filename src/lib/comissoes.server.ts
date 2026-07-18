// Helpers server-only para comissoes. Mantidos fora do arquivo .functions.ts
// porque o splitter do TanStack pode remover/mover código em módulos de
// server functions, quebrando helpers de escopo de módulo no client bundle.

export function parseTicket(raw: unknown): number {
  if (raw == null) return 0;
  let s = String(raw).replace(/R\$\s?/g, "").replace(/\s/g, "").trim();
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (hasDot && hasComma) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (hasComma) {
    const after = s.split(",")[1] || "";
    s = after.length <= 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (hasDot) {
    const after = s.split(".").pop() || "";
    if (after.length === 3) s = s.replace(/\./g, "");
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export function parseDataField(raw: unknown): number | null {
  if (!raw) return null;
  const s = String(raw).trim();
  let y = 0, m = 0, d = 0;
  let match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) { y = +match[1]; m = +match[2]; d = +match[3]; }
  else {
    match = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
    if (match) { d = +match[1]; m = +match[2]; y = +match[3]; }
    else return null;
  }
  const t = Date.UTC(y, m - 1, d);
  return Number.isFinite(t) ? t : null;
}

export const TIERS: { min: number; rate: number }[] = [
  { min: 25000, rate: 250 },
  { min: 20000, rate: 200 },
  { min: 15000, rate: 120 },
  { min: 10000, rate: 80 },
  { min: 0, rate: 60 },
];

function calcularMilharesAcumulados(acumulado: number): number {
  if (acumulado < 991) return 0;
  let N = 1;
  while (true) {
    const proximoMinimo = ((N + 1) * 1000) - ((N + 1) * 10 - 1);
    if (acumulado >= proximoMinimo) {
      N++;
    } else {
      break;
    }
  }
  return N;
}

export function tierRate(cumulativo: number): number {
  const miles = calcularMilharesAcumulados(cumulativo);
  if (miles >= 25) return 250;
  if (miles >= 20) return 200;
  if (miles >= 15) return 120;
  if (miles >= 10) return 80;
  return 60;
}
