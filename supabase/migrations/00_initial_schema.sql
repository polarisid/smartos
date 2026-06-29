-- Supabase Schema Migration (Phase 4)
-- This script creates the relational tables to replace the NoSQL collections from Firestore.

-- 1. Users (Extending Supabase Auth)
-- We use public.profiles to store user data, linked to auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'technician', 'counter_technician')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Drivers
CREATE TABLE IF NOT EXISTS public.drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Technicians
CREATE TABLE IF NOT EXISTS public.technicians (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT,
    goal NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Service Orders
CREATE TABLE IF NOT EXISTS public.service_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    technician_id UUID REFERENCES public.technicians(id) ON DELETE SET NULL,
    service_order_number TEXT NOT NULL,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    equipment_type TEXT NOT NULL,
    service_type TEXT NOT NULL,
    
    samsung_repair_type TEXT,
    samsung_budget_approved BOOLEAN,
    samsung_budget_value NUMERIC,
    
    symptom_code TEXT,
    repair_code TEXT,
    
    defect_found TEXT,
    parts_requested TEXT,
    
    product_collected_or_installed TEXT,
    collection_type TEXT,
    
    replaced_part TEXT,
    observations TEXT,
    
    cleaning_performed BOOLEAN,
    is_finalized BOOLEAN DEFAULT false,
    pending_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Routes and Route Stops
CREATE TABLE IF NOT EXISTS public.routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    is_canceled BOOLEAN DEFAULT false,
    departure_date TIMESTAMP WITH TIME ZONE,
    arrival_date TIMESTAMP WITH TIME ZONE,
    route_type TEXT,
    license_plate TEXT,
    technician_id UUID REFERENCES public.technicians(id) ON DELETE SET NULL,
    technician_name TEXT,
    driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
    driver_name TEXT,
    driver_phone TEXT,
    stops JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Checklists (Templates and Fields)
CREATE TABLE IF NOT EXISTS public.checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    pdf_url TEXT NOT NULL,
    type TEXT,
    fields JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Returns
CREATE TABLE IF NOT EXISTS public.returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    technician_id UUID REFERENCES public.technicians(id) ON DELETE SET NULL,
    technician_name TEXT,
    original_service_order TEXT NOT NULL,
    original_replaced_part TEXT NOT NULL,
    return_service_order TEXT NOT NULL,
    return_replaced_part TEXT NOT NULL,
    return_date TIMESTAMP WITH TIME ZONE NOT NULL,
    days_to_return INTEGER NOT NULL,
    product_model TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Chargebacks
CREATE TABLE IF NOT EXISTS public.chargebacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    technician_id UUID REFERENCES public.technicians(id) ON DELETE SET NULL,
    technician_name TEXT,
    service_order_number TEXT NOT NULL,
    value NUMERIC NOT NULL,
    reason TEXT NOT NULL,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. Indicators
CREATE TABLE IF NOT EXISTS public.indicators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    goal_type TEXT NOT NULL,
    goal_value NUMERIC,
    goal_description TEXT,
    evaluation_logic TEXT,
    current_value NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 10. Presets
CREATE TABLE IF NOT EXISTS public.presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    equipment_type TEXT NOT NULL,
    symptom_code TEXT NOT NULL,
    repair_code TEXT NOT NULL,
    replaced_part TEXT,
    observations TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 11. Codes (Symptoms and Repairs)
-- In Firestore we used a single document for all symptoms and one for repairs.
-- In SQL, it's better to use a single table with type and category.
CREATE TABLE IF NOT EXISTS public.codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('symptom', 'repair')),
    category TEXT NOT NULL CHECK (category IN ('TV/AV', 'DA')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 12. Triages
CREATE TABLE IF NOT EXISTS public.triages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_order_number TEXT NOT NULL,
    product_model TEXT NOT NULL,
    product_line TEXT,
    status TEXT NOT NULL,
    symptoms_reported TEXT[],
    suggested_parts TEXT[],
    final_diagnosis TEXT,
    messages JSONB DEFAULT '[]'::jsonb,
    is_corrected BOOLEAN DEFAULT false,
    corrected_diagnosis TEXT,
    corrected_parts TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 13. Knowledge Base
CREATE TABLE IF NOT EXISTS public.knowledge_base_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    product_family TEXT,
    product_line TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS) policies
-- (To be configured later, allowing authenticated users access)
