-- =======================================================
-- ADD EXTRA LESSON FEATURES & LOCKS TO SERVICE LESSONS
-- =======================================================

ALTER TABLE public.service_lessons 
ADD COLUMN IF NOT EXISTS quiz_locked BOOLEAN DEFAULT FALSE;

ALTER TABLE public.service_lessons 
ADD COLUMN IF NOT EXISTS quiz_lock_timer TIMESTAMP WITH TIME ZONE DEFAULT NULL;

ALTER TABLE public.service_lessons 
ADD COLUMN IF NOT EXISTS allow_scrubbing BOOLEAN DEFAULT FALSE;

-- Create service_student_restrictions table to block specific students from specific lessons
CREATE TABLE IF NOT EXISTS public.service_student_restrictions (
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    lesson_id UUID REFERENCES public.service_lessons(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    PRIMARY KEY (user_id, lesson_id)
);

-- Enable RLS for restrictions
ALTER TABLE public.service_student_restrictions ENABLE ROW LEVEL SECURITY;

-- Drop old policies if exist
DROP POLICY IF EXISTS "Allow auth read restrictions" ON public.service_student_restrictions;
DROP POLICY IF EXISTS "Allow admin manage restrictions" ON public.service_student_restrictions;

-- Policies
CREATE POLICY "Allow auth read restrictions" ON public.service_student_restrictions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Allow admin manage restrictions" ON public.service_student_restrictions FOR ALL USING (public.is_admin(auth.uid()));
