
"use client";

import { useEffect } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Html5QrcodeScanner, Html5QrcodeError, Html5QrcodeResult } from 'html5-qrcode';

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

    useEffect(() => {
        if (isOpen) {
            const scanner = new Html5QrcodeScanner(scannerId, {
                fps: 10,
                qrbox: { width: 250, height: 250 },
                supportedScanTypes: [], // To support all scan types
            }, /* verbose= */ false);

            const handleSuccess = (decodedText: string, result: Html5QrcodeResult) => {
                scanner.clear();
                onScanSuccess(decodedText);
            };

            const handleError = (errorMessage: string, error: Html5QrcodeError) => {
                // console.error(`QR Code parsing error: ${errorMessage}`);
            };

            scanner.render(handleSuccess, handleError).catch(err => {
                console.error("Scanner render error", err);
            });

            return () => {
                // Cleanup function to clear the scanner
                if (document.getElementById(scannerId)?.innerHTML) {
                     scanner.clear().catch(error => {
                        console.error("Failed to clear html5QrcodeScanner.", error);
                    });
                }
            };
        }
    }, [isOpen, onScanSuccess]);

    if (!isOpen) {
        return null;
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Ler Código de Barras</DialogTitle>
                    <DialogDescription>
                        Aponte a câmera para o código de barras ou QR code.
                    </DialogDescription>
                </DialogHeader>
                <div id={scannerId} className="w-full"></div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
