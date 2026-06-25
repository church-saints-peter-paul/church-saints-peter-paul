-- =======================================================
-- REMOVE PHONE UNIQUENESS CONSTRAINT & INDEX
-- =======================================================
-- Run this SQL command in your Supabase SQL Editor to allow
-- multiple users to register with the same phone number.
-- =======================================================

-- 1. Drop common unique constraints on phone column
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_phone_key;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS unique_phone;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_phone_unique;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS phone_unique;

-- 2. Drop common unique indexes on phone column
DROP INDEX IF EXISTS public.profiles_phone_key;
DROP INDEX IF EXISTS public.idx_profiles_phone;
DROP INDEX IF EXISTS public.idx_profiles_phone_unique;
DROP INDEX IF EXISTS public.phone_unique_idx;
DROP INDEX IF EXISTS public.profiles_phone_idx;
