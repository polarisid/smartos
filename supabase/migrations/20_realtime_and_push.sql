-- 1) Realtime do Command Center: a publicação estava vazia, então o feed ao vivo
--    (assinatura de service_orders) nunca recebia nada. A RLS continua valendo.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'service_orders') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.service_orders;
    END IF;
END $$;

-- 2) Web Push: aparelhos inscritos de cada usuário.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL DEFAULT auth.uid(),
    endpoint    TEXT NOT NULL UNIQUE,
    p256dh      TEXT NOT NULL,
    auth        TEXT NOT NULL,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "push select own" ON public.push_subscriptions;
CREATE POLICY "push select own" ON public.push_subscriptions FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "push insert own" ON public.push_subscriptions;
CREATE POLICY "push insert own" ON public.push_subscriptions FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "push update own" ON public.push_subscriptions;
CREATE POLICY "push update own" ON public.push_subscriptions FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "push delete own" ON public.push_subscriptions;
CREATE POLICY "push delete own" ON public.push_subscriptions FOR DELETE USING (user_id = auth.uid());

-- 3) Configuração privada (URL do app + segredo do webhook). RLS ligada e SEM
--    política: o app/clients nunca leem; só funções SECURITY DEFINER.
CREATE TABLE IF NOT EXISTS public.app_private_config (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);
ALTER TABLE public.app_private_config ENABLE ROW LEVEL SECURITY;

-- 4) Ao nascer um aviso, pede ao app que dispare o push (pg_net, assíncrono: não
--    atrasa nem derruba a gravação da rota se o app estiver fora do ar).
--    Sem as chaves 'push_url' / 'push_secret' em app_private_config, não faz nada.
CREATE OR REPLACE FUNCTION public.push_on_notification() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_url TEXT; v_secret TEXT;
BEGIN
    SELECT value INTO v_url FROM public.app_private_config WHERE key = 'push_url';
    SELECT value INTO v_secret FROM public.app_private_config WHERE key = 'push_secret';
    IF v_url IS NULL OR v_secret IS NULL THEN
        RETURN NEW;
    END IF;
    BEGIN
        PERFORM net.http_post(
            url := v_url,
            body := jsonb_build_object('id', NEW.id, 'user_id', NEW.user_id, 'title', NEW.title, 'body', NEW.body, 'type', NEW.type),
            headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
            timeout_milliseconds := 5000
        );
    EXCEPTION WHEN OTHERS THEN
        -- Push é "bônus": nunca pode impedir o aviso de ser gravado.
        RAISE WARNING 'push_on_notification: %', SQLERRM;
    END;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_on_notification ON public.notifications;
CREATE TRIGGER push_on_notification
    AFTER INSERT ON public.notifications
    FOR EACH ROW EXECUTE FUNCTION public.push_on_notification();

-- Depois de aplicar, gravar a configuração (valores NÃO ficam no repositório):
--   INSERT INTO public.app_private_config (key, value) VALUES
--     ('push_url',    'https://smartos-the.vercel.app/api/push/notify'),
--     ('push_secret', '<mesmo valor de PUSH_WEBHOOK_SECRET da Vercel>')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
