import { supabase } from "@/lib/supabase";

export type RouteChange =
    | { kind: "created"; name?: string; stops?: number }
    | { kind: "deleted"; name?: string }
    | { kind: "field"; field: string; from: unknown; to: unknown }
    | { kind: "stop_added" | "stop_removed"; os: string; city?: string }
    | { kind: "stop_field"; os: string; field: string; from: unknown; to: unknown }
    | { kind: "part_added" | "part_removed"; os: string; part: string }
    | { kind: "part_field"; os: string; part: string; field: string; from: unknown; to: unknown }
    | { kind: "order" };

export type RouteAuditEntry = {
    id: number;
    routeId: string;
    userName: string;
    action: "created" | "updated" | "deleted";
    changes: RouteChange[];
    createdAt: Date;
};

export const routeAuditService = {
    // A RLS já limita a admin/master da unidade (a tabela vem da migração 22).
    async getByRoute(routeId: string, limit: number = 200): Promise<RouteAuditEntry[]> {
        const { data, error } = await supabase
            .from("route_audit_log")
            .select("*")
            .eq("route_id", routeId)
            .order("created_at", { ascending: false })
            .limit(limit);
        if (error) throw error;
        return (data || []).map((row: any) => ({
            id: row.id,
            routeId: row.route_id,
            userName: row.user_name || "—",
            action: row.action,
            changes: (row.changes || []) as RouteChange[],
            createdAt: new Date(row.created_at),
        }));
    },
};
