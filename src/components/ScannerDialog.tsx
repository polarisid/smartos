
"use client";

import { useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Html5QrcodeScanner, Html5QrcodeError, Html5QrcodeResult } from 'html5-qrcode';
import { useToast } from '@/hooks/use-toast';

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

    useEffect(() => {
        if (!isOpen) {
            if (scannerRef.current) {
                scannerRef.current.clear().catch(error => {
                    // This can throw an error if the scanner is already cleared or not running, so we can ignore it.
                });
                scannerRef.current = null;
            }
            return;
        }

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
                // Validation: check if it's 10 digits and numbers only
                const isValid = /^\d{10}$/.test(decodedText);

                if (!isValid) {
                    toast({
                        variant: "destructive",
                        title: "Código Inválido",
                        description: "O código deve conter exatamente 10 dígitos numéricos.",
                    });
                    return; // Keep scanner running
                }

                if (scannerRef.current) {
                    onScanSuccess(decodedText);
                    scannerRef.current.clear();
                    scannerRef.current = null;
                }
            };

            const handleError = (errorMessage: string, error: Html5QrcodeError) => {
                // This will be called for non-fatal errors (e.g., QR code not found), we can ignore them.
            };
            
            const scannerElement = document.getElementById(scannerId);
            if (scannerElement) {
                scanner.render(handleSuccess, handleError);
            }
        };

        const timeoutId = setTimeout(startScanner, 100);

        return () => {
            clearTimeout(timeoutId);
            if (scannerRef.current) {
                 try {
                    // Check if scanner is in a clearable state before trying to clear
                    if (scannerRef.current && scannerRef.current.getState() === 2 /* SCANNING */) {
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
                    <div id={scannerId} className="w-full aspect-square[&>div]:border-none"></div>
                    <DialogFooter>
                        <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

