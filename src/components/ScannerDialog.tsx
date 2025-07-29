
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
import { Html5QrcodeScanner, Html5QrcodeError, Html5QrcodeResult, Html5Qrcode } from 'html5-qrcode';

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

    useEffect(() => {
        if (isOpen && !scannerRef.current) {
            const scanner = new Html5QrcodeScanner(
                scannerId, 
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                    supportedScanTypes: [],
                }, 
                false
            );

            const handleSuccess = (decodedText: string, result: Html5QrcodeResult) => {
                onScanSuccess(decodedText);
            };

            const handleError = (errorMessage: string, error: Html5QrcodeError) => {
                // Silently ignore errors, they happen frequently when the camera is adjusting.
            };

            scanner.render(handleSuccess, handleError).catch(err => {
                console.error("Scanner render error", err);
            });
            scannerRef.current = scanner;
        }

        return () => {
            if (scannerRef.current && scannerRef.current.getState()) {
                 scannerRef.current.clear().catch(error => {
                    console.error("Failed to clear html5QrcodeScanner.", error);
                });
                scannerRef.current = null;
            }
        };
    }, [isOpen, onScanSuccess]);
    
    const handleClose = () => {
      if (scannerRef.current && scannerRef.current.getState()) {
        scannerRef.current.clear().catch(err => console.error(err));
        scannerRef.current = null;
      }
      onClose();
    }


    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Ler Código de Barras</DialogTitle>
                    <DialogDescription>
                        Aponte a câmera para o código de barras ou QR code.
                    </DialogDescription>
                </DialogHeader>
                {isOpen && <div id={scannerId} className="w-full"></div>}
                <DialogFooter>
                    <Button variant="outline" onClick={handleClose}>Cancelar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
