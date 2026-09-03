// Compressão leve de fotos grandes antes do upload do Relatório Fotográfico.
// Mantém a resolução original e só reduz a qualidade JPEG em passos, até
// caber no limite (ou até um piso de qualidade razoável) - evita que uma
// foto de celular moderno (às vezes 15-20MB) trave o upload em campo.

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10MB

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function compressImageIfNeeded(file: File, maxSizeBytes: number = DEFAULT_MAX_BYTES): Promise<{ file: File; wasCompressed: boolean }> {
  if (!file.type.startsWith("image/") || file.size <= maxSizeBytes) {
    return { file, wasCompressed: false };
  }

  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = dataUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { file, wasCompressed: false };
    ctx.drawImage(img, 0, 0);

    let quality = 0.85;
    let blob = await canvasToBlob(canvas, quality);
    while (blob && blob.size > maxSizeBytes && quality > 0.5) {
      quality -= 0.1;
      blob = await canvasToBlob(canvas, quality);
    }

    if (!blob || blob.size >= file.size) {
      return { file, wasCompressed: false };
    }

    const compressedName = file.name.replace(/\.\w+$/, "") + ".jpg";
    const compressedFile = new File([blob], compressedName, { type: "image/jpeg", lastModified: Date.now() });
    return { file: compressedFile, wasCompressed: true };
  } catch (e) {
    console.warn("Falha ao comprimir imagem, enviando original", e);
    return { file, wasCompressed: false };
  }
}
