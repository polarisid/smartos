"use client";
import { PartScannerClipboard } from "@/components/PartScannerClipboard";

export default function ScannerPage() {
  return (
    <div className="w-full animate-in fade-in ease-out duration-300">
      <h2 className="text-2xl font-bold tracking-tight mb-6">Scanner de Peças</h2>
      <PartScannerClipboard />
    </div>
  );
}
