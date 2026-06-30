"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from "@/context/AuthContext";
import type { Technician, ServiceOrder, Return, Chargeback, Preset, Indicator, Route, ChecklistTemplate, CodeCategory, Driver } from "@/lib/data";
import { startOfYear, startOfMonth, subMonths } from 'date-fns';
import { technicianService } from "@/services/supabase/technicianService";
import { serviceOrderService } from "@/services/supabase/serviceOrderService";
import { driverService } from "@/services/supabase/driverService";
import { routeService } from "@/services/supabase/routeService";
import { checklistService } from "@/services/supabase/checklistService";
import { returnService } from "@/services/supabase/returnService";
import { chargebackService } from "@/services/supabase/chargebackService";
import { indicatorService } from "@/services/supabase/indicatorService";
import { presetService } from "@/services/supabase/presetService";
import { codeService } from "@/services/supabase/codeService";
import { configService } from "@/services/supabase/configService";

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
        const [ordersData, returnsData, indicatorsData, chargebacksData, activeRoutesData, checklistsData, driversData] = await Promise.all([
            serviceOrderService.getRecentOrders(2000), // Optimization: Only load recent OS to context
            returnService.getAll(),
            indicatorService.getAll(),
            chargebackService.getAll(),
            routeService.getAll().then(routes => routes.filter(r => r.isActive)),
            checklistService.getAll(),
            driverService.getAll()
        ]);
        
        setServiceOrders(ordersData);

        setReturns(returnsData);
        setChargebacks(chargebacksData);
        setIndicators(indicatorsData);

        setActiveRoutes(activeRoutesData);
        setChecklistTemplates(checklistsData);
        setDrivers(driversData);
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
            const [
                symptomsDoc, 
                repairsDoc, 
                techsData, 
                presetsData,
                templateData
            ] = await Promise.all([
                codeService.getSymptoms(),
                codeService.getRepairs(),
                technicianService.getAll(),
                presetService.getAll(),
                configService.getTextTemplate("visitAnnouncement")
            ]);

            if (symptomsDoc) setSymptomCodes(symptomsDoc);
            if (repairsDoc) setRepairCodes(repairsDoc);
            
            setTechnicians(techsData);
            setPresets(presetsData);

            if (templateData) {
                setVisitTemplate(templateData);
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
