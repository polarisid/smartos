// Gera planilhas no formato SpreadsheetML (abre direto no Excel, com cores por linha e várias abas), sem depender de
// biblioteca: o pacote `xlsx` da comunidade não escreve cor de célula.

export type SheetTone = "default" | "green" | "red" | "blue" | "amber";
export type SheetRow = { values: Array<string | number | null | undefined>; tone?: SheetTone };
export type SheetDef = {
    name: string;
    headers: string[];
    rows: SheetRow[];
    /** Largura de cada coluna em caracteres (opcional). */
    widths?: number[];
};

const escapeXml = (v: string | number | null | undefined) =>
    v === undefined || v === null
        ? ""
        : String(v)
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");

const TONES: Record<SheetTone, { font: string; fill: string | null }> = {
    default: { font: "#000000", fill: null },
    green: { font: "#006100", fill: "#C6EFCE" },
    red: { font: "#9C0006", fill: "#FFC7CE" },
    blue: { font: "#1F3A8A", fill: "#DBEAFE" },
    amber: { font: "#7C5300", fill: "#FFEB9C" },
};

function borders(color: string) {
    return ["Bottom", "Left", "Right", "Top"]
        .map(p => `<Border ss:Position="${p}" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="${color}"/>`)
        .join("");
}

function stylesXml() {
    const tone = (id: string, t: { font: string; fill: string | null }) => `  <Style ss:ID="${id}">
   <Alignment ss:Vertical="Center" ss:Horizontal="Left" ss:WrapText="1"/>
   <Borders>${borders("#CCCCCC")}</Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="${t.font}"/>
${t.fill ? `   <Interior ss:Color="${t.fill}" ss:Pattern="Solid"/>\n` : ""}  </Style>`;
    return `<Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#000000"/>
  </Style>
  <Style ss:ID="Header">
   <Alignment ss:Vertical="Center" ss:Horizontal="Left" ss:WrapText="1"/>
   <Borders>${borders("#000000")}</Borders>
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#000000" ss:Pattern="Solid"/>
  </Style>
${(Object.keys(TONES) as SheetTone[]).map(k => tone("T_" + k, TONES[k])).join("\n")}
 </Styles>`;
}

function sheetXml(sheet: SheetDef) {
    const cols = sheet.widths ? sheet.widths.map(w => `   <Column ss:Width="${Math.round(w * 5.6)}"/>`).join("\n") + "\n" : "";
    let body = `   <Row ss:Height="24">\n` + sheet.headers.map(h => `    <Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join("\n") + `\n   </Row>\n`;
    sheet.rows.forEach(row => {
        const style = "T_" + (row.tone || "default");
        body += `   <Row>\n` + row.values.map(v => {
            const numeric = typeof v === "number" && Number.isFinite(v);
            return `    <Cell ss:StyleID="${style}"><Data ss:Type="${numeric ? "Number" : "String"}">${escapeXml(v as any)}</Data></Cell>`;
        }).join("\n") + `\n   </Row>\n`;
    });
    // Nome da aba: até 31 caracteres e sem os símbolos que o Excel não aceita.
    const name = escapeXml(sheet.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
    return ` <Worksheet ss:Name="${name}">
  <Table>
${cols}${body}  </Table>
 </Worksheet>`;
}

export function buildSpreadsheetXml(sheets: SheetDef[]): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 ${stylesXml()}
${sheets.map(sheetXml).join("\n")}
</Workbook>`;
}

export function downloadSpreadsheet(fileName: string, sheets: SheetDef[]) {
    const blob = new Blob([buildSpreadsheetXml(sheets)], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName.replace(/[\\/:*?"<>|]/g, "-") + (/\.xls$/i.test(fileName) ? "" : ".xls");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
