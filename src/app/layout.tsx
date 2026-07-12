import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "@/context/AuthContext";
import { QueryProvider } from "@/providers/QueryProvider";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://smartos.vercel.app";

export const viewport: Viewport = {
  themeColor: "#1a73e8",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "SmartOS — Gestão de Ordens de Serviço",
    template: "%s | SmartOS",
  },
  description:
    "Plataforma inteligente de gestão de ordens de serviço para assistências técnicas autorizadas Samsung. Controle de rotas, técnicos, peças e desempenho em tempo real.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    apple: "/apple-icon.svg",
  },
  applicationName: "SmartOS",
  keywords: [
    "ordem de serviço",
    "assistência técnica",
    "Samsung",
    "gestão de rotas",
    "técnico de campo",
    "OS",
    "service order",
  ],
  authors: [{ name: "Polaris ID" }],
  creator: "Polaris ID",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: siteUrl,
    siteName: "SmartOS",
    title: "SmartOS — Gestão de Ordens de Serviço",
    description:
      "Plataforma inteligente de gestão de ordens de serviço para assistências técnicas autorizadas Samsung.",
    images: [
      {
        url: `${siteUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "SmartOS — Gestão Inteligente de Ordens de Serviço",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SmartOS — Gestão de Ordens de Serviço",
    description:
      "Plataforma inteligente de gestão de ordens de serviço para assistências técnicas autorizadas Samsung.",
    images: [`${siteUrl}/og-image.png`],
  },
  robots: {
    index: true,
    follow: true,
  },
  appleWebApp: {
    capable: true,
    title: "SmartOS",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head />

      <body className={`${inter.variable} font-body antialiased`}>
        <QueryProvider>
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
