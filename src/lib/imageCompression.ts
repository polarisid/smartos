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

// Copia a foto para a memória. Em celular Android o arquivo escolhido na câmera/galeria continua preso ao disco/app da câmera
// e pode ficar ilegível minutos depois (ao gerar o PDF ou subir pro servidor a leitura falha e a foto "some").
// Lendo agora, se não der pra ler o técnico fica sabendo na hora, e não depois de fechar o relatório.
async function detachInMemory(file: File): Promise<File> {
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength === 0) throw new Error("foto vazia");
  return new File([buffer], file.name, { type: file.type, lastModified: file.lastModified });
}

/** `unreadable`: a foto não pôde ser lida ou o navegador não consegue abri-la (ex.: HEIC no Android) - deve ser tirada de novo. */
export async function compressImageIfNeeded(file: File, maxSizeBytes: number = DEFAULT_MAX_BYTES): Promise<{ file: File; wasCompressed: boolean; unreadable?: boolean }> {
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
      return { file: await detachInMemory(file), wasCompressed: false };
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return { file: await detachInMemory(file), wasCompressed: false };
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    let quality = 0.9;
    let blob = await canvasToBlob(canvas, quality);
    while (blob && blob.size > maxSizeBytes && quality > 0.6) {
      quality -= 0.05;
      blob = await canvasToBlob(canvas, quality);
    }

    if (!blob || blob.size >= file.size) {
      return { file: await detachInMemory(file), wasCompressed: false };
    }

    const compressedName = file.name.replace(/\.\w+$/, "") + ".jpg";
    const compressedFile = new File([blob], compressedName, { type: "image/jpeg", lastModified: Date.now() });
    return { file: compressedFile, wasCompressed: true };
  } catch (e) {
    // Formato que o navegador não abre (HEIC) ou arquivo ilegível: a foto não apareceria no PDF nem no sistema.
    console.warn("Foto ilegível ou formato não suportado", e);
    return { file, wasCompressed: false, unreadable: true };
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
