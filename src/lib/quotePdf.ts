// Geração do PDF de Orçamento, replicando pixel a pixel a estrutura do
// template padrão Samsung ("Template de Orçamento.xlsx" / template.pdf):
// larguras de coluna, cores de rótulo, ausência de título/linhas decorativas
// e a mesma área útil (a tabela do template não ocupa a largura total da
// página - termina por volta de 157mm, deixando uma margem direita maior).
//
// Os itens (código/descrição/valor) já chegam prontos e editados pelo
// operador - este módulo só desenha o PDF, não recalcula nada.

import jsPDF from "jspdf";
import "jspdf-autotable";
import type { RepairCenterInfo } from "@/lib/data";

const brl2 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type QuoteItem = { code?: string; description: string; value: number; kind: "peca" | "servico" };

// Medidas extraídas do template.pdf original (mm), preservadas para que o
// layout final bata com o documento de referência.
const FORM_X = 15.7;
const FORM_W = 141;
const RIGHT_COL_X = 111.8;

const CANAIS_ATENDIMENTO_LINES: { text: string; bold?: boolean; underline?: boolean }[] = [
  { text: "Canais de Atendimento SAMSUNG", bold: true, underline: true },
  { text: "Online", bold: true },
  { text: "Para suporte via Chat ou e-mail acesse www.samsung.com/br/support" },
  { text: "Vídeos no Youtube com dicas de configuração, atualização de softwares: acesse www.youtube.com/samsungbrasil" },
  { text: "Tipos de atendimento:", bold: true },
  { text: "Balcão / Via Correios / Em domicílio" },
  { text: "Central de Atendimento", bold: true },
  { text: "4004-0000 (Capitais) / 0800 555 0000 (Demais Cidades)" },
  { text: "Seg. a Sex. das 8h às 22h, Sáb. e Dom. das 9h às 18h" },
];

const AVISO_LEGAL = `IMPORTANTE: É de responsabilidade do cliente realizar cópia de segurança (backup) de agenda, fotos, documentos, músicas, aplicativos ou quaisquer outros tipos de dados, informações gravados no produto (Celular, Tablet ou Notebook). Não nos responsabilizamos pela película instalada no produto.

Autorizo a Samsung a utilizar meus dados pessoais presentes nesta Ordem de Serviço para a finalidade específica de realização do reparo do produto.
Para maior comodidade e satisfação de nossos consumidores, mesmo quando não constatado nenhuma falha, todos os aparelhos avaliados já retornam com a versão de Software atualizada.

"Se o produto for submetido a algum reparo contendo trinca na tela decorrente de uso indevido, o usuário fica ciente de que eventual dano maior à tela não será de responsabilidade da Samsung e/ou da Assistência Técnica".

"O valor indicado corresponde ao orçamento após análise para reparo do produto. Na impossibilidade do reparo, será ofertada a troca pelo mesmo modelo, hipótese em que o valor indicado será devido pelo usuário".

A aprovação deste orçamento se dará por escrito via balcão; por telefone, mediante gravação da chamada; por SMS, whatsapp ou e-mail com descrição das peças que serão utilizadas e serviços que devem ser realizados.
A aprovação do orçamento confirma o aceite do cliente aos termos de serviço apresentados na abertura da ordem de serviço.`;

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch("/samsung-logo.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function buildAndDownloadQuotePdf(input: {
  repairCenter: RepairCenterInfo;
  osNumber?: string;
  clientNumber?: string;
  clientName: string;
  clientCpf: string;
  symptom?: string;
  accessory?: string;
  defectFound?: string;
  serviceDescription?: string;
  observations?: string;
  completionTime?: string;
  items: QuoteItem[];
  discount: number;
}): Promise<void> {
  const {
    repairCenter, osNumber, clientNumber, clientName, clientCpf,
    symptom, accessory, defectFound, serviceDescription, observations, completionTime,
    items, discount,
  } = input;

  const doc = new jsPDF();
  const pageHeight = doc.internal.pageSize.getHeight();

  const ink = { r: 0, g: 0, b: 0 };
  const teal = { r: 38, g: 137, b: 182 };
  const gridColor: [number, number, number] = [180, 180, 180];

  const gridBase = {
    theme: "grid" as const,
    styles: { fontSize: 7, cellPadding: 0.5, lineHeightFactor: 1.0, textColor: [ink.r, ink.g, ink.b] as [number, number, number], lineColor: gridColor, lineWidth: 0.2 },
  };
  const tealLabel = { textColor: [teal.r, teal.g, teal.b] as [number, number, number], fontSize: 7 };

  // ── Logo ──
  const logoDataUrl = await loadLogoDataUrl();
  if (logoDataUrl) {
    const logoW = 34.6;
    const logoH = logoW * (46 / 213);
    doc.addImage(logoDataUrl, "PNG", FORM_X, 19.8, logoW, logoH);
  }

  // ── SO Nro./No. do Cliente (esq.) + Centro de Reparo/Endereço/Telefone (dir.) - texto puro, sem bordas ──
  // Só o rótulo (antes dos ":") fica em negrito; o valor vem em peso normal.
  const drawLabelValue = (label: string, value: string, x: number, yPos: number) => {
    doc.setFontSize(7);
    doc.setTextColor(ink.r, ink.g, ink.b);
    doc.setFont("helvetica", "bold");
    doc.text(label, x, yPos);
    const labelW = doc.getTextWidth(label);
    doc.setFont("helvetica", "normal");
    doc.text(` ${value}`, x + labelW, yPos);
  };
  drawLabelValue("SO Nro.:", osNumber || "", FORM_X, 32);
  drawLabelValue("No. do Cliente:", clientNumber || "", FORM_X, 35.5);
  drawLabelValue("Centro de Reparo:", repairCenter.name || "", RIGHT_COL_X, 32);
  drawLabelValue("Endereço:", repairCenter.address || "", RIGHT_COL_X, 35.5);
  drawLabelValue("Telefone:", repairCenter.phone || "", RIGHT_COL_X, 39);

  let y = 43;

  // ── Nome Consumidor / CPF-CNPJ + campos de diagnóstico (uma única tabela, como no template) ──
  const colW = [FORM_W * 0.192, FORM_W * 0.289, FORM_W * 0.196, FORM_W * 0.323];
  const diagnosticFields: [string, string | undefined][] = [
    ["Sintoma do Cliente", symptom],
    ["Acessório", accessory],
    ["Defeito Constatado", defectFound],
    ["Descrição do Serviço", serviceDescription],
    ["Observações", observations],
  ];

  (doc as any).autoTable({
    ...gridBase,
    startY: y,
    margin: { left: FORM_X },
    tableWidth: FORM_W,
    body: [
      [
        { content: "Nome Consumidor", styles: tealLabel },
        { content: clientName || "", styles: { fontSize: 7 } },
        { content: "CPF/CNPJ", styles: tealLabel },
        { content: clientCpf || "", styles: { fontSize: 7 } },
      ],
      ...diagnosticFields.map(([label, value]) => [
        { content: label, styles: tealLabel },
        { content: value?.trim() || "", styles: { fontSize: 7 }, colSpan: 3 },
      ]),
    ],
    columnStyles: {
      0: { cellWidth: colW[0] },
      1: { cellWidth: colW[1] },
      2: { cellWidth: colW[2] },
      3: { cellWidth: colW[3] },
    },
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  // ── Tabela de itens (mesmas 7 colunas e proporções do template) ──
  if (y > pageHeight - 40) { doc.addPage(); y = 20; }
  const itemColW = [
    FORM_W * 0.081, FORM_W * 0.111, FORM_W * 0.289, FORM_W * 0.195,
    FORM_W * 0.080, FORM_W * 0.115, FORM_W * 0.128,
  ];
  const tableBody = items.length > 0
    ? items.map((it, i) => [
        String(i + 1).padStart(4, "0"),
        it.code || "",
        it.description || "",
        "",
        "1",
        brl2(it.value),
        brl2(it.value),
      ])
    : [["0001", "", "", "", "", "", ""], ["0002", "", "", "", "", "", ""]];

  (doc as any).autoTable({
    startY: y,
    margin: { left: FORM_X, right: 210 - FORM_X - FORM_W },
    tableWidth: FORM_W,
    head: [["Nro.", "Código de peça", "Descrição Peça", "Localização", "Qtd", "Preço Unitário (BRL)", "Valor (BRL)"]],
    body: tableBody,
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 0.5, lineHeightFactor: 1.0, textColor: [ink.r, ink.g, ink.b], lineColor: gridColor, lineWidth: 0.2 },
    headStyles: { fillColor: [255, 255, 255], textColor: [ink.r, ink.g, ink.b], fontStyle: "bold", fontSize: 7, halign: "center", lineColor: gridColor, lineWidth: 0.2 },
    columnStyles: {
      0: { cellWidth: itemColW[0] },
      1: { cellWidth: itemColW[1] },
      2: { cellWidth: itemColW[2] },
      3: { cellWidth: itemColW[3] },
      4: { cellWidth: itemColW[4], halign: "center" },
      5: { cellWidth: itemColW[5], halign: "right" },
      6: { cellWidth: itemColW[6], halign: "right" },
    },
  });
  y = ((doc as any).lastAutoTable?.finalY || y + 20) + 4;

  // ── Data de abertura/Tempo de Conclusão (esq.) + Totais (dir.) ──
  const partsTotal = items.filter(i => i.kind === "peca").reduce((a, i) => a + i.value, 0);
  const serviceTotal = items.filter(i => i.kind === "servico").reduce((a, i) => a + i.value, 0);
  const total = partsTotal + serviceTotal - discount;

  if (y > pageHeight - 45) { doc.addPage(); y = 20; }
  const leftW = FORM_W * 0.482;
  const rightX = FORM_X + leftW + FORM_W * 0.080;
  const rightW = FORM_W - leftW - FORM_W * 0.080;

  (doc as any).autoTable({
    ...gridBase,
    startY: y,
    margin: { left: FORM_X },
    tableWidth: leftW,
    body: [
      [{ content: "Data de abertura", styles: tealLabel }, { content: new Date().toLocaleDateString("pt-BR"), styles: { fontSize: 7 } }],
      [{ content: "Tempo de Conclusão", styles: tealLabel }, { content: completionTime?.trim() || "", styles: { fontSize: 7 } }],
    ],
    columnStyles: { 0: { cellWidth: leftW * 0.40 }, 1: { cellWidth: leftW * 0.60 } },
  });
  const leftFooterEndY = (doc as any).lastAutoTable.finalY;

  const summaryRows: [string, number, boolean][] = [
    ["Valor total de Peças", partsTotal, false],
    ["Mão de Obra", serviceTotal, false],
    ["Descontos", -discount, false],
    ["Total", total, true],
  ];
  (doc as any).autoTable({
    ...gridBase,
    startY: y,
    margin: { left: rightX },
    tableWidth: rightW,
    body: summaryRows.map(([label, value, isTotal]) => [
      { content: label, styles: isTotal ? { fontStyle: "bold" as const, fontSize: 7 } : tealLabel },
      { content: "BRL", styles: { textColor: [120, 128, 140] as [number, number, number], fontSize: 6.5 } },
      { content: brl2(value), styles: { halign: "right" as const, fontStyle: isTotal ? "bold" as const : "normal" as const, fontSize: isTotal ? 8 : 7 } },
    ]),
    columnStyles: { 0: { cellWidth: rightW * 0.40 }, 1: { cellWidth: rightW * 0.13 }, 2: { cellWidth: rightW * 0.47 } },
  });
  const rightFooterEndY = (doc as any).lastAutoTable.finalY;
  y = Math.max(leftFooterEndY, rightFooterEndY) + 6;

  // ── Canais de Atendimento (linhas com negrito/sublinhado como no template) ──
  doc.setFontSize(7);
  for (const line of CANAIS_ATENDIMENTO_LINES) {
    if (y > pageHeight - 20) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", line.bold ? "bold" : "normal");
    doc.setTextColor(ink.r, ink.g, ink.b);
    doc.text(line.text, FORM_X, y);
    if (line.underline) {
      const w = doc.getTextWidth(line.text);
      doc.setDrawColor(ink.r, ink.g, ink.b);
      doc.setLineWidth(0.15);
      doc.line(FORM_X, y + 0.6, FORM_X + w, y + 0.6);
    }
    y += 2.9;
  }
  y += 3;

  // ── Avisos legais ──
  const drawWrapped = (text: string, fontSize: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(90, 90, 90);
    const lines = doc.splitTextToSize(text, FORM_W) as string[];
    for (const line of lines) {
      if (y > pageHeight - 20) {
        doc.addPage();
        y = 20;
      }
      doc.text(line, FORM_X, y);
      y += fontSize * 0.42;
    }
    y += 4;
  };
  drawWrapped(AVISO_LEGAL, 6.5);

  // ── Assinatura ──
  if (y > pageHeight - 25) {
    doc.addPage();
    y = 20;
  }
  y += 8;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.line(FORM_X, y, FORM_X + FORM_W * 0.4, y);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Data e Assinatura do Cliente", FORM_X, y + 5);

  const safeName = (clientName || "cliente").normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  doc.save(`orcamento-${safeName || "cliente"}.pdf`);
}
