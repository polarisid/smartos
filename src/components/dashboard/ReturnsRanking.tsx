import React from "react";
import { format, isAfter, startOfYear } from "date-fns";
import { type Technician, type Return } from "@/lib/data";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trophy } from "lucide-react";

export function ReturnsRanking({ technicians, returns }: { technicians: Technician[], returns: Return[] }) {
    const now = new Date();
    const startOfCurrentYear = startOfYear(now);
    
    const returnsThisYear = returns.filter(r => r.returnDate && isAfter(r.returnDate, startOfCurrentYear));

    const returnsByTechnician = technicians.map(tech => {
        const techReturns = returnsThisYear.filter(r => r.technicianId === tech.id);
        const returnCount = techReturns.length;
        const totalDaysToReturn = techReturns.reduce((acc, r) => acc + r.daysToReturn, 0);
        const averageDaysToReturn = returnCount > 0 ? totalDaysToReturn / returnCount : 0;
        
        return {
            ...tech,
            returnCount,
            averageDaysToReturn,
            returns: techReturns,
        };
    }).sort((a, b) => {
        if (a.returnCount !== b.returnCount) {
            return a.returnCount - b.returnCount;
        }
        return b.averageDaysToReturn - a.averageDaysToReturn;
    });

    const getTrophyColor = (rank: number) => {
        if (rank === 0) return "text-yellow-500";
        if (rank === 1) return "text-gray-400";
        if (rank === 2) return "text-yellow-800";
        return "text-muted-foreground";
    };

    return (
        <Card className="shadow-sm border-muted transition-all">
            <CardHeader>
                <CardTitle>Ranking Anual de Retornos</CardTitle>
                <CardDescription>Técnicos com a menor quantidade de retornos no ano corrente. Clique no nome para ver os detalhes.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="w-[100px]">Posição</TableHead>
                            <TableHead>Técnico</TableHead>
                            <TableHead className="text-center">Retornos (Ano)</TableHead>
                            <TableHead className="text-right">Média de Dias p/ Retorno</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {returnsByTechnician.map((tech, index) => (
                            <TableRow key={tech.id} className="group">
                                <TableCell className="font-bold text-lg flex items-center gap-2">
                                    <Trophy className={`h-5 w-5 ${getTrophyColor(index)} drop-shadow-sm`} />
                                    <span>#{index + 1}</span>
                                </TableCell>
                                <TableCell>
                                    <Dialog>
                                        <DialogTrigger asChild>
                                            <Button variant="link" className="font-medium p-0 h-auto text-foreground group-hover:text-primary transition-colors" disabled={tech.returnCount === 0}>
                                                {tech.name}
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="max-w-3xl">
                                            <DialogHeader>
                                                <DialogTitle>Retornos de {tech.name}</DialogTitle>
                                                <DialogDescription>
                                                    Detalhes dos retornos do técnico no ano corrente.
                                                </DialogDescription>
                                            </DialogHeader>
                                            <div className="max-h-[60vh] overflow-y-auto">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Data</TableHead>
                                                            <TableHead>OS Original</TableHead>
                                                            <TableHead>OS Retorno</TableHead>
                                                            <TableHead>Modelo</TableHead>
                                                            <TableHead className="text-right">Dias</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {tech.returns.map((r, i) => (
                                                            <TableRow key={i}>
                                                                <TableCell>{r.returnDate ? format(r.returnDate, 'dd/MM/yyyy') : 'N/A'}</TableCell>
                                                                <TableCell className="font-mono">{r.originalServiceOrder}</TableCell>
                                                                <TableCell className="font-mono">{r.returnServiceOrder}</TableCell>
                                                                <TableCell>{r.productModel}</TableCell>
                                                                <TableCell className="text-right font-medium">{r.daysToReturn}</TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                </TableCell>
                                <TableCell className="text-center font-mono font-semibold">{tech.returnCount}</TableCell>
                                <TableCell className="text-right font-mono font-semibold">{Math.round(tech.averageDaysToReturn)} dias</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
