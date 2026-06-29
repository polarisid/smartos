CREATE TABLE IF NOT EXISTS public.configs (
  id text PRIMARY KEY,
  value jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.configs ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all read and write (temporarily for migration, same as others)
CREATE POLICY "Enable all for configs" ON public.configs FOR ALL USING (true) WITH CHECK (true);

-- Insert default webhook config if not exists
INSERT INTO public.configs (id, value) 
VALUES ('webhook', '{"url": ""}'::jsonb)
ON CONFLICT (id) DO NOTHING;
