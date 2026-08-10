import type { RouteStop, RoutePart } from "./data";

// ─── parseRouteText (supports multiple parts COD/COD2/COD3... and flexible turn headers) ──
export function parseRouteText(text: string): RouteStop[] {
  if (!text.trim()) return [];
  const lines = text.trim().replace(/\r\n/g, '\n').split('\n');
  const headerLine = lines.shift()?.trim();
  if (!headerLine) return [];
  const hasTabs = headerLine.includes('\t');
  const getColumns = (line: string) =>
    hasTabs ? line.split('\t').map(c => c.trim().replace(/ {2,}/g, ' '))
            : line.replace(/[\s\t]{2,}/g, '\t').split('\t').map(c => c.trim());
  const headers = getColumns(headerLine).map(h => h.toLowerCase());

  const getIndex = (names: string | string[]) => {
    const nameList = Array.isArray(names) ? names : [names];
    for (const n of nameList) {
      const i = headers.indexOf(n.toLowerCase());
      if (i !== -1) return i;
    }
    for (const n of nameList) {
      const i = headers.findIndex(h => h.includes(n.toLowerCase()));
      if (i !== -1) return i;
    }
    return -1;
  };

  const hi = {
    soNro: getIndex(['so nro.', 'so nro', 'ordem de servico', 'os', 'nro os', 'so']),
    ascJobNo: getIndex(['asc job no.', 'asc job no', 'asc job']),
    consumerName: getIndex(['nome consumidor', 'consumidor', 'cliente', 'nome cliente']),
    city: getIndex(['cidade', 'city']),
    neighborhood: getIndex(['bairro', 'bairro/distrito']),
    state: getIndex(['uf', 'estado', 'st']),
    zipCode: getIndex(['cep', 'codigo postal', 'zip', 'zip code', 'zipcode']),
    model: getIndex(['modelo', 'model']),
    turn: getIndex(['turno', 'turno atendimento', 'turno atend.', 'periodo', 'período', 'horario', 'horário']),
    tat: getIndex(['tat']),
    requestDate: getIndex(['data de solicitação', 'data solicitacao', 'data sol']),
    firstVisitDate: getIndex(['1st visit date', 'primeira visita', 'data visita', 'agendamento']),
    ts: getIndex(['ts']),
    warrantyType: getIndex(['ow/lp', 'garantia', 'tipo garantia']),
    productType: getIndex(['spd', 'produto', 'tipo produto']),
    statusComment: getIndex(['status comment', 'status', 'comentario']),
  };

  const partColumns: { codeIndex: number; qtyIndex?: number; descIndex?: number }[] = [];

  headers.forEach((header, index) => {
    const cleanHeader = header.replace(/[^a-z0-9]/g, '');
    const isCodHeader = cleanHeader.startsWith('cod') || cleanHeader.startsWith('codigo');

    if (isCodHeader) {
      const codeIndex = index;
      let qtyIndex: number | undefined = undefined;
      let descIndex: number | undefined = undefined;

      for (let offset = 1; offset <= 3; offset++) {
        const nextHeader = (headers[index + offset] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!nextHeader) break;

        if (nextHeader.startsWith('desc')) {
          descIndex = index + offset;
        } else if (nextHeader.startsWith('qtd') || nextHeader.startsWith('quant')) {
          qtyIndex = index + offset;
        }
      }

      partColumns.push({ codeIndex, qtyIndex, descIndex });
    }
  });

  return lines.map(line => {
    const cols = getColumns(line);
    const so = hi.soNro !== -1 ? cols[hi.soNro]?.trim() : cols[0]?.trim();
    if (!so || so.toLowerCase().includes('so nro')) return null;

    const parts: RoutePart[] = [];
    partColumns.forEach(pc => {
      const code = cols[pc.codeIndex]?.trim();
      if (!code) return;

      let quantity = 1;
      if (pc.qtyIndex !== undefined) {
        const rawQty = parseInt(cols[pc.qtyIndex]?.trim() || '', 10);
        if (!isNaN(rawQty) && rawQty > 0) {
          quantity = rawQty;
        }
      }

      const description = pc.descIndex !== undefined ? (cols[pc.descIndex]?.trim() || '') : '';

      if (!parts.some(p => p.code === code)) {
        parts.push({
          code,
          description,
          quantity,
          trackingCode: ''
        });
      }
    });

    return {
      serviceOrder: so,
      ascJobNumber: hi.ascJobNo !== -1 ? (cols[hi.ascJobNo]?.trim() || '') : '',
      consumerName: hi.consumerName !== -1 ? (cols[hi.consumerName]?.trim() || '') : '',
      city: hi.city !== -1 ? (cols[hi.city]?.trim() || '') : '',
      neighborhood: hi.neighborhood !== -1 ? (cols[hi.neighborhood]?.trim() || '') : '',
      state: hi.state !== -1 ? (cols[hi.state]?.trim() || '') : '',
      zipCode: hi.zipCode !== -1 ? (cols[hi.zipCode]?.trim() || '') : '',
      model: hi.model !== -1 ? (cols[hi.model]?.trim() || '') : '',
      turn: hi.turn !== -1 ? (cols[hi.turn]?.trim() || '') : '',
      tat: hi.tat !== -1 ? (cols[hi.tat]?.trim() || '') : '',
      requestDate: hi.requestDate !== -1 ? (cols[hi.requestDate]?.trim() || '') : '',
      firstVisitDate: hi.firstVisitDate !== -1 ? (cols[hi.firstVisitDate]?.trim() || '') : '',
      ts: hi.ts !== -1 ? (cols[hi.ts]?.trim() || '') : '',
      warrantyType: hi.warrantyType !== -1 ? (cols[hi.warrantyType]?.trim() || '') : '',
      productType: hi.productType !== -1 ? (cols[hi.productType]?.trim() || '') : '',
      statusComment: hi.statusComment !== -1 ? (cols[hi.statusComment]?.trim() || '') : '',
      parts,
      stopType: 'padrao' as const,
    } as RouteStop;
  }).filter((s): s is RouteStop => s !== null);
}
