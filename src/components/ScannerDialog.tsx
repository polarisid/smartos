
"use client";

import { useEffect, useRef, useState } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Html5QrcodeScanner, Html5QrcodeError, Html5QrcodeResult, Html5Qrcode } from 'html5-qrcode';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw } from 'lucide-react';

export function ScannerDialog({ 
    isOpen, 
    onClose, 
    onScanSuccess 
}: { 
    isOpen: boolean, 
    onClose: () => void, 
    onScanSuccess: (decodedText: string) => void 
}) {
    const scannerId = "barcode-scanner-view";
    const scannerRef = useRef<Html5QrcodeScanner | null>(null);
    const { toast } = useToast();
    const [isPaused, setIsPaused] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            if (scannerRef.current) {
                // Ensure scanner is stopped and resources are released.
                try {
                    scannerRef.current.clear().catch(error => {
                        // This can throw an error if the scanner is already cleared or not running, so we can ignore it.
                    });
                } catch (e) {
                    // Ignore errors on cleanup
                } finally {
                     scannerRef.current = null;
                }
            }
            return;
        }

        // Reset pause state when dialog opens
        setIsPaused(false);

        const startScanner = async () => {
            // Dynamically import the library only on the client-side
            const { Html5QrcodeScanner } = await import('html5-qrcode');

            // Avoid re-initializing the scanner
            if (scannerRef.current) {
                return;
            }

            const scanner = new Html5QrcodeScanner(
                scannerId, 
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                    supportedScanTypes: [],
                }, 
                false // verbose
            );
            scannerRef.current = scanner;

            const handleSuccess = (decodedText: string, result: Html5QrcodeResult) => {
                const isValid = /^\d{10}$/.test(decodedText);

                if (!isValid) {
                    if (scannerRef.current) {
                        try {
                           (scannerRef.current as any).pause(true);
                           setIsPaused(true);
                        } catch (e) {
                            console.error("Failed to pause scanner", e);
                        }
                    }
                    toast({
                        variant: "destructive",
                        title: "Código Inválido",
                        description: "O código deve conter exatamente 10 dígitos numéricos.",
                    });
                    return; 
                }

                if (scannerRef.current) {
                    onScanSuccess(decodedText);
                     try {
                        scannerRef.current.clear();
                    } catch (e) {
                        // Ignore errors on cleanup
                    } finally {
                        scannerRef.current = null;
                    }
                }
            };

            const handleError = (errorMessage: string, error: Html5QrcodeError) => {
                // This will be called for non-fatal errors (e.g., QR code not found), we can ignore them.
            };
            
            const scannerElement = document.getElementById(scannerId);
            if (scannerElement && !scannerRef.current.isScanning) {
                scanner.render(handleSuccess, handleError);
            }
        };

        const timeoutId = setTimeout(startScanner, 100);

        return () => {
            clearTimeout(timeoutId);
            if (scannerRef.current) {
                 try {
                    // Check if scanner is in a clearable state before trying to clear
                    if (scannerRef.current.getState() === 2 /* SCANNING */) {
                       scannerRef.current.clear();
                    }
                 } catch (e) {
                     // console.error("Error clearing scanner on unmount:", e);
                 } finally {
                    scannerRef.current = null;
                 }
            }
        };
    }, [isOpen, onScanSuccess, toast]);
    
    const handleResumeScan = () => {
        if (scannerRef.current) {
            try {
                (scannerRef.current as any).resume();
                setIsPaused(false);
            } catch(e) {
                console.error("Failed to resume scanner", e);
            }
        }
    };


    return (
        <>
            <style jsx global>{`
                /* Hide the default UI elements from the html5-qrcode library */
                #${scannerId} > div > span > button {
                    display: none !important;
                }
                #html5-qrcode-anchor-scan-type-change,
                #${scannerId}__dashboard_section_csr > div > span:first-child {
                     display: none !important;
                }
                 #${scannerId}__dashboard_section_csr > div:first-child {
                     margin-bottom: 0px !important;
                 }
            `}</style>
            <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Ler Código de Barras</DialogTitle>
                        <DialogDescription>
                            Aponte a câmera para o código de barras ou QR code.
                        </DialogDescription>
                    </DialogHeader>
                    <div id={scannerId} className="w-full aspect-square[&>div]:border-none relative">
                        {isPaused && (
                            <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center z-10">
                                <Button onClick={handleResumeScan}>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Escanear Novamente
                                </Button>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
