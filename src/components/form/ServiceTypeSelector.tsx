import React from "react";
import { Wrench, Eye, ShieldCheck, Package, ClipboardCheck, Check } from "lucide-react";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";

interface ServiceTypeSelectorProps {
  value: string | undefined;
  onChange: (val: string) => void;
  form: any; // react-hook-form instance
}

const serviceTypes = [
  { id: "reparo_samsung", label: "Reparo Samsung", icon: Wrench },
  { id: "visita_orcamento_samsung", label: "Orçamento Samsung", icon: Eye },
  { id: "visita_assurant", label: "Visita Assurant", icon: ShieldCheck },
  { id: "coleta_eco_rma", label: "Coleta Eco / RMA", icon: Package },
  { id: "instalacao_inicial", label: "Instalação Inicial", icon: ClipboardCheck },
];

export function ServiceTypeSelector({ value, onChange, form }: ServiceTypeSelectorProps) {
  const watchedSamsungBudgetApproved = form.watch("samsungBudgetApproved");

  return (
    <div className="space-y-4 w-full">
      <div className="flex flex-col gap-2.5">
        {serviceTypes.map((item) => {
          const Icon = item.icon;
          const isSelected = value === item.id;

          return (
            <div key={item.id} className="w-full">
              {/* Card Button */}
              <button
                type="button"
                onClick={() => onChange(item.id)}
                className={`flex items-center justify-between w-full h-[52px] px-4 rounded-xl border text-sm font-semibold transition-all duration-200 ${
                  isSelected
                    ? "border-[#1a85ff] bg-[#1a85ff]/5 text-[#1a85ff] shadow-sm"
                    : "border-border bg-card/45 text-muted-foreground hover:bg-card/85"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-4.5 w-4.5" />
                  <span>{item.label}</span>
                </div>
                {isSelected && (
                  <div className="bg-[#1a85ff] text-white p-0.5 rounded-full">
                    <Check className="h-3 w-3" />
                  </div>
                )}
              </button>

              {/* Conditional Nested Sub-options under selected card */}
              {isSelected && item.id === "reparo_samsung" && (
                <div className="mt-3 ml-3 pl-3 border-l-2 border-primary/20 space-y-4 animate-in slide-in-from-top-3 duration-250">
                  <FormField
                    control={form.control}
                    name="samsungRepairType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground/80 dark:text-slate-400">Tipo de Reparo Samsung</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-12 rounded-xl bg-card/45 border-border dark:bg-[#1E2436]/50 dark:border-[#1E2436] dark:text-slate-300 md:h-10 md:rounded-md">
                              <SelectValue placeholder="Selecione o tipo de reparo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="LP">LP</SelectItem>
                            <SelectItem value="OW">OW</SelectItem>
                            <SelectItem value="VOID">VOID</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {isSelected && item.id === "visita_orcamento_samsung" && (
                <div className="mt-3 ml-3 pl-3 border-l-2 border-primary/20 space-y-4 animate-in slide-in-from-top-3 duration-250">
                  <FormField
                    control={form.control}
                    name="samsungBudgetApproved"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30 border border-border/10">
                        <div className="space-y-0.5">
                          <FormLabel className="text-xs text-muted-foreground/80 dark:text-slate-400">Orçamento Aprovado?</FormLabel>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {watchedSamsungBudgetApproved && (
                    <FormField
                      control={form.control}
                      name="samsungBudgetValue"
                      render={({ field }) => (
                        <FormItem className="animate-in slide-in-from-top-2 duration-200">
                          <FormLabel className="text-xs text-muted-foreground/80 dark:text-slate-400">Valor do Orçamento (R$)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0,00"
                              className="h-12 rounded-xl bg-card/45 border-border dark:bg-[#1E2436]/50 dark:border-[#1E2436] dark:text-slate-300 md:h-10 md:rounded-md"
                              {...field}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              )}

              {isSelected && item.id === "coleta_eco_rma" && (
                <div className="mt-3 ml-3 pl-3 border-l-2 border-primary/20 space-y-4 animate-in slide-in-from-top-3 duration-250">
                  <FormField
                    control={form.control}
                    name="collectionType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground/80 dark:text-slate-400">Tipo de Coleta</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="h-12 rounded-xl bg-card/45 border-border dark:bg-[#1E2436]/50 dark:border-[#1E2436] dark:text-slate-300 md:h-10 md:rounded-md">
                              <SelectValue placeholder="Selecione o tipo de coleta" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="reparo">Reparo</SelectItem>
                            <SelectItem value="rma">RMA</SelectItem>
                            <SelectItem value="eco">Eco</SelectItem>
                            <SelectItem value="descarte">Descarte</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="productCollectedOrInstalled"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground/80 dark:text-slate-400">Produto Coletado/Entregue</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Ex: BN96-52213A"
                            className="h-12 rounded-xl bg-card/45 border-border dark:bg-[#1E2436]/50 dark:border-[#1E2436] dark:text-slate-300 md:h-10 md:rounded-md"
                            {...field}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {isSelected && item.id === "instalacao_inicial" && (
                <div className="mt-3 ml-3 pl-3 border-l-2 border-primary/20 space-y-4 animate-in slide-in-from-top-3 duration-250">
                  <FormField
                    control={form.control}
                    name="productCollectedOrInstalled"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground/80 dark:text-slate-400">Aparelho Instalado</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Modelo/Descrição do Aparelho"
                            className="h-12 rounded-xl bg-card/45 border-border dark:bg-[#1E2436]/50 dark:border-[#1E2436] dark:text-slate-300 md:h-10 md:rounded-md"
                            {...field}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
