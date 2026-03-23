"use client";

import { useState, useEffect } from "react";
import { Copy, Trash2, Plus, QrCode, ScanLine, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import dynamic from "next/dynamic";

const ScannerDialog = dynamic(
  () => import('@/components/ScannerDialog').then(mod => mod.ScannerDialog),
  { ssr: false }
);

interface ScannedPart {
  id: string;
  name: string;
  newCode: string;
  usedCode: string;
}

export function PartScannerClipboard() {
  const [parts, setParts] = useState<ScannedPart[]>([]);

  // State for the new part being added
  const [currentName, setCurrentName] = useState("");
  const [currentNewCode, setCurrentNewCode] = useState("");
  const [currentUsedCode, setCurrentUsedCode] = useState("");
  
  // State to manage scanner dialog
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [activeScanTarget, setActiveScanTarget] = useState<'new' | 'used' | null>(null);

  // Guard: don't save until after first load from localStorage
  const [isLoaded, setIsLoaded] = useState(false);

  const { toast } = useToast();

  // Load from localStorage on mount FIRST
  useEffect(() => {
    try {
      const saved = localStorage.getItem("scanned_parts_clipboard");
      if (saved) setParts(JSON.parse(saved));
    } catch (e) { console.error("Failed to parse scanner history", e); }

    try {
      const pending = localStorage.getItem("scanned_parts_pending");
      if (pending) {
        const { name, newCode, usedCode } = JSON.parse(pending);
        if (name) setCurrentName(name);
        if (newCode) setCurrentNewCode(newCode);
        if (usedCode) setCurrentUsedCode(usedCode);
      }
    } catch (e) { console.error("Failed to parse pending scan data", e); }

    // Mark as loaded so save effects can run
    setIsLoaded(true);
  }, []);

  // Save confirmed parts to localStorage — only after initial load
  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem("scanned_parts_clipboard", JSON.stringify(parts));
  }, [parts, isLoaded]);

  // Save pending inputs to localStorage on every change — only after initial load
  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem("scanned_parts_pending", JSON.stringify({ name: currentName, newCode: currentNewCode, usedCode: currentUsedCode }));
  }, [currentName, currentNewCode, currentUsedCode, isLoaded]);

  const handleAddPart = () => {
    if (!currentName.trim()) {
      toast({
        variant: "destructive",
        title: "Nome da peça faltando",
        description: "Adicione um nome para a peça antes de salvar."
      });
      return;
    }

    const newPart: ScannedPart = {
      id: Date.now().toString(),
      name: currentName.trim(),
      newCode: currentNewCode.trim(),
      usedCode: currentUsedCode.trim(),
    };

    setParts((prev) => [...prev, newPart]);
    
    // Reset form and clear pending storage
    setCurrentName("");
    setCurrentNewCode("");
    setCurrentUsedCode("");
    localStorage.removeItem("scanned_parts_pending");
    toast({ title: "Peça adicionada à sacola!" });
  };

  const handleRemovePart = (id: string) => {
    setParts((prev) => prev.filter(p => p.id !== id));
  };

  const handleClearAll = () => {
    if (confirm("Tem certeza que deseja apagar todas as peças escaneadas?")) {
      setParts([]);
      toast({ title: "Sacola limpa!" });
    }
  };

  const handleCopyText = () => {
    if (parts.length === 0) return;

    let textToCopy = "";
    parts.forEach(part => {
      textToCopy += `${part.name} nova:\n${part.newCode || 'Sem código'}\n`;
      textToCopy += `${part.name} Usada:\n${part.usedCode || 'Sem código'}\n\n`;
    });

    navigator.clipboard.writeText(textToCopy.trim());
    toast({
      title: "Texto Copiado!",
      description: "As informações das peças foram copiadas."
    });
  };

  const handleScanSuccess = (decodedText: string) => {
    if (activeScanTarget === 'new') {
      setCurrentNewCode(decodedText);
      toast({ title: "Código da Peça Nova escaneado!" });
    } else if (activeScanTarget === 'used') {
      setCurrentUsedCode(decodedText);
      toast({ title: "Código da Peça Usada escaneado!" });
    }
    setIsScannerOpen(false);
    setActiveScanTarget(null);
  };

  const openScannerFor = (target: 'new' | 'used') => {
    setActiveScanTarget(target);
    setIsScannerOpen(true);
  };

  return (
    <>
      <Card className="w-full flex flex-col h-full border-none shadow-none md:border-solid md:shadow-sm md:bg-card">
        <CardHeader className="px-1 pt-0 pb-3 md:p-6">
          <CardTitle className="text-[22px] md:text-2xl tracking-tight leading-none">Sacola de Códigos (Peças)</CardTitle>
          <CardDescription className="text-xs md:text-sm mt-1 leading-tight text-muted-foreground/80 md:text-muted-foreground">
            Escaneie peças novas e usadas. O histórico fica salvo mesmo se fechar o navegador ou trocar de aba.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4 overflow-y-auto flex-1 px-1 md:px-6">
            {/* Adicionar nova peça form */}
            <Card className="bg-muted/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Escanear Nova Peça</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label>Nome da Peça (Ex: Placa Main, Tela)</Label>
                  <Input 
                    value={currentName}
                    onChange={(e) => setCurrentName(e.target.value)}
                    placeholder="Ex: Placa Main"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Peça Nova</Label>
                    <div className="flex gap-1">
                      <Input 
                        value={currentNewCode}
                        onChange={(e) => setCurrentNewCode(e.target.value)}
                        placeholder="Cód."
                        className="text-xs px-2"
                      />
                      <Button type="button" size="icon" variant="secondary" onClick={() => openScannerFor('new')}>
                        <ScanLine className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <Label className="text-xs">Peça Usada</Label>
                    <div className="flex gap-1">
                      <Input 
                        value={currentUsedCode}
                        onChange={(e) => setCurrentUsedCode(e.target.value)}
                        placeholder="Cód."
                        className="text-xs px-2"
                      />
                      <Button type="button" size="icon" variant="secondary" onClick={() => openScannerFor('used')}>
                        <ScanLine className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                <Button onClick={handleAddPart} className="w-full mt-2" size="sm">
                  <Plus className="mr-2 h-4 w-4" /> Guardar Peça
                </Button>
              </CardContent>
            </Card>

            {/* Lista de Peças Escaneadas */}
            <div className="space-y-3 mt-2">
              <div className="flex items-center justify-between">
                <Label className="font-semibold">Peças na Sacola ({parts.length})</Label>
                {parts.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={handleClearAll} className="h-8 text-destructive px-2">
                    <Trash2 className="h-4 w-4 mr-1"/> Limpar Tudo
                  </Button>
                )}
              </div>
              
              {parts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg">
                  Nenhuma peça escaneada ainda.
                </div>
              ) : (
                parts.map(part => (
                  <Card key={part.id} className="relative group">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleRemovePart(part.id)}
                      className="absolute top-1 right-1 h-6 w-6 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <CardContent className="p-3 pt-4">
                      <h4 className="font-semibold text-sm mb-2">{part.name}</h4>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-muted p-2 rounded">
                          <span className="font-medium block text-muted-foreground mb-1">Nova:</span>
                          <span className="font-mono break-all">{part.newCode || '-'}</span>
                        </div>
                        <div className="bg-muted p-2 rounded">
                          <span className="font-medium block text-muted-foreground mb-1">Usada:</span>
                          <span className="font-mono break-all">{part.usedCode || '-'}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </CardContent>

          <CardFooter className="pt-4 pb-4 px-1 md:px-6 border-t mt-auto">
            <Button 
              onClick={handleCopyText} 
              className="w-full h-12 md:h-10 text-base md:text-sm font-bold" 
              disabled={parts.length === 0}
            >
              <Copy className="mr-2 h-5 w-5 md:h-4 md:w-4" /> Copiar Texto para Observações
            </Button>
          </CardFooter>
      </Card>
      <ScannerDialog 
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />
    </>
  );
}
