CREATE TABLE IF NOT EXISTS public.knowledge_base_rules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  content text NOT NULL,
  product_line text,
  product_family text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.system_stats (
  id text PRIMARY KEY,
  daily_requests integer DEFAULT 0,
  date text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.knowledge_base_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_stats ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all read and write (temporarily for migration, same as others)
CREATE POLICY "Enable all for knowledge_base_rules" ON public.knowledge_base_rules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for system_stats" ON public.system_stats FOR ALL USING (true) WITH CHECK (true);
