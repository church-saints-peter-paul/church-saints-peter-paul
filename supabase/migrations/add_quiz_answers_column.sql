-- Add quiz_answers column to service_student_progress table to track student selections for review
ALTER TABLE public.service_student_progress ADD COLUMN IF NOT EXISTS quiz_answers JSONB;
