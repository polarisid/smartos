"use client";

import SignatureCanvas from "react-signature-canvas";
import { forwardRef, useEffect, useRef } from "react";

/*
  SignaturePad — wrapper em volta do react-signature-canvas que corrige os dois
  bugs de assinatura no celular:

  1. touch-action: none no canvas — sem isso o toque rola/dá zoom na página em
     vez de desenhar (o "pulo" que às vezes leva o foco a outro campo e abre o
     teclado).
  2. Resolução do canvas x tamanho exibido — o canvas nasce 300x150 mas é
     esticado por CSS (w-full h-40); isso faz o traço sair deslocado. Um
     ResizeObserver ajusta o buffer do canvas ao tamanho real (com devicePixelRatio),
     preservando o desenho quando dá, e o realinha quando o layout muda
     (ex.: teclado abre/fecha, rotação).

  Encaminha o ref para a instância do SignatureCanvas, então quem usa continua
  chamando .clear() / .isEmpty() / .toDataURL() normalmente.
*/

type SignaturePadProps = {
  penColor?: string;
  onEnd?: () => void;
  canvasClassName?: string;
};

export const SignaturePad = forwardRef<SignatureCanvas, SignaturePadProps>(
  function SignaturePad({ penColor = "black", onEnd, canvasClassName = "w-full h-40" }, ref) {
    const innerRef = useRef<SignatureCanvas | null>(null);

    const setRefs = (inst: SignatureCanvas | null) => {
      innerRef.current = inst;
      if (typeof ref === "function") ref(inst);
      else if (ref) (ref as React.MutableRefObject<SignatureCanvas | null>).current = inst;
    };

    useEffect(() => {
      const pad = innerRef.current;
      if (!pad) return;
      const canvas = pad.getCanvas();

      const fit = async () => {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const w = canvas.offsetWidth;
        const h = canvas.offsetHeight;
        if (!w || !h) return; // ainda não visível/medido (ex.: teclado cobrindo, layout em transição)
        const nextW = Math.round(w * ratio);
        const nextH = Math.round(h * ratio);
        if (canvas.width === nextW && canvas.height === nextH) return; // sem mudança real
        const previous = pad.isEmpty() ? null : pad.toDataURL();
        canvas.width = nextW;
        canvas.height = nextH;
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.scale(ratio, ratio);
        pad.clear();
        if (previous) {
          // pad.fromDataURL() é assíncrono por baixo dos panos (carrega uma <img>,
          // só desenha no onload) mas já marca isEmpty=false na hora. Se outro
          // resize chegasse antes desse desenho terminar, ele capturava o canvas
          // ainda em branco (só que "marcado" como preenchido) e propagava o
          // branco adiante - é assim que o traço sumia durante scroll/rotação.
          // Desenhamos nós mesmos e SÓ seguimos depois que o onload disparar,
          // garantindo que o pixel já está lá antes de liberar o próximo resize.
          await new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => {
              if (ctx) ctx.drawImage(img, 0, 0, w, h);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = previous;
          });
          pad.fromDataURL(previous); // mantém o estado interno (isEmpty etc.) do signature_pad consistente
        }
      };

      // Debounce: no celular, abrir/fechar teclado, tocar fora do campo ou até
      // rolar a página (a barra de endereço recolhendo muda a altura visível)
      // dispara vários eventos de resize em sequência durante a animação - sem
      // esperar estabilizar, cada disparo intermediário podia capturar o canvas
      // num tamanho transitório. Só refaz o fit quando o tamanho parar de mudar.
      let timeout: ReturnType<typeof setTimeout> | null = null;
      // Serializa as chamadas de fit(): cada uma só começa depois que a anterior
      // (incluindo o redesenho assíncrono acima) terminar de verdade - sem isso,
      // dois resizes espaçados por mais que o debounce (comum durante um scroll
      // mais longo) ainda conseguiam se sobrepor.
      let queue: Promise<void> = Promise.resolve();
      const debouncedFit = () => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
          queue = queue.then(fit);
        }, 150);
      };

      const ro = new ResizeObserver(debouncedFit);
      ro.observe(canvas);
      return () => {
        ro.disconnect();
        if (timeout) clearTimeout(timeout);
      };
    }, []);

    return (
      <SignatureCanvas
        ref={setRefs}
        penColor={penColor}
        onEnd={onEnd}
        canvasProps={{ className: `signature-canvas ${canvasClassName}`, style: { touchAction: "none" } }}
      />
    );
  }
);
