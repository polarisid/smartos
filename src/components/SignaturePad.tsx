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

      const fit = () => {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const w = canvas.offsetWidth;
        const h = canvas.offsetHeight;
        if (!w || !h) return; // ainda não visível/medido
        const nextW = Math.round(w * ratio);
        const nextH = Math.round(h * ratio);
        if (canvas.width === nextW && canvas.height === nextH) return; // sem mudança real
        const previous = pad.isEmpty() ? null : pad.toDataURL();
        canvas.width = nextW;
        canvas.height = nextH;
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.scale(ratio, ratio);
        pad.clear();
        if (previous) pad.fromDataURL(previous);
      };

      const ro = new ResizeObserver(fit);
      ro.observe(canvas);
      return () => ro.disconnect();
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
