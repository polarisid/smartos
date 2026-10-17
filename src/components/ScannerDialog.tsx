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
import { Flashlight, FlashlightOff, Loader2, CameraOff, Camera } from 'lucide-react';

// "tracking": etiquetas de rastreio de peças (Code 128/39, QR, Data Matrix...) - menos formatos = leitura mais rápida.
// "default": qualquer código comum (números de série, checklists etc.).
export type ScannerMode = 'tracking' | 'default';

const TRACKING_FORMATS = ['CODE_128', 'CODE_39', 'QR_CODE', 'DATA_MATRIX', 'ITF', 'EAN_13'] as const;
const DEFAULT_FORMATS = ['QR_CODE', 'CODE_128', 'CODE_39', 'CODE_93', 'EAN_13', 'EAN_8', 'UPC_A', 'UPC_E', 'ITF', 'CODABAR', 'DATA_MATRIX'] as const;

// Confirma a leitura só quando o mesmo código aparece em 2 quadros seguidos: evita "fantasmas" de leitura torta.
const CONFIRMATIONS = 2;

const CAMERA_KEY = "smartos_scanner_camera";
type CameraOption = { id: string; label: string };

function savedCamera(): string | null {
  try { return localStorage.getItem(CAMERA_KEY); } catch { return null; }
}
function saveCamera(id: string | null) {
  try { if (id) localStorage.setItem(CAMERA_KEY, id); else localStorage.removeItem(CAMERA_KEY); } catch { /* sem armazenamento */ }
}

// O navegador devolve nomes como "camera2 0, facing back": traduz para algo que o técnico entende.
function friendlyCameras(list: Array<{ id: string; label: string }>): CameraOption[] {
  const kind = (l: string) => (/front|user|frontal|selfie/i.test(l) ? 'Frontal' : 'Traseira');
  const counters: Record<string, number> = {};
  const totals: Record<string, number> = {};
  list.forEach(c => { const k = kind(c.label); totals[k] = (totals[k] || 0) + 1; });
  return list.map(c => {
    const k = kind(c.label);
    counters[k] = (counters[k] || 0) + 1;
    return { id: c.id, label: totals[k] > 1 ? k + ' ' + counters[k] : k };
  });
}

// Texto de ajuda quando a lanterna não acende, com o que o aparelho informou (ajuda a entender o motivo).
function explainTorchFailure(scanner: Html5Qrcode | null, motivo: string): string {
  let caps = 'não informado';
  try {
    const c = (scanner as any)?.getRunningTrackCapabilities?.() as any;
    if (c) caps = c.torch ? 'o aparelho informa lanterna' : 'o aparelho NÃO informa lanterna para esta câmera';
  } catch { /* ok */ }
  return 'A lanterna não acendeu (' + motivo + '; ' + caps + '). O navegador não tem uma permissão separada para isso: ela vem junto com a da câmera, e neste celular ele não libera o controle da lanterna. Acenda pela lanterna do próprio celular (painel rápido, puxando de cima) ou aproxime de uma luz.';
}

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
    const [torchMsg, setTorchMsg] = useState<string | null>(null);
    // Lanterna e zoom vão juntos para a câmera: cada novo applyConstraints SUBSTITUI o anterior, então mexer no
    // zoom apagava a lanterna (e vice-versa). Aqui guardamos o conjunto e reenviamos tudo.
    const advRef = useRef<{ torch?: boolean; zoom?: number }>({});
    const torchWantedRef = useRef(false);
    const [restartKey, setRestartKey] = useState(0);
    const [cameraRunning, setCameraRunning] = useState(false);
    const [zoom, setZoom] = useState<{ min: number; max: number; step: number; value: number } | null>(null);
    const [cameras, setCameras] = useState<CameraOption[]>([]);
    const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
    const [activeInfo, setActiveInfo] = useState<string>("");
    // Câmera escolhida pelo técnico (lembrada neste aparelho); null = traseira padrão do aparelho.
    const [chosenCamera, setChosenCamera] = useState<string | null>(null);
    useEffect(() => { if (isOpen) setChosenCamera(savedCamera()); }, [isOpen]);
    // Ao trocar de câmera, espera a anterior desligar antes de ligar a nova.
    const teardownRef = useRef<Promise<void>>(Promise.resolve());
    const [ready, setReady] = useState(false);
    useEffect(() => { if (isOpen) setReady(true); else setReady(false); }, [isOpen]);

    useEffect(() => {
        if (!isOpen || !ready) return;

        let cancelled = false;
        let handled = false;
        let lastText = "";
        let streak = 0;
        let scanner: Html5Qrcode | null = null;

        setError(null);
        setStarting(true);
        setTorchSupported(false);
        if (!torchWantedRef.current) setTorchMsg(null);
        setCameraRunning(false);
        advRef.current = torchWantedRef.current ? { torch: true } : {};
        setTorchOn(false);
        setZoom(null);
        setCameras([]);
        setActiveCameraId(null);
        setActiveInfo("");

        const stopScanner = async (s: Html5Qrcode | null) => {
            if (!s) return;
            try { if (s.isScanning) await s.stop(); } catch { /* já parado */ }
            try { s.clear(); } catch { /* já limpo */ }
        };

        const start = async () => {
            try {
                await teardownRef.current;
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

                const buildConstraints = (deviceId: string | null): MediaTrackConstraints => ({
                    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' }),
                    width: { ideal: 1920 },
                    height: { ideal: 1440 },
                    advanced: [{ focusMode: 'continuous' }, ...(torchWantedRef.current ? [{ torch: true }] : [])] as any,
                });
                const config = {
                        fps: 20,
                        // Faixa larga: código de barras de rastreio é comprido e fino (um quadrado cortava as pontas).
                        qrbox: (w: number, h: number) => {
                            const boxW = Math.max(120, Math.floor(w * 0.92));
                            const boxH = Math.max(120, Math.floor(Math.min(h * 0.7, boxW * 0.55)));
                            return { width: boxW, height: boxH };
                        },
                        disableFlip: true,
                };
                const onDecoded = (decodedText: string) => {
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
                };
                const onFrameError = () => { /* quadro sem código: normal */ };

                try {
                    await scanner.start(chosenCamera ? { deviceId: { exact: chosenCamera } } as any : { facingMode: 'environment' }, { ...config, videoConstraints: buildConstraints(chosenCamera) }, onDecoded, onFrameError);
                } catch (e) {
                    // Câmera lembrada não existe mais (outro aparelho, permissão): volta para a traseira padrão.
                    if (!chosenCamera) throw e;
                    saveCamera(null);
                    try { await stopScanner(scanner); } catch { /* ok */ }
                    scanner = new Html5Qrcode(scannerId, { verbose: false, formatsToSupport: formats as any, useBarCodeDetectorIfSupported: true });
                    scannerRef.current = scanner;
                    await scanner.start({ facingMode: 'environment' }, { ...config, videoConstraints: buildConstraints(null) }, onDecoded, onFrameError);
                }

                if (cancelled) { await stopScanner(scanner); return; }

                try {
                    const settings = scanner.getRunningTrackSettings();
                    setActiveCameraId(settings.deviceId || null);
                    setActiveInfo(settings.width && settings.height ? settings.width + '×' + settings.height : '');
                    const list = await Html5Qrcode.getCameras();
                    if (!cancelled) setCameras(friendlyCameras(list));
                } catch { /* sem lista de câmeras: continua só com a padrão */ }

                if (torchWantedRef.current) {
                    const st = scanner.getRunningTrackSettings() as any;
                    const on = !!st.torch;
                    setTorchOn(on);
                    if (!on) {
                        torchWantedRef.current = false;
                        advRef.current = { ...advRef.current, torch: undefined };
                        setTorchMsg(explainTorchFailure(scanner, 'a câmera reaberta ignorou o pedido'));
                    }
                }

                try {
                    const caps = scanner.getRunningTrackCameraCapabilities();
                    setTorchSupported(!!caps.torchFeature().isSupported());
                    setCameraRunning(true);
                    const z = caps.zoomFeature();
                    if (z.isSupported()) {
                        const min = z.min(), max = z.max();
                        // Já começa com um pouco de zoom: etiqueta pequena fica legível sem aproximar demais o celular.
                        const initial = Math.min(max, Math.max(min, min + (max - min) * 0.2));
                        advRef.current = { ...advRef.current, zoom: initial };
                        await applyAdvanced().catch(() => { /* sem zoom */ });
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
            teardownRef.current = stopScanner(s);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, ready, mode, chosenCamera, restartKey]);

    // Trilha de vídeo da câmera em uso (para lanterna e zoom).
    const getTrack = (): MediaStreamTrack | null => {
        const video = document.querySelector('#' + scannerId + ' video') as HTMLVideoElement | null;
        const stream = video?.srcObject as MediaStream | null | undefined;
        return stream?.getVideoTracks?.()[0] ?? null;
    };

    // Reenvia lanterna + zoom juntos, cada um como pedido independente (se um não existir, o outro continua valendo).
    const applyAdvanced = async () => {
        const track = getTrack();
        if (!track) throw new Error('sem câmera ativa');
        const advanced: any[] = [];
        if (advRef.current.zoom !== undefined) advanced.push({ zoom: advRef.current.zoom });
        if (advRef.current.torch !== undefined) advanced.push({ torch: advRef.current.torch });
        await track.applyConstraints({ advanced } as any);
    };

    // Não existe permissão separada para a lanterna: ela vem junto com a da câmera. Se o navegador do aparelho
    // não deixa o site controlar a lanterna, o app tenta (1) o comando direto, (2) reabrir a câmera já pedindo
    // a lanterna e só então avisa o que fazer.
    const toggleTorch = async () => {
        setTorchMsg(null);
        const next = !torchOn;
        try {
            advRef.current = { ...advRef.current, torch: next };
            await applyAdvanced();
            const st = (getTrack()?.getSettings() as any) || {};
            const caps = (getTrack()?.getCapabilities?.() as any) || {};
            // Só confirma quando o aparelho informa o estado da lanterna (ou diz que tem lanterna).
            if (st.torch === next || (st.torch === undefined && caps.torch)) {
                setTorchOn(next);
                return;
            }
            throw new Error('lanterna não confirmada');
        } catch {
            if (next) {
                // 2ª tentativa: reabre a câmera pedindo a lanterna na própria abertura.
                torchWantedRef.current = true;
                setTorchOn(true);
                setRestartKey(k => k + 1);
            } else {
                torchWantedRef.current = false;
                setTorchOn(false);
                advRef.current = { ...advRef.current, torch: undefined };
                setRestartKey(k => k + 1);
            }
        }
    };

    const changeZoom = async (value: number) => {
        try {
            advRef.current = { ...advRef.current, zoom: value };
            await applyAdvanced();
            setZoom(z => (z ? { ...z, value } : z));
        } catch { /* zoom indisponível */ }
    };

    return (
        <>
            <style jsx global>{`
                /* A imagem ocupa a largura do quadro (o retângulo de leitura é desenhado sobre ela) e é pedida em 4:3 para não ficar alta demais. */
                #${scannerId} video { width: 100% !important; height: auto !important; display: block; }
                #${scannerId} { min-height: 160px; }
            `}</style>
            <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
                <DialogContent className="max-h-[100dvh] w-[calc(100vw-1rem)] max-w-lg gap-3 overflow-y-auto p-4 sm:p-6">
                    <DialogHeader>
                        <DialogTitle>Ler Código de Barras</DialogTitle>
                        <DialogDescription className="hidden sm:block">
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

                    {!error && (cameras.length > 0 || activeInfo) && (
                        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs">
                            <Camera className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="font-medium">Câmera em uso:</span>
                            {cameras.length > 1 ? (
                                <select
                                    className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-xs"
                                    value={activeCameraId || ''}
                                    onChange={(e) => { saveCamera(e.target.value); setChosenCamera(e.target.value); }}
                                >
                                    {cameras.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                </select>
                            ) : (
                                <span>{cameras[0]?.label || 'Traseira'}</span>
                            )}
                            {activeInfo && <span className="text-muted-foreground">{activeInfo}</span>}
                            {cameras.length > 1 && <span className="basis-full text-muted-foreground">Imagem borrada ou muito aberta? Troque de câmera: algumas são grande-angular.</span>}
                        </div>
                    )}

                    {(cameraRunning || zoom) && (
                        <div className="flex items-center gap-3">
                            {cameraRunning && (
                                <Button type="button" variant={torchOn ? "default" : "outline"} size="sm" onClick={toggleTorch} title={torchSupported ? "Liga/desliga a lanterna" : "Tenta acender a lanterna"}>
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

                    {torchMsg && <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">{torchMsg}</p>}

                    <DialogFooter>
                        <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
