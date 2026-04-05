"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { collection, getDocs, doc, getDoc, query, where, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import type { Technician, ServiceOrder, Return, Chargeback, Preset, Indicator, Route, ChecklistTemplate, CodeCategory, Driver } from "@/lib/data";
import { startOfYear, startOfMonth, subMonths } from 'date-fns';

interface AppDataContextProps {
  symptomCodes: CodeCategory;
  repairCodes: CodeCategory;
  technicians: Technician[];
  serviceOrders: ServiceOrder[];
  returns: Return[];
  chargebacks: Chargeback[];
  presets: Preset[];
  indicators: Indicator[];
  activeRoutes: Route[];
  checklistTemplates: ChecklistTemplate[];
  drivers: Driver[];
  visitTemplate: string;
  dataFetchError: boolean;
  isLoading: boolean;
  refreshDynamicData: () => Promise<void>;
}

const AppDataContext = createContext<AppDataContextProps | undefined>(undefined);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [symptomCodes, setSymptomCodes] = useState<CodeCategory>({ "TV/AV": [], "DA": [] });
  const [repairCodes, setRepairCodes] = useState<CodeCategory>({ "TV/AV": [], "DA": [] });
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
  const [returns, setReturns] = useState<Return[]>([]);
  const [chargebacks, setChargebacks] = useState<Chargeback[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [visitTemplate, setVisitTemplate] = useState("");
  const [activeRoutes, setActiveRoutes] = useState<Route[]>([]);
  const [checklistTemplates, setChecklistTemplates] = useState<ChecklistTemplate[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [dataFetchError, setDataFetchError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDynamicData = async () => {
    try {
        const now = new Date();
        const startOfThisYear = startOfYear(now);
        const startOfRelevantMonths = startOfMonth(subMonths(now, 2));

        const [ordersSnapshot, returnsSnapshot, indicatorsSnapshot, chargebacksSnapshot, activeRoutesSnapshot, checklistsSnapshot, driversSnapshot] = await Promise.all([
            getDocs(query(collection(db, "serviceOrders"), where("date", ">=", startOfRelevantMonths))),
            getDocs(query(collection(db, "returns"), where("returnDate", ">=", startOfThisYear))),
            getDocs(collection(db, "indicators")),
            getDocs(query(collection(db, "chargebacks"), where("date", ">=", startOfThisYear))),
            getDocs(query(collection(db, "routes"), where("isActive", "==", true))),
            getDocs(collection(db, "checklistTemplates")),
            getDocs(collection(db, "drivers"))
        ]);
        
        const orders = ordersSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                date: (data.date as Timestamp).toDate(),
            } as ServiceOrder;
        });
        setServiceOrders(orders);

        const returnsData = returnsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                returnDate: (data.returnDate as Timestamp)?.toDate(),
            } as Return;
        });
        setReturns(returnsData);

        const chargebacksData = chargebacksSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                date: (data.date as Timestamp).toDate(),
            } as Chargeback;
        });
        setChargebacks(chargebacksData);
        
        const indicatorsData = indicatorsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Indicator));
        setIndicators(indicatorsData);

        const routesData = activeRoutesSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: (data.createdAt as Timestamp)?.toDate(),
                departureDate: (data.departureDate as Timestamp)?.toDate(),
                arrivalDate: (data.arrivalDate as Timestamp)?.toDate(),
            } as Route;
        });
        setActiveRoutes(routesData);

        const checklists = checklistsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChecklistTemplate));
        setChecklistTemplates(checklists);
        setDrivers(driversSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Driver)));
        setDataFetchError(false);

    } catch (error) {
        console.error("Error fetching dynamic data:", error);
        setDataFetchError(true);
    }
  };

  useEffect(() => {
    setIsLoading(true); // Ensure it returns to loading state
    
    const fetchInitialData = async (): Promise<boolean> => {
        try {
            const [symptomsDoc, repairsDoc, techsSnapshot, presetsSnapshot, templateDoc] = await Promise.all([
                getDoc(doc(db, "codes", "symptoms")),
                getDoc(doc(db, "codes", "repairs")),
                getDocs(collection(db, "technicians")),
                getDocs(collection(db, "presets")),
                getDoc(doc(db, "textTemplates", "visitAnnouncement"))
            ]);

            if (symptomsDoc.exists()) setSymptomCodes(symptomsDoc.data() as CodeCategory);
            if (repairsDoc.exists()) setRepairCodes(repairsDoc.data() as CodeCategory);
            
            const techs = techsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Technician));
            setTechnicians(techs);
            
            const presetsData = presetsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Preset));
            setPresets(presetsData);

            if (templateDoc.exists()) {
                setVisitTemplate(templateDoc.data().template);
            } else {
                setVisitTemplate(`Olá, bom dia! Somos da assistência técnica autorizada Samsung. Referente ao seu atendimento da ordem de serviço {{serviceOrder}}, para o cliente {{consumerName}} na cidade de {{city}}. Poderia me confirmar a sua localização?`);
            }
            return true;
        } catch (error) {
            console.error("Error fetching initial data:", error);
            setDataFetchError(true);
            return false;
        }
    };
    
    fetchInitialData().then((success) => {
        if(success) {
            fetchDynamicData().then(() => setIsLoading(false));
        } else {
            setIsLoading(false);
        }
    });
  }, []);

  return (
    <AppDataContext.Provider value={{ 
        symptomCodes, repairCodes, technicians, serviceOrders, returns, chargebacks,
        presets, indicators, activeRoutes, checklistTemplates, drivers, visitTemplate, dataFetchError,
        isLoading, refreshDynamicData: fetchDynamicData 
    }}>
        {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (context === undefined) {
    throw new Error('useAppData must be used within an AppDataProvider');
  }
  return context;
}
