"use client";

import { useState, useEffect } from "react";
import Link from 'next/link';
import { Button } from "@/components/ui/button";
import { Wrench, LogIn, Download } from "lucide-react";

export function Header() {
    const [installPromptEvent, setInstallPromptEvent] = useState<any>(null);

    useEffect(() => {
        const handleBeforeInstallPrompt = (event: Event) => {
            event.preventDefault();
            setInstallPromptEvent(event);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        };
    }, []);

    const handleInstallClick = () => {
        if (!installPromptEvent) {
            return;
        }
        installPromptEvent.prompt();
        installPromptEvent.userChoice.then((choiceResult: { outcome: string }) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted the install prompt');
            } else {
                console.log('User dismissed the install prompt');
            }
            setInstallPromptEvent(null);
        });
    };
    
    return (
        <header className="glass border-b p-3 md:p-4 flex justify-between items-center sticky top-0 z-40">
            <Link href="/" className="flex items-center gap-2 md:gap-3 text-primary">
                <Wrench className="w-5 h-5 md:w-6 md:h-6" />
                <h1 className="text-lg md:text-xl font-bold text-foreground tracking-tight">SmartService OS</h1>
            </Link>
            <div className="flex items-center gap-2">
                 {installPromptEvent && (
                    <Button onClick={handleInstallClick} size="sm" className="relative">
                        <Download className="mr-0 sm:mr-2 h-4 w-4" />
                        <span className="hidden sm:inline">Instalar App</span>
                    </Button>
                )}
                <Button asChild variant="outline" size="sm">
                    <Link href="/admin/login">
                        <LogIn className="mr-0 sm:mr-2 h-4 w-4" />
                        <span className="hidden sm:inline">Área Admin</span>
                    </Link>
                </Button>
            </div>
        </header>
    );
}
