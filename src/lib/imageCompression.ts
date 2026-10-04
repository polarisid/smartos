// Otimização das fotos do Relatório Fotográfico antes do upload.
// Fotos de celular moderno chegam a 5-36MB; um relatório com 10+ fotos
// passava de 50MB e travava/demorava no sinal de campo. Os limites abaixo foram
// escolhidos pra quase não perder detalhe (etiquetas de serial, marcações de
// peça, zoom no admin): uma foto típica de 12MP (4000x3000) mantém ~59% dos
// pixels, e a maioria (mediana ~2,2MB) nem é mexida - só o peso extra das
// fotos muito grandes é cortado.

const DEFAULT_MAX_BYTES = 3 * 1024 * 1024; // 3MB por foto
const MAX_DIMENSION = 3072;

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function compressImageIfNeeded(file: File, maxSizeBytes: number = DEFAULT_MAX_BYTES): Promise<{ file: File; wasCompressed: boolean }> {
  if (!file.type.startsWith("image/")) {
    return { file, wasCompressed: false };
  }

  let objectUrl: string | null = null;
  try {
    objectUrl = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = objectUrl!;
    });

    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = Math.min(1, MAX_DIMENSION / longest);
    if (scale === 1 && file.size <= maxSizeBytes) {
      return { file, wasCompressed: false };
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return { file, wasCompressed: false };
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    let quality = 0.9;
    let blob = await canvasToBlob(canvas, quality);
    while (blob && blob.size > maxSizeBytes && quality > 0.6) {
      quality -= 0.05;
      blob = await canvasToBlob(canvas, quality);
    }

    if (!blob || blob.size >= file.size) {
      return { file, wasCompressed: false };
    }

    const compressedName = file.name.replace(/\.\w+$/, "") + ".jpg";
    const compressedFile = new File([blob], compressedName, { type: "image/jpeg", lastModified: Date.now() });
    return { file: compressedFile, wasCompressed: true };
  } catch (e) {
    // Ex.: formato que o navegador não decodifica (HEIC) - segue com o original.
    console.warn("Falha ao comprimir imagem, enviando original", e);
    return { file, wasCompressed: false };
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
