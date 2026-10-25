"use client";

// Isolado num componente à parte para o react-pdf (e o worker do pdf.js) só serem baixados
// quando a tela de edição do checklist realmente mostra um PDF (carregado via next/dynamic).
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfPagesViewerProps {
    file: string;
    numPages: number | null;
    onLoadSuccess: (info: { numPages: number }) => void;
    onLoadError: (error: Error) => void;
}

export function PdfPagesViewer({ file, numPages, onLoadSuccess, onLoadError }: PdfPagesViewerProps) {
    return (
        <Document
            file={file}
            onLoadSuccess={onLoadSuccess}
            onLoadError={onLoadError}
            loading="Carregando PDF..."
        >
            {Array.from(new Array(numPages), (el, index) => (
                <Page key={`page_${index + 1}`} pageNumber={index + 1} renderTextLayer={false} />
            ))}
        </Document>
    );
}
