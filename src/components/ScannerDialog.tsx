
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
import type { Html5QrcodeScanner, Html5QrcodeError, Html5QrcodeResult, Html5QrcodeScanType } from 'html5-qrcode';

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
        if (!isOpen) {
            if (scannerRef.current) {
                scannerRef.current.clear().catch(error => {
                    console.error("Failed to clear scanner on close.", error);
                });
                scannerRef.current = null;
            }
            return;
        }

        const startScanner = async () => {
            const { Html5QrcodeScanner } = await import('html5-qrcode');

            if (scannerRef.current) {
                return;
            }

            const scanner = new Html5QrcodeScanner(
                scannerId, 
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                    // Let the library decide the scan type
                    supportedScanTypes: [], 
                }, 
                false
            );

            const handleSuccess = (decodedText: string, result: Html5QrcodeResult) => {
                if (scannerRef.current) {
                    onScanSuccess(decodedText);
                    scannerRef.current.clear();
                    scannerRef.current = null;
                }
            };

            const handleError = (errorMessage: string, error: Html5QrcodeError) => {
                // This will be called for non-fatal errors, we can ignore them.
            };
            
            const scannerElement = document.getElementById(scannerId);
            if (scannerElement) {
                // The render method doesn't always return a promise, so we should not chain .catch
                scanner.render(handleSuccess, handleError);
                scannerRef.current = scanner;
            }
        };

        // Delay starting the scanner slightly to ensure the dialog is fully rendered
        const timeoutId = setTimeout(startScanner, 100);

        return () => {
            clearTimeout(timeoutId);
            if (scannerRef.current) {
                 try {
                    // Check if scanner is in a clearable state
                    if (scannerRef.current.getState() !== 2 /* SCANNING */) {
                       // Do not clear if not scanning, to avoid errors
                    } else {
                        scannerRef.current.clear();
                    }
                 } catch (e) {
                     // console.error("Error clearing scanner on unmount:", e);
                 } finally {
                    scannerRef.current = null;
                 }
            }
        };
    }, [isOpen, onScanSuccess]);

    return (
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
    );
}
