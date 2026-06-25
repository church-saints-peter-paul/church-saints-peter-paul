-- =====================================================
-- ADD STUDENT LOCKS TABLE
-- Run this in your Supabase SQL Editor to add per-student lock capabilities.
-- Safe to run multiple times (uses IF NOT EXISTS).
-- =====================================================

-- Extend service_student_restrictions to support quiz and lesson locks
ALTER TABLE public.service_student_restrictions
    ADD COLUMN IF NOT EXISTS quiz_locked BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS lesson_locked BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS locked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS lock_note TEXT DEFAULT NULL;

-- If the table doesn't exist yet (older setups), create it
CREATE TABLE IF NOT EXISTS public.service_student_restrictions (
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    lesson_id UUID REFERENCES public.service_lessons(id) ON DELETE CASCADE,
    quiz_locked BOOLEAN DEFAULT FALSE,
    lesson_locked BOOLEAN DEFAULT FALSE,
    locked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    lock_note TEXT DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    PRIMARY KEY (user_id, lesson_id)
);

-- Enable RLS
ALTER TABLE public.service_student_restrictions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Allow auth read restrictions" ON public.service_student_restrictions;
DROP POLICY IF EXISTS "Allow admin manage restrictions" ON public.service_student_restrictions;

CREATE POLICY "Allow auth read restrictions" 
ON public.service_student_restrictions FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow admin manage restrictions" 
ON public.service_student_restrictions FOR ALL 
USING (public.is_servant(auth.uid())) 
WITH CHECK (public.is_servant(auth.uid()));

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_student_restrictions TO authenticated;

-- Done
SELECT 'service_student_restrictions table updated successfully!' as status;
