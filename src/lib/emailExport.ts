import { Route, RouteStop } from "./data";
import { format } from "date-fns";

export type EmailExportData = {
  route: Route;
  legKm: number[]; // distances per leg in km
  legDurationsMin?: number[]; // travel duration per leg in minutes (optional)
  totalKm: number;
  fuelAvgKml?: number;
};

/**
 * Formats a Date object or ISO string to DD/MM/YYYY
 */
function formatDateBr(d?: Date | string | null): string {
  if (!d) return "N/A";
  if (typeof d === "string") {
    if (d.includes("/")) return d;
    try {
      return format(new Date(d), "dd/MM/yyyy");
    } catch {
      return d;
    }
  }
  try {
    return format(d, "dd/MM/yyyy");
  } catch {
    return "N/A";
  }
}

/**
 * Formats per-leg duration and km string, e.g. "1h 14 min (63,5 km)"
 */
function formatLegTempo(km?: number, durMin?: number): string {
  if (km === undefined || km === null || isNaN(km) || km === 0) return "";
  const minutes = durMin !== undefined && durMin > 0 ? Math.round(durMin) : Math.round(km);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const timeStr = h > 0 ? `${h}h ${m} min` : `${m} min`;
  const kmStr = km.toFixed(1).replace(".", ",");
  return `${timeStr} (${kmStr} km)`;
}

/**
 * Formats route into Rich HTML (for Gmail/Outlook) and Plain Text clipboard payload
 */
export function buildRouteEmailPayload({
  route,
  legKm,
  legDurationsMin,
  totalKm,
  fuelAvgKml = 10,
}: EmailExportData): { html: string; plain: string; liters: number; estimatedTimeStr: string } {
  const roundedTotalKm = Math.round(totalKm);
  const liters = Math.round((roundedTotalKm / (fuelAvgKml || 10)) * 10) / 10;

  // Estimated driving time (assuming 60 km/h average)
  const totalMinutes = Math.round((roundedTotalKm / 60) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const estimatedTimeStr = hours > 0 ? `${hours}h ${mins}min` : `${mins}min`;

  const placa = (route.licensePlate || "TEM8E13").toUpperCase();
  const tecnico = (route.technicianName || "N/A").toUpperCase();
  const motorista = (route.driverName || route.technicianName || "N/A").toUpperCase();

  const dataSaida = formatDateBr(route.departureDate || route.plannedDate);
  const dataRetorno = formatDateBr(route.arrivalDate || route.departureDate || route.plannedDate);

  // 1. Build Plain Text
  let plain = `Prezados segue rota:\n`;
  plain += `VEÍCULO: ${placa}\n`;
  plain += `TECNICO: ${tecnico}\n`;
  plain += `MOTORISTA: ${motorista}\n`;
  plain += `SAÍDA: ${dataSaida}\n`;
  plain += `RETORNO: ${dataRetorno}\n`;
  plain += `KM TOTAL : ${roundedTotalKm}\n`;
  plain += `TEMPO ESTIMADO: ${estimatedTimeStr}\n`;
  plain += `ESTIMATIVA COMBUSTÍVEL: ${liters} L (Média ${fuelAvgKml} km/L)\n\n`;

  plain += `SO Nro.\tASC Job No.\tNome Consumidor\tCidade\tBairro\tUF\tModelo\tTURNO\tTAT\tData de Solicitação\t1st Visit Date\tTempo\tKM\tTS\tOW/LP\n`;

  route.stops.forEach((stop, i) => {
    const kmStr = legKm[i] !== undefined ? `${Math.round(legKm[i])}` : "";
    const tempoStr = formatLegTempo(legKm[i], legDurationsMin?.[i]);

    plain += `${stop.serviceOrder || ""}\t${stop.ascJobNumber || stop.serviceOrder || ""}\t${stop.consumerName || ""}\t${stop.city || ""}\t${stop.neighborhood || ""}\t${stop.state || "Sergipe"}\t${stop.model || ""}\t${stop.turn || ""}\t${stop.tat || ""}\t${stop.requestDate || ""}\t${stop.firstVisitDate || dataSaida}\t${tempoStr}\t${kmStr}\t${stop.ts || "IH"}\t${stop.warrantyType || "LP"}\n`;
  });

  plain += `\t\t\t\t\t\t\t\t\t\t\t\t${roundedTotalKm}\t\t\n`;

  // 2. Build Rich HTML Table matching user's screenshot
  let html = `
  <div style="font-family: Arial, sans-serif; font-size: 13px; color: #111; line-height: 1.5;">
    <p style="margin: 0 0 6px 0;">Prezados segue rota:</p>
    <p style="margin: 0;"><b>VEÍCULO:</b> ${placa}</p>
    <p style="margin: 0;"><b>TECNICO:</b> ${tecnico}</p>
    <p style="margin: 0;"><b>MOTORISTA:</b> ${motorista}</p>
    <p style="margin: 0;"><b>SAÍDA:</b> ${dataSaida}</p>
    <p style="margin: 0;"><b>RETORNO:</b> ${dataRetorno}</p>
    <p style="margin: 0 0 4px 0;"><b>KM TOTAL :</b> ${roundedTotalKm} km</p>
    <p style="margin: 0 0 4px 0;"><b>TEMPO ESTIMADO:</b> ${estimatedTimeStr}</p>
    <p style="margin: 0 0 14px 0;"><b>ESTIMATIVA COMBUSTÍVEL:</b> ${liters} L (Média ${fuelAvgKml} km/L)</p>

    <table style="border-collapse: collapse; width: 100%; max-width: 1100px; font-size: 12px; text-align: left; font-family: Arial, sans-serif;">
      <thead>
        <tr style="background-color: #000000; color: #ffffff; font-weight: bold; font-size: 11px;">
          <th style="border: 1px solid #000000; padding: 5px 8px;">SO Nro.</th>
          <th style="border: 1px solid #000000; padding: 5px 8px;">ASC Job No.</th>
          <th style="border: 1px solid #000000; padding: 5px 8px;">Nome Consumidor</th>
          <th style="border: 1px solid #000000; padding: 5px 8px;">Cidade</th>
          <th style="border: 1px solid #000000; padding: 5px 8px;">Bairro</th>
          <th style="border: 1px solid #000000; padding: 5px 8px;">UF</th>
          <th style="border: 1px solid #000000; padding: 5px 8px;">Modelo</th>
          <th style="border: 1px solid #000000; padding: 5px 8px;">TURNO</th>
          <th style="border: 1px solid #000000; padding: 5px 8px;">TAT</th>
          <th style="border: 1px solid #000000; padding: 5px 8px;">Data de Solicitação</th>
          <th style="border: 1px solid #000000; padding: 5px 8px;">1st Visit Date</th>
          <th style="border: 1px solid #000000; padding: 5px 8px;">Tempo</th>
          <th style="border: 1px solid #000000; padding: 5px 8px; text-align: right;">KM</th>
          <th style="border: 1px solid #000000; padding: 5px 8px;">TS</th>
          <th style="border: 1px solid #000000; padding: 5px 8px;">OW/LP</th>
        </tr>
      </thead>
      <tbody>
  `;

  route.stops.forEach((stop, i) => {
    const kmStr = legKm[i] !== undefined ? `${Math.round(legKm[i])}` : "";
    const tempoStr = formatLegTempo(legKm[i], legDurationsMin?.[i]);

    html += `
        <tr>
          <td style="border: 1px solid #000000; padding: 5px 8px; font-weight: bold;">${stop.serviceOrder || ""}</td>
          <td style="border: 1px solid #000000; padding: 5px 8px;">${stop.ascJobNumber || stop.serviceOrder || ""}</td>
          <td style="border: 1px solid #000000; padding: 5px 8px;">${stop.consumerName || ""}</td>
          <td style="border: 1px solid #000000; padding: 5px 8px;">${stop.city || ""}</td>
          <td style="border: 1px solid #000000; padding: 5px 8px;">${stop.neighborhood || ""}</td>
          <td style="border: 1px solid #000000; padding: 5px 8px;">${stop.state || "Sergipe"}</td>
          <td style="border: 1px solid #000000; padding: 5px 8px;">${stop.model || ""}</td>
          <td style="border: 1px solid #000000; padding: 5px 8px;">${stop.turn || ""}</td>
          <td style="border: 1px solid #000000; padding: 5px 8px;">${stop.tat || ""}</td>
          <td style="border: 1px solid #000000; padding: 5px 8px;">${stop.requestDate || ""}</td>
          <td style="border: 1px solid #000000; padding: 5px 8px;">${stop.firstVisitDate || dataSaida}</td>
          <td style="border: 1px solid #000000; padding: 5px 8px; font-weight: bold;">${tempoStr}</td>
          <td style="border: 1px solid #000000; padding: 5px 8px; text-align: right; font-weight: bold;">${kmStr}</td>
          <td style="border: 1px solid #000000; padding: 5px 8px;">${stop.ts || "IH"}</td>
          <td style="border: 1px solid #000000; padding: 5px 8px;">${stop.warrantyType || "LP"}</td>
        </tr>
    `;
  });

  html += `
        <tr style="font-weight: bold; background-color: #f8f9fa;">
          <td colspan="12" style="border: 1px solid #000000; padding: 5px 8px; text-align: right;">TOTAL:</td>
          <td style="border: 1px solid #000000; padding: 5px 8px; text-align: right; font-size: 13px;">${roundedTotalKm}</td>
          <td colspan="2" style="border: 1px solid #000000; padding: 5px 8px;"></td>
        </tr>
      </tbody>
    </table>
  </div>
  `;

  return { html, plain, liters, estimatedTimeStr };
}

/**
 * Copies Rich HTML + Plain text to Clipboard
 */
export async function copyRouteEmailToClipboard(exportData: EmailExportData): Promise<boolean> {
  const { html, plain } = buildRouteEmailPayload(exportData);

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.ClipboardItem) {
      const blobHtml = new Blob([html], { type: "text/html" });
      const blobText = new Blob([plain], { type: "text/plain" });
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": blobHtml,
          "text/plain": blobText,
        }),
      ]);
      return true;
    }
  } catch (e) {
    console.warn("Rich HTML clipboard failed, falling back to plain text", e);
  }

  // Fallback to text
  try {
    await navigator.clipboard.writeText(plain);
    return true;
  } catch {
    return false;
  }
}
