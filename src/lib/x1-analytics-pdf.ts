import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { X1AnalyticsPayload } from "@/lib/x1-analytics.functions";

function fmtBRL(n: number) {
  return (n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtPct(n: number) {
  return `${((n || 0) * 100).toFixed(1)}%`;
}
function fmtDur(seconds: number) {
  if (!seconds || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}
function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function generateX1AnalyticsPdf(opts: {
  payload: X1AnalyticsPayload;
  from: string;
  to: string;
  operacao: string;
}) {
  const { payload, from, to, operacao } = opts;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;

  // Colors
  const primary: [number, number, number] = [37, 99, 235]; // blue-600
  const dark: [number, number, number] = [17, 24, 39];
  const gray: [number, number, number] = [107, 114, 128];

  // Header banner
  doc.setFillColor(...primary);
  doc.rect(0, 0, pageW, 90, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Relatório Analytics X1", margin, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(
    `Operação: ${operacao === "all" ? "Todas" : operacao}   •   Período: ${fmtDate(from)} a ${fmtDate(to)}`,
    margin,
    62,
  );
  doc.setFontSize(9);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, margin, 78);

  let y = 120;
  doc.setTextColor(...dark);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Resumo Executivo", margin, y);
  y += 6;

  const k = payload.kpis;
  const kpis: Array<[string, string]> = [
    ["Novos Leads", String(k.novosLeads ?? 0)],
    ["Contatos Únicos", String(k.contatosUnicos ?? 0)],
    ["Mensagens Recebidas", String(k.msgsIn ?? 0)],
    ["Mensagens Enviadas", String(k.msgsOut ?? 0)],
    ["Conversas", String(k.conversas ?? 0)],
    ["Vendas Fechadas", String(k.vendas ?? 0)],
    ["Faturamento", fmtBRL(k.faturamento ?? 0)],
    ["Ticket Médio", fmtBRL(k.ticketMedio ?? 0)],
    ["Conversão", fmtPct(k.conversao ?? 0)],
    ["Tempo Médio Resposta", fmtDur(k.tempoRespostaMedio ?? 0)],
  ];

  // KPI grid (2 cols x 5 rows)
  const cardW = (pageW - margin * 2 - 12) / 2;
  const cardH = 46;
  const gap = 8;
  y += 10;
  kpis.forEach((row, i) => {
    const col = i % 2;
    const rowIdx = Math.floor(i / 2);
    const x = margin + col * (cardW + 12);
    const cy = y + rowIdx * (cardH + gap);
    doc.setFillColor(245, 247, 251);
    doc.roundedRect(x, cy, cardW, cardH, 6, 6, "F");
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, cy, cardW, cardH, 6, 6, "S");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...gray);
    doc.text(row[0].toUpperCase(), x + 12, cy + 16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...dark);
    doc.text(row[1], x + 12, cy + 36);
  });
  y += Math.ceil(kpis.length / 2) * (cardH + gap) + 10;

  // Desempenho por Operação
  if ((payload.porOperacao ?? []).length > 0) {
    if (y > pageH - 200) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...dark);
    doc.text("Desempenho por Operação", margin, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [["Operação", "Leads", "Conversas", "Msgs In", "Msgs Out", "Vendas", "Faturamento", "Ticket", "Conv."]],
      body: payload.porOperacao.map((r) => [
        r.operacao,
        String(r.leads),
        String(r.conversas),
        String(r.msgsIn),
        String(r.msgsOut),
        String(r.vendas),
        fmtBRL(r.faturamento),
        fmtBRL(r.ticketMedio),
        fmtPct(r.conversao),
      ]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: primary, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 20;
  }

  // Desempenho por Vendedor
  if ((payload.porVendedor ?? []).length > 0) {
    if (y > pageH - 200) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...dark);
    doc.text("Desempenho por Vendedor", margin, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [["Vendedor", "UTM", "Operação", "Leads", "Msgs Env.", "Vendas", "Faturamento", "Ticket", "Conv."]],
      body: payload.porVendedor.map((r) => [
        r.nome,
        r.utm ?? "—",
        r.expert ?? "—",
        String(r.leadsAtribuidos),
        String(r.msgsEnviadas),
        String(r.vendas),
        fmtBRL(r.faturamento),
        fmtBRL(r.ticketMedio),
        fmtPct(r.conversao),
      ]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: primary, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 20;
  }

  // Série diária
  if ((payload.serieDiaria ?? []).length > 0) {
    if (y > pageH - 200) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...dark);
    doc.text("Evolução Diária", margin, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [["Data", "Msgs Recebidas", "Msgs Enviadas", "Vendas", "Faturamento"]],
      body: payload.serieDiaria.map((r: any) => [
        r.data,
        String(r.msgsIn ?? 0),
        String(r.msgsOut ?? 0),
        String(r.vendas ?? 0),
        fmtBRL(r.faturamento ?? 0),
      ]),
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: primary, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: margin, right: margin },
    });
  }

  // Footer on all pages
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...gray);
    doc.text(
      `Multium • Analytics X1 • Página ${i} de ${pages}`,
      pageW / 2,
      pageH - 20,
      { align: "center" },
    );
  }

  const fname = `analytics-x1_${operacao === "all" ? "todas" : operacao}_${from}_a_${to}.pdf`;
  doc.save(fname);
}
