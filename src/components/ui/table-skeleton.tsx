import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface TableSkeletonProps {
  cols: number;
  rows?: number;
}

export function TableSkeleton({ cols, rows = 5 }: TableSkeletonProps) {
  return (
    <div className="w-full space-y-4">
      <div className="rounded-md border border-border/40 overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow>
              {Array.from({ length: cols }).map((_, colIndex) => (
                <TableHead key={colIndex}>
                  <Skeleton className="h-4 w-[100px] bg-muted/80 animate-pulse" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <TableRow key={rowIndex}>
                {Array.from({ length: cols }).map((_, colIndex) => {
                  // Generate random width for skeleton cells to make it look realistic
                  const widths = ["w-[80px]", "w-[120px]", "w-[60px]", "w-[140px]", "w-[100px]"];
                  const widthClass = widths[(colIndex + rowIndex) % widths.length];
                  return (
                    <TableCell key={colIndex}>
                      <Skeleton className={`h-4 ${widthClass} bg-muted/50 animate-pulse`} />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
