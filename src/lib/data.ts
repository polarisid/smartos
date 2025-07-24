

import { type Timestamp } from "firebase/firestore";

export type Technician = {
  id: string;
  name: string;
  goal?: number;
};

export const technicians: Technician[] = [
  { id: '1', name: 'João Silva', goal: 5000 },
  { id: '2', name: 'Maria Oliveira', goal: 5500 },
  { id: '3', name: 'Carlos Pereira', goal: 4800 },
  { id: '4', name: 'Ana Costa', goal: 5200 },
];

export type ServiceOrder = {
  id: string;
  technicianId: string;
  serviceOrderNumber: string;
  date: Date;
  equipmentType: 'TV/AV' | 'DA';
  serviceType: 'reparo_samsung' | 'visita_orcamento_samsung' | 'visita_assurant' | 'coleta_eco_rma' | 'instalacao_inicial';
  
  samsungRepairType?: string;
  samsungBudgetApproved?: boolean;
  samsungBudgetValue?: number;

  symptomCode?: string;
  repairCode?: string;
  
  defectFound?: string;
  partsRequested?: string;

  productCollectedOrInstalled?: string;

  replacedPart?: string;
  observations?: string;

  cleaningPerformed?: boolean;
};

export type Return = {
  id: string;
  technicianId: string;
  technicianName?: string;
  originalServiceOrder: string;
  originalReplacedPart: string;
  returnServiceOrder: string;
  returnReplacedPart: string;
  returnDate: Date;
  daysToReturn: number;
  productModel: string;
};

export type Preset = {
  id: string;
  name: string;
  equipmentType: 'TV/AV' | 'DA';
  symptomCode: string;
  repairCode: string;
  replacedPart?: string;
  observations?: string;
};

export type Indicator = {
  id: string;
  name: string;
  description: string;
  goalType: 'percentage' | 'text';
  goalValue?: number;
  goalDescription?: string;
  evaluationLogic?: 'above_is_better' | 'below_is_better';
  currentValue?: number;
}

export type RoutePart = {
    code: string;
    quantity: number;
    trackingCode?: string;
}

export type RouteStop = {
    serviceOrder: string;
    ascJobNumber: string;
    consumerName: string;
    city: string;
    neighborhood: string;
    state: string;
    model: string;
    turn: string;
    tat: string;
    requestDate: string;
    firstVisitDate: string;
    ts: string;
    warrantyType: string;
    productType: string;
    statusComment: string;
    parts: RoutePart[];
}

export type Route = {
    id: string;
    name: string;
    stops: RouteStop[];
    createdAt: Timestamp;
    isActive: boolean;
    departureDate?: Timestamp | Date;
    arrivalDate?: Timestamp | Date;
    routeType?: 'capital' | 'interior';
    licensePlate?: string;
}

export type ChecklistField = {
  id: string;
  name: string;
  type: 'text' | 'checkbox';
  page: number;
  x: number;
  y: number;
}

export type ChecklistTemplate = {
  id: string;
  name: string;
  pdfUrl: string;
  fields: ChecklistField[];
}


const today = new Date();
export const serviceOrders: ServiceOrder[] = [
  // João Silva (id: '1')
  { id: 'os01', technicianId: '1', serviceOrderNumber: 'OS-001', date: new Date(), equipmentType: 'TV/AV', serviceType: 'reparo_samsung', samsungRepairType: 'LP' },
  { id: 'os02', technicianId: '1', serviceOrderNumber: 'OS-002', date: new Date(new Date().setDate(today.getDate() - 3)), equipmentType: 'DA', serviceType: 'visita_assurant', defectFound: 'Compressor não liga', partsRequested: '1x Compressor Modelo Z' },
  { id: 'os03', technicianId: '1', serviceOrderNumber: 'OS-003', date: new Date(new Date().setDate(today.getDate() - 10)), equipmentType: 'TV/AV', serviceType: 'visita_orcamento_samsung', samsungBudgetApproved: true, samsungBudgetValue: 250.00 },
  { id: 'os04', technicianId: '1', serviceOrderNumber: 'OS-004', date: new Date(new Date().setMonth(today.getMonth() - 1)), equipmentType: 'DA', serviceType: 'reparo_samsung' },

  // Maria Oliveira (id: '2')
  { id: 'os05', technicianId: '2', serviceOrderNumber: 'OS-005', date: new Date(new Date().setDate(today.getDate() - 1)), equipmentType: 'DA', serviceType: 'reparo_samsung' },
  { id: 'os06', technicianId: '2', serviceOrderNumber: 'OS-006', date: new Date(new Date().setDate(today.getDate() - 15)), equipmentType: 'TV/AV', serviceType: 'visita_assurant', defectFound: 'Tela com manchas', partsRequested: 'N/A' },
  { id: 'os07', technicianId: '2', serviceOrderNumber: 'OS-007', date: new Date(new Date().setMonth(today.getMonth() - 2)), equipmentType: 'TV/AV', serviceType: 'reparo_samsung' },
  { id: 'os12', technicianId: '2', serviceOrderNumber: 'OS-012', date: new Date(), equipmentType: 'TV/AV', serviceType: 'visita_orcamento_samsung', samsungBudgetApproved: true, samsungBudgetValue: 480.50 },


  // Carlos Pereira (id: '3')
  { id: 'os08', technicianId: '3', serviceOrderNumber: 'OS-008', date: new Date(new Date().setDate(today.getDate() - 5)), equipmentType: 'TV/AV', serviceType: 'reparo_samsung' },
  { id: 'os09', technicianId: '3', serviceOrderNumber: 'OS-009', date: new Date(new Date().setDate(today.getDate() - 6)), equipmentType: 'DA', serviceType: 'visita_assurant', defectFound: 'Vazamento de água', partsRequested: '1x Mangueira de Drenagem' },

  // Ana Costa (id: '4')
  { id: 'os10', technicianId: '4', serviceOrderNumber: 'OS-010', date: new Date(new Date().setFullYear(today.getFullYear() - 1)), equipmentType: 'TV/AV', serviceType: 'reparo_samsung' },
  { id: 'os11', technicianId: '4', serviceOrderNumber: 'OS-011', date: new Date(new Date().setDate(today.getDate() - 20)), equipmentType: 'DA', serviceType: 'visita_orcamento_samsung', samsungBudgetApproved: false },
];


export const symptomCodes = {
  'TV/AV': [
    { code: 'S01', description: 'Não liga' },
    { code: 'S02', description: 'Imagem com listras' },
    { code: 'S03', description: 'Sem som' },
    { code: 'S04', description: 'Reiniciando' },
  ],
  'DA': [
    { code: 'D01', description: 'Não gela (Refrigerador)' },
    { code: 'D02', description: 'Não aquece (Microondas)' },
    { code: 'D03', description: 'Não centrifuga (Lavadora)' },
    { code: 'D04', description: 'Vazamento de água' },
  ]
};

export const repairCodes = {
  'TV/AV': [
    { code: 'R01', description: 'Troca da fonte de alimentação' },
    { code: 'R02', description: 'Reparo na placa principal' },
    { code: 'R03', description: 'Troca dos alto-falantes' },
    { code: 'R04', description: 'Atualização de software' },
  ],
  'DA': [
    { code: 'R01', description: 'Carga de gás refrigerante' },
    { code: 'R02', description: 'Troca do magnetron' },
    { code: 'R03', description: 'Troca da placa de potência' },
    { code: 'R04', description: 'Troca da bomba de drenagem' },
  ]
};
