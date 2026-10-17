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
import type { Html5Qrcode } from 'html5-qrcode';
import { Flashlight, FlashlightOff, Loader2, CameraOff } from 'lucide-react';

// "tracking": etiquetas de rastreio de peças (Code 128/39, QR, Data Matrix...) - menos formatos = leitura mais rápida.
// "default": qualquer código comum (números de série, checklists etc.).
export type ScannerMode = 'tracking' | 'default';

const TRACKING_FORMATS = ['CODE_128', 'CODE_39', 'QR_CODE', 'DATA_MATRIX', 'ITF', 'EAN_13'] as const;
const DEFAULT_FORMATS = ['QR_CODE', 'CODE_128', 'CODE_39', 'CODE_93', 'EAN_13', 'EAN_8', 'UPC_A', 'UPC_E', 'ITF', 'CODABAR', 'DATA_MATRIX'] as const;

// Confirma a leitura só quando o mesmo código aparece em 2 quadros seguidos: evita "fantasmas" de leitura torta.
const CONFIRMATIONS = 2;

function feedback() {
  try { navigator.vibrate?.(80); } catch { /* sem vibração */ }
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1100;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => { void ctx.close(); };
  } catch { /* sem áudio */ }
}

export function ScannerDialog({
    isOpen,
    onClose,
    onScanSuccess,
    mode = 'default',
}: {
    isOpen: boolean,
    onClose: () => void,
    onScanSuccess: (decodedText: string) => void,
    mode?: ScannerMode,
}) {
    const scannerId = "barcode-scanner-view";
    const scannerRef = useRef<Html5Qrcode | null>(null);
    // Callback em ref: se a tela pai renderizar de novo, a câmera NÃO reinicia (antes reiniciava e perdia a leitura).
    const onSuccessRef = useRef(onScanSuccess);
    useEffect(() => { onSuccessRef.current = onScanSuccess; }, [onScanSuccess]);

    const [starting, setStarting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [torchSupported, setTorchSupported] = useState(false);
    const [torchOn, setTorchOn] = useState(false);
    const [zoom, setZoom] = useState<{ min: number; max: number; step: number; value: number } | null>(null);

    useEffect(() => {
        if (!isOpen) return;

        let cancelled = false;
        let handled = false;
        let lastText = "";
        let streak = 0;
        let scanner: Html5Qrcode | null = null;

        setError(null);
        setStarting(true);
        setTorchSupported(false);
        setTorchOn(false);
        setZoom(null);

        const stopScanner = async (s: Html5Qrcode | null) => {
            if (!s) return;
            try { if (s.isScanning) await s.stop(); } catch { /* já parado */ }
            try { s.clear(); } catch { /* já limpo */ }
        };

        const start = async () => {
            try {
                const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
                // O diálogo monta o contêiner um instante depois de abrir.
                for (let i = 0; i < 20 && !document.getElementById(scannerId); i++) await new Promise(r => setTimeout(r, 50));
                if (cancelled || !document.getElementById(scannerId)) return;

                const names = mode === 'tracking' ? TRACKING_FORMATS : DEFAULT_FORMATS;
                const formats = names.map(n => (Html5QrcodeSupportedFormats as any)[n]).filter((f: unknown) => f !== undefined) as number[];

                scanner = new Html5Qrcode(scannerId, {
                    verbose: false,
                    formatsToSupport: formats as any,
                    // Leitor nativo do navegador (Chrome/Android) quando existe: bem mais rápido e preciso que o decodificador em JS.
                    useBarCodeDetectorIfSupported: true,
                });
                scannerRef.current = scanner;

                await scanner.start(
                    { facingMode: 'environment' },
                    {
                        fps: 20,
                        // Faixa larga: código de barras de rastreio é comprido e fino (um quadrado cortava as pontas).
                        qrbox: (w: number, h: number) => {
                            const boxW = Math.max(120, Math.floor(w * 0.92));
                            const boxH = Math.max(120, Math.floor(Math.min(h * 0.7, boxW * 0.55)));
                            return { width: boxW, height: boxH };
                        },
                        disableFlip: true,
                        videoConstraints: {
                            facingMode: 'environment',
                            width: { ideal: 1920 },
                            height: { ideal: 1080 },
                            // @ts-expect-error focusMode ainda não está nos tipos do TS, mas Chrome/Android aceita
                            advanced: [{ focusMode: 'continuous' }],
                        },
                    },
                    (decodedText) => {
                        if (handled) return;
                        const text = decodedText.replace(/\s+/g, '').trim();
                        if (!text) return;
                        streak = text === lastText ? streak + 1 : 1;
                        lastText = text;
                        if (streak < CONFIRMATIONS) return;
                        handled = true;
                        feedback();
                        // Para a câmera antes de avisar a tela: ela pode fechar o diálogo na mesma hora.
                        void stopScanner(scannerRef.current).finally(() => {
                            scannerRef.current = null;
                            onSuccessRef.current(text);
                        });
                    },
                    () => { /* quadro sem código: normal */ }
                );

                if (cancelled) { await stopScanner(scanner); return; }

                try {
                    const caps = scanner.getRunningTrackCameraCapabilities();
                    setTorchSupported(!!caps.torchFeature().isSupported());
                    const z = caps.zoomFeature();
                    if (z.isSupported()) {
                        const min = z.min(), max = z.max();
                        // Já começa com um pouco de zoom: etiqueta pequena fica legível sem aproximar demais o celular.
                        const initial = Math.min(max, Math.max(min, min + (max - min) * 0.2));
                        await z.apply(initial).catch(() => { /* sem zoom */ });
                        setZoom({ min, max, step: z.step() || 0.1, value: initial });
                    }
                } catch { /* recursos opcionais */ }
            } catch (e: any) {
                if (cancelled) return;
                const msg = String(e?.message || e || '');
                if (/permission|denied|notallowed/i.test(msg)) setError("A câmera está bloqueada. Permita o acesso à câmera nas configurações do navegador e abra de novo.");
                else if (/notfound|no camera|requested device/i.test(msg)) setError("Nenhuma câmera encontrada neste aparelho. Digite o código à mão.");
                else setError("Não foi possível abrir a câmera. Feche outros apps que a usam e tente de novo, ou digite o código à mão.");
            } finally {
                if (!cancelled) setStarting(false);
            }
        };

        void start();

        return () => {
            cancelled = true;
            const s = scannerRef.current ?? scanner;
            scannerRef.current = null;
            void stopScanner(s);
        };
    }, [isOpen, mode]);

    const toggleTorch = async () => {
        try {
            const t = scannerRef.current?.getRunningTrackCameraCapabilities().torchFeature();
            if (!t) return;
            await t.apply(!torchOn);
            setTorchOn(v => !v);
        } catch { /* lanterna indisponível */ }
    };

    const changeZoom = async (value: number) => {
        try {
            await scannerRef.current?.getRunningTrackCameraCapabilities().zoomFeature().apply(value);
            setZoom(z => (z ? { ...z, value } : z));
        } catch { /* zoom indisponível */ }
    };

    return (
        <>
            <style jsx global>{`
                #${scannerId} video { width: 100% !important; border-radius: 0.5rem; }
                #${scannerId} { min-height: 220px; }
            `}</style>
            <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Ler Código de Barras</DialogTitle>
                        <DialogDescription>
                            Deixe o código dentro da faixa, na horizontal e bem iluminado. A leitura é automática.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="relative">
                        <div id={scannerId} className="w-full overflow-hidden rounded-lg bg-black/90" />
                        {starting && !error && (
                            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white">
                                <Loader2 className="h-4 w-4 animate-spin" /> Abrindo a câmera…
                            </div>
                        )}
                        {error && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-white">
                                <CameraOff className="h-6 w-6" />
                                {error}
                            </div>
                        )}
                    </div>

                    {(torchSupported || zoom) && (
                        <div className="flex items-center gap-3">
                            {torchSupported && (
                                <Button type="button" variant={torchOn ? "default" : "outline"} size="sm" onClick={toggleTorch}>
                                    {torchOn ? <FlashlightOff className="h-4 w-4 mr-1.5" /> : <Flashlight className="h-4 w-4 mr-1.5" />}
                                    Lanterna
                                </Button>
                            )}
                            {zoom && (
                                <label className="flex flex-1 items-center gap-2 text-xs text-muted-foreground">
                                    Zoom
                                    <input
                                        type="range"
                                        className="flex-1"
                                        min={zoom.min}
                                        max={zoom.max}
                                        step={zoom.step}
                                        value={zoom.value}
                                        onChange={(e) => void changeZoom(Number(e.target.value))}
                                    />
                                </label>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
