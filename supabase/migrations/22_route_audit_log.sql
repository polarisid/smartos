-- Histórico de alterações das rotas: quem mudou o quê e quando.
-- Nasce no BANCO (gatilho em routes), então registra qualquer origem: formulário do admin,
-- celular do técnico, Conferência de Peças, API... Só grava quando algo mudou de verdade.

CREATE TABLE IF NOT EXISTS public.route_audit_log (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    route_id    TEXT NOT NULL,
    unidade_id  UUID,
    user_id     UUID,
    user_name   TEXT,
    action      TEXT NOT NULL,                 -- created | updated | deleted
    changes     JSONB NOT NULL DEFAULT '[]',   -- lista de mudanças (ver route_changes)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS route_audit_log_route_idx ON public.route_audit_log (route_id, created_at DESC);

ALTER TABLE public.route_audit_log ENABLE ROW LEVEL SECURITY;

-- Só admin/master leem (master vê todas as unidades). Ninguém escreve pelo app: só o gatilho.
DROP POLICY IF EXISTS "route_audit select" ON public.route_audit_log;
CREATE POLICY "route_audit select" ON public.route_audit_log FOR SELECT USING (
    public.user_role() = 'master'
    OR (public.user_role() = 'admin' AND unidade_id = public.user_unidade_id())
);

-- Compara a rota antes/depois e devolve a lista de mudanças:
--   {kind:'field', field, from, to}                      campo da rota
--   {kind:'stop_added'|'stop_removed', os, city}         parada incluída/removida
--   {kind:'stop_field', os, field, from, to}             campo de uma parada
--   {kind:'part_added'|'part_removed', os, part}         peça incluída/removida
--   {kind:'part_field', os, part, field, from, to}       campo de uma peça (ex.: trackingCode)
--   {kind:'order'}                                       ordem das paradas mudou
CREATE OR REPLACE FUNCTION public.route_changes(p_old JSONB, p_new JSONB) RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    result JSONB := '[]'::jsonb;
    k TEXT;
    old_stops JSONB := COALESCE(p_old->'stops', '[]'::jsonb);
    new_stops JSONB := COALESCE(p_new->'stops', '[]'::jsonb);
    s_new JSONB; s_old JSONB; so TEXT;
    p_n JSONB; p_o JSONB; pc TEXT;
    old_order TEXT[]; new_order TEXT[];
    -- campos só de tela (calculados), não são dado da rota
    ignored TEXT[] := ARRAY['zipMismatch', 'zipMismatchDetails', 'suggestedCityState', 'parts'];
BEGIN
    FOREACH k IN ARRAY ARRAY['name','is_active','is_draft','is_canceled','route_type','license_plate','technician_id',
                             'technician_name','driver_id','driver_name','driver_phone','departure_date','arrival_date',
                             'planned_date','departure_time','start_point','end_point']
    LOOP
        IF (p_old->k) IS DISTINCT FROM (p_new->k) THEN
            result := result || jsonb_build_array(jsonb_build_object('kind','field','field',k,'from',p_old->k,'to',p_new->k));
        END IF;
    END LOOP;

    -- paradas incluídas / alteradas
    FOR s_new IN SELECT * FROM jsonb_array_elements(new_stops) LOOP
        so := s_new->>'serviceOrder';
        SELECT x INTO s_old FROM jsonb_array_elements(old_stops) x WHERE x->>'serviceOrder' = so LIMIT 1;
        IF s_old IS NULL THEN
            result := result || jsonb_build_array(jsonb_build_object('kind','stop_added','os',so,'city',s_new->>'city'));
            CONTINUE;
        END IF;

        FOR k IN SELECT DISTINCT key FROM (SELECT jsonb_object_keys(s_old) AS key UNION SELECT jsonb_object_keys(s_new)) u LOOP
            CONTINUE WHEN k = ANY(ignored);
            IF (s_old->k) IS DISTINCT FROM (s_new->k) THEN
                result := result || jsonb_build_array(jsonb_build_object('kind','stop_field','os',so,'field',k,'from',s_old->k,'to',s_new->k));
            END IF;
        END LOOP;

        -- peças da parada
        FOR p_n IN SELECT * FROM jsonb_array_elements(COALESCE(s_new->'parts','[]'::jsonb)) LOOP
            pc := p_n->>'code';
            SELECT x INTO p_o FROM jsonb_array_elements(COALESCE(s_old->'parts','[]'::jsonb)) x WHERE x->>'code' = pc LIMIT 1;
            IF p_o IS NULL THEN
                result := result || jsonb_build_array(jsonb_build_object('kind','part_added','os',so,'part',pc));
            ELSE
                FOR k IN SELECT DISTINCT key FROM (SELECT jsonb_object_keys(p_o) AS key UNION SELECT jsonb_object_keys(p_n)) u LOOP
                    IF (p_o->k) IS DISTINCT FROM (p_n->k) THEN
                        result := result || jsonb_build_array(jsonb_build_object('kind','part_field','os',so,'part',pc,'field',k,'from',p_o->k,'to',p_n->k));
                    END IF;
                END LOOP;
            END IF;
        END LOOP;
        FOR p_o IN SELECT * FROM jsonb_array_elements(COALESCE(s_old->'parts','[]'::jsonb)) LOOP
            pc := p_o->>'code';
            IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(s_new->'parts','[]'::jsonb)) x WHERE x->>'code' = pc) THEN
                result := result || jsonb_build_array(jsonb_build_object('kind','part_removed','os',so,'part',pc));
            END IF;
        END LOOP;
    END LOOP;

    -- paradas removidas
    FOR s_old IN SELECT * FROM jsonb_array_elements(old_stops) LOOP
        so := s_old->>'serviceOrder';
        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(new_stops) x WHERE x->>'serviceOrder' = so) THEN
            result := result || jsonb_build_array(jsonb_build_object('kind','stop_removed','os',so,'city',s_old->>'city'));
        END IF;
    END LOOP;

    -- ordem (só das paradas que continuam na rota)
    old_order := ARRAY(SELECT x->>'serviceOrder' FROM jsonb_array_elements(old_stops) x
                       WHERE (x->>'serviceOrder') IN (SELECT y->>'serviceOrder' FROM jsonb_array_elements(new_stops) y));
    new_order := ARRAY(SELECT x->>'serviceOrder' FROM jsonb_array_elements(new_stops) x
                       WHERE (x->>'serviceOrder') IN (SELECT y->>'serviceOrder' FROM jsonb_array_elements(old_stops) y));
    IF old_order IS DISTINCT FROM new_order THEN
        result := result || jsonb_build_array(jsonb_build_object('kind','order'));
    END IF;

    RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_route_changes() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_name TEXT;
    v_changes JSONB;
    v_route_id TEXT;
    v_unidade UUID;
BEGIN
    IF v_uid IS NOT NULL THEN
        SELECT name INTO v_name FROM public.profiles WHERE id = v_uid;
    END IF;
    v_name := COALESCE(v_name, CASE WHEN v_uid IS NULL THEN 'Sistema' ELSE 'Usuário' END);

    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.route_audit_log (route_id, unidade_id, user_id, user_name, action, changes)
        VALUES (NEW.id, NEW.unidade_id, v_uid, v_name, 'created',
                jsonb_build_array(jsonb_build_object('kind','created','name',NEW.name,'stops',jsonb_array_length(COALESCE(NEW.stops,'[]'::jsonb)))));
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.route_audit_log (route_id, unidade_id, user_id, user_name, action, changes)
        VALUES (OLD.id, OLD.unidade_id, v_uid, v_name, 'deleted',
                jsonb_build_array(jsonb_build_object('kind','deleted','name',OLD.name)));
        RETURN OLD;
    END IF;

    -- Rascunho que continua rascunho (o assistente salva a cada passo): sem ruído no histórico.
    IF COALESCE(OLD.is_draft, false) AND COALESCE(NEW.is_draft, false) THEN
        RETURN NEW;
    END IF;

    v_changes := public.route_changes(to_jsonb(OLD), to_jsonb(NEW));
    IF jsonb_array_length(v_changes) > 0 THEN
        INSERT INTO public.route_audit_log (route_id, unidade_id, user_id, user_name, action, changes)
        VALUES (NEW.id, NEW.unidade_id, v_uid, v_name, 'updated', v_changes);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_route_changes ON public.routes;
CREATE TRIGGER log_route_changes
    AFTER INSERT OR UPDATE OR DELETE ON public.routes
    FOR EACH ROW EXECUTE FUNCTION public.log_route_changes();
