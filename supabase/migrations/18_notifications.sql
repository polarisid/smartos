-- Notificações para o técnico quando a rota dele muda.
-- Nascem no BANCO (gatilho em routes) e não no app: assim funcionam qualquer que
-- seja a tela/usuário que alterou a rota, e ficam gravadas pro técnico ver mesmo
-- se o app estiver fechado na hora. O app lê a tabela e assina o Realtime.

CREATE TABLE IF NOT EXISTS public.notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,                       -- login do técnico (= technicians.id)
    unidade_id  UUID,
    type        TEXT NOT NULL,                       -- route_assigned | route_removed | route_canceled | route_changed
    title       TEXT NOT NULL,
    body        TEXT,
    route_id    TEXT,                                -- routes.id é texto
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON public.notifications (user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Cada um vê/marca/apaga só as próprias. Ninguém insere pelo app: só o gatilho
-- (SECURITY DEFINER) abaixo.
DROP POLICY IF EXISTS "notifications select own" ON public.notifications;
CREATE POLICY "notifications select own" ON public.notifications FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "notifications update own" ON public.notifications;
CREATE POLICY "notifications update own" ON public.notifications FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "notifications delete own" ON public.notifications;
CREATE POLICY "notifications delete own" ON public.notifications FOR DELETE USING (user_id = auth.uid());

-- Realtime: o app recebe a notificação na hora (a RLS acima filtra por usuário).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
END $$;

-- ── Funções auxiliares ──────────────────────────────────────────────────────

-- (versão anterior recebia o id da rota como UUID)
ALTER TABLE public.notifications ALTER COLUMN route_id TYPE TEXT;
DROP FUNCTION IF EXISTS public.notify_technician(TEXT, UUID, TEXT, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.notify_technician(
    p_tech TEXT, p_unidade UUID, p_type TEXT, p_title TEXT, p_body TEXT, p_route TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid UUID;
BEGIN
    -- technician_id é texto (ids antigos não são UUID); só notifica quem tem login.
    IF p_tech IS NULL OR p_tech !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN;
    END IF;
    v_uid := p_tech::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
        RETURN;
    END IF;
    INSERT INTO public.notifications (user_id, unidade_id, type, title, body, route_id)
    VALUES (v_uid, p_unidade, p_type, p_title, p_body, p_route);
END;
$$;

-- "4176…, 4176…, 4176… e mais 2"
CREATE OR REPLACE FUNCTION public._fmt_os_list(p TEXT[]) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN cardinality(p) <= 3 THEN array_to_string(p, ', ')
                ELSE array_to_string(p[1:3], ', ') || ' e mais ' || (cardinality(p) - 3) END
$$;

-- ── Gatilho: compara a rota antes/depois e avisa o técnico dela ─────────────

CREATE OR REPLACE FUNCTION public.notify_route_changes() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    old_live BOOLEAN; new_live BOOLEAN;
    old_os TEXT[]; new_os TEXT[]; added TEXT[]; removed TEXT[];
    common_old TEXT[]; common_new TEXT[];
    changed_count INT := 0;
    parts TEXT[] := '{}';
    route_fields TEXT[] := '{}';
BEGIN
    -- Rota "viva" = publicada e em andamento. Rascunho, finalizada e cancelada não contam.
    IF TG_OP = 'DELETE' THEN
        IF OLD.is_active AND NOT COALESCE(OLD.is_draft, false) AND NOT COALESCE(OLD.is_canceled, false) THEN
            PERFORM public.notify_technician(OLD.technician_id, OLD.unidade_id, 'route_removed',
                'Rota removida', 'A rota "' || OLD.name || '" foi removida.', NULL);
        END IF;
        RETURN OLD;
    END IF;

    new_live := NEW.is_active AND NOT COALESCE(NEW.is_draft, false) AND NOT COALESCE(NEW.is_canceled, false);

    IF TG_OP = 'INSERT' THEN
        IF new_live THEN
            PERFORM public.notify_technician(NEW.technician_id, NEW.unidade_id, 'route_assigned',
                'Nova rota para você',
                NEW.name || ' · ' || jsonb_array_length(COALESCE(NEW.stops, '[]'::jsonb)) || ' parada(s)', NEW.id);
        END IF;
        RETURN NEW;
    END IF;

    -- UPDATE
    old_live := OLD.is_active AND NOT COALESCE(OLD.is_draft, false) AND NOT COALESCE(OLD.is_canceled, false);

    IF NOT old_live AND new_live THEN
        -- rascunho publicado (ou rota reativada)
        PERFORM public.notify_technician(NEW.technician_id, NEW.unidade_id, 'route_assigned',
            'Nova rota para você',
            NEW.name || ' · ' || jsonb_array_length(COALESCE(NEW.stops, '[]'::jsonb)) || ' parada(s)', NEW.id);
        RETURN NEW;
    END IF;

    IF old_live AND NOT new_live THEN
        -- Só cancelamento avisa; rota que simplesmente terminou (finalizada) não.
        IF COALESCE(NEW.is_canceled, false) AND NOT COALESCE(OLD.is_canceled, false) THEN
            PERFORM public.notify_technician(OLD.technician_id, OLD.unidade_id, 'route_canceled',
                'Rota cancelada', 'A rota "' || OLD.name || '" foi cancelada.', NEW.id);
        END IF;
        RETURN NEW;
    END IF;

    IF NOT (old_live AND new_live) THEN
        RETURN NEW;
    END IF;

    -- Rota viva antes e depois.
    IF OLD.technician_id IS DISTINCT FROM NEW.technician_id THEN
        PERFORM public.notify_technician(OLD.technician_id, OLD.unidade_id, 'route_removed',
            'Rota removida de você', 'A rota "' || OLD.name || '" foi passada para outro técnico.', NEW.id);
        PERFORM public.notify_technician(NEW.technician_id, NEW.unidade_id, 'route_assigned',
            'Nova rota para você',
            NEW.name || ' · ' || jsonb_array_length(COALESCE(NEW.stops, '[]'::jsonb)) || ' parada(s)', NEW.id);
        RETURN NEW;
    END IF;

    old_os := COALESCE(ARRAY(SELECT s->>'serviceOrder' FROM jsonb_array_elements(COALESCE(OLD.stops, '[]'::jsonb)) s), '{}');
    new_os := COALESCE(ARRAY(SELECT s->>'serviceOrder' FROM jsonb_array_elements(COALESCE(NEW.stops, '[]'::jsonb)) s), '{}');
    added   := COALESCE(ARRAY(SELECT x FROM unnest(new_os) x WHERE NOT (x = ANY(old_os))), '{}');
    removed := COALESCE(ARRAY(SELECT x FROM unnest(old_os) x WHERE NOT (x = ANY(new_os))), '{}');

    IF cardinality(added) > 0 THEN
        parts := parts || (cardinality(added) || CASE WHEN cardinality(added) = 1 THEN ' OS adicionada (' ELSE ' OS adicionadas (' END || public._fmt_os_list(added) || ')');
    END IF;
    IF cardinality(removed) > 0 THEN
        parts := parts || (cardinality(removed) || CASE WHEN cardinality(removed) = 1 THEN ' OS removida (' ELSE ' OS removidas (' END || public._fmt_os_list(removed) || ')');
    END IF;

    -- Ordem das paradas que continuam na rota.
    common_old := COALESCE(ARRAY(SELECT x FROM unnest(old_os) x WHERE x = ANY(new_os)), '{}');
    common_new := COALESCE(ARRAY(SELECT x FROM unnest(new_os) x WHERE x = ANY(old_os)), '{}');
    IF common_old IS DISTINCT FROM common_new THEN
        parts := parts || 'ordem das paradas alterada'::TEXT;
    END IF;

    -- Dados que mudam o atendimento (turno, data da visita, endereço). Ignora de
    -- propósito rastreio de peças, confirmações e comentários, que mudam o tempo todo.
    SELECT count(*) INTO changed_count
    FROM jsonb_array_elements(COALESCE(OLD.stops, '[]'::jsonb)) o
    JOIN jsonb_array_elements(COALESCE(NEW.stops, '[]'::jsonb)) n ON o->>'serviceOrder' = n->>'serviceOrder'
    WHERE ROW(o->>'city', o->>'neighborhood', o->>'zipCode', o->>'turn', o->>'firstVisitDate', o->>'addressDetails', o->>'stopType')
          IS DISTINCT FROM
          ROW(n->>'city', n->>'neighborhood', n->>'zipCode', n->>'turn', n->>'firstVisitDate', n->>'addressDetails', n->>'stopType');
    IF changed_count > 0 THEN
        parts := parts || (changed_count || CASE WHEN changed_count = 1 THEN ' OS com dados alterados (turno/data/endereço)' ELSE ' OS com dados alterados (turno/data/endereço)' END);
    END IF;

    IF OLD.departure_date IS DISTINCT FROM NEW.departure_date THEN route_fields := route_fields || 'data de saída'::TEXT; END IF;
    IF OLD.arrival_date   IS DISTINCT FROM NEW.arrival_date   THEN route_fields := route_fields || 'data de chegada'::TEXT; END IF;
    IF OLD.license_plate  IS DISTINCT FROM NEW.license_plate  THEN route_fields := route_fields || 'placa'::TEXT; END IF;
    IF OLD.driver_name    IS DISTINCT FROM NEW.driver_name    THEN route_fields := route_fields || 'motorista'::TEXT; END IF;
    IF OLD.route_type     IS DISTINCT FROM NEW.route_type     THEN route_fields := route_fields || 'tipo da rota'::TEXT; END IF;
    IF OLD.name           IS DISTINCT FROM NEW.name           THEN route_fields := route_fields || 'nome'::TEXT; END IF;
    IF cardinality(route_fields) > 0 THEN
        parts := parts || ('alterado: ' || array_to_string(route_fields, ', '));
    END IF;

    IF cardinality(parts) > 0 THEN
        PERFORM public.notify_technician(NEW.technician_id, NEW.unidade_id, 'route_changed',
            'Sua rota foi alterada', NEW.name || ' — ' || array_to_string(parts, '; ') || '.', NEW.id);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_route_changes ON public.routes;
CREATE TRIGGER notify_route_changes
    AFTER INSERT OR UPDATE OR DELETE ON public.routes
    FOR EACH ROW EXECUTE FUNCTION public.notify_route_changes();
