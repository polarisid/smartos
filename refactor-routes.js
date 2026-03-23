const fs = require('fs');
const path = require('path');

const pageFile = path.join(__dirname, 'src', 'app', 'page.tsx');
let content = fs.readFileSync(pageFile, 'utf8');

const mobileCardComponent = `
function MobileRouteStopCard({ stop, index, serviceOrders, routeCreatedAt, visitTemplate }: { 
    stop: RouteStop, 
    index: number, 
    serviceOrders: ServiceOrder[], 
    routeCreatedAt: Date | Timestamp,
    visitTemplate: string
}) {
    const { toast } = useToast();
    const createdAtAsDate = routeCreatedAt instanceof Timestamp ? routeCreatedAt.toDate() : routeCreatedAt;
    const isCompleted = serviceOrders.some(os => 
        os.serviceOrderNumber === stop.serviceOrder && 
        isAfter(os.date, createdAtAsDate)
    );

    const handleCopyVisitText = () => {
        let textToCopy = visitTemplate
            .replace(/{{consumerName}}/g, stop.consumerName.split(' ')[0])
            .replace(/{{serviceOrder}}/g, stop.serviceOrder)
            .replace(/{{city}}/g, stop.city);
        
        navigator.clipboard.writeText(textToCopy);
        toast({ title: "Texto copiado!", description: "O anúncio de visita foi copiado." });
    };

    const getCardClass = () => {
        if (isCompleted) return "border-green-300 bg-green-50 dark:bg-green-900/20";
        switch (stop.stopType) {
            case 'coleta': return 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20';
            case 'entrega': return 'border-blue-300 bg-blue-50 dark:bg-blue-900/20';
            default: return '';
        }
    };

    const stopTypeLabels = {
        padrao: 'Padrão',
        coleta: 'Coleta',
        entrega: 'Entrega'
    };

    return (
        <Card className={cn("overflow-hidden border-2", getCardClass())}>
            <div className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{stopTypeLabels[stop.stopType || 'padrao']}</p>
                        <p className={cn("font-mono font-black text-xl tracking-tight text-foreground", isCompleted && "line-through opacity-60")}>{stop.serviceOrder}</p>
                    </div>
                    {isCompleted && <div className="text-xs bg-green-200 text-green-800 px-3 py-1 rounded-full font-bold">Concluída</div>}
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-sm bg-background/50 p-3 rounded-lg border border-border/50">
                    <div>
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Local</p>
                        <p className="font-semibold line-clamp-1">{stop.city} - {stop.neighborhood}</p>
                    </div>
                    <div>
                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Produto</p>
                        <p className="font-semibold line-clamp-1">{stop.model}</p>
                    </div>
                </div>

                <Collapsible>
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full flex justify-between mt-2 h-12 text-base font-semibold border border-transparent hover:border-border">
                            <span>Ver Detalhes completos</span>
                            <ChevronDown className="h-5 w-5 opacity-50 transition-transform [&[data-state=open]]:rotate-180" />
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-4 mt-2 border-t border-border/50 space-y-4">
                         {stop.parts && stop.parts.length > 0 && (
                            <div>
                                <p className="font-bold text-xs uppercase text-muted-foreground mb-2">Peças Vinculadas:</p>
                                <div className="flex flex-wrap gap-2">
                                    {stop.parts.map((part, pIndex) => (
                                        <div key={pIndex} className="bg-background border shadow-sm rounded-md px-3 py-1.5 font-mono text-sm font-semibold">
                                            {part.code} <span className="text-primary ml-1">x{part.quantity}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="font-bold text-xs uppercase text-muted-foreground mb-1">Consumidor:</p>
                                <p className="text-sm font-medium">{stop.consumerName || "N/A"}</p>
                            </div>
                            <div>
                                <p className="font-bold text-xs uppercase text-muted-foreground mb-1">Status Comment:</p>
                                <p className="text-sm font-medium">{stop.statusComment || "N/A"}</p>
                            </div>
                        </div>
                        <div className="bg-muted/30 p-3 rounded-lg border border-border/50">
                            <p className="font-bold text-xs uppercase text-muted-foreground mb-1">Referências (ASC / TS / Garantia):</p>
                            <p className="text-sm font-mono font-medium">{stop.ascJobNumber} / {stop.ts} / {stop.warrantyType}</p>
                        </div>
                        <Button size="lg" variant="default" className="w-full mt-4 font-bold" onClick={handleCopyVisitText}>
                            <MessageSquare className="mr-2 h-5 w-5" />
                            Copiar Anúncio de Visita
                        </Button>
                    </CollapsibleContent>
                </Collapsible>
            </div>
        </Card>
    );
}
`;

const routeDetailsRowFunction = 'function RouteDetailsRow({';
if (content.indexOf('function MobileRouteStopCard') === -1) {
    content = content.replace(routeDetailsRowFunction, mobileCardComponent + '\n\n' + routeDetailsRowFunction);
}

// Now replace in the RoutesTab
const tableStartStr = '<Table>';
const tableEndStr = '</Table>';
const mapStartStr = '{route.stops.map((stop, index) => (';

const idxStart = content.indexOf(tableStartStr);
const idxEnd = content.indexOf(tableEndStr) + tableEndStr.length;

if (idxStart !== -1 && idxEnd !== -1) {
    let beforeTable = content.substring(0, idxStart);
    let afterTable = content.substring(idxEnd);
    let tableCode = content.substring(idxStart, idxEnd);

    // If it's not already wrapped...
    if (beforeTable.indexOf('<div className="hidden md:block">') === -1) {
        
        // Remove the hardcoded className from DialogContent to prevent huge wide popups on mobile
        beforeTable = beforeTable.replace('<DialogContent className="max-w-6xl">', '<DialogContent className="max-w-6xl w-[95vw] md:w-full p-2 md:p-6 bg-muted md:bg-background">');
        
        const responsiveWrapper = `
        <div className="md:hidden space-y-4 py-2">
            {route.stops.map((stop, index) => (
                <MobileRouteStopCard key={index} stop={stop} index={index} serviceOrders={serviceOrders} routeCreatedAt={(route.createdAt as Date)} visitTemplate={visitTemplate} />
            ))}
        </div>
        <div className="hidden md:block overflow-x-auto">
            ${tableCode}
        </div>
        `;
        content = beforeTable + responsiveWrapper + afterTable;
    }
}

fs.writeFileSync(pageFile, content, 'utf8');
console.log("Successfully added MobileRouteStopCard and replaced Table");
