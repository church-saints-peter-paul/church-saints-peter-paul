-- ==========================================
-- ST. PETER AND PAUL CHURCH - DB UPGRADE MIGRATION
-- Run this in your Supabase SQL Editor
-- ==========================================

-- 1. Create blocked_ips table
CREATE TABLE IF NOT EXISTS public.blocked_ips (
    ip_address TEXT PRIMARY KEY,
    blocked_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    reason TEXT
);

-- Enable RLS
ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Allow public select on blocked_ips" ON public.blocked_ips;
DROP POLICY IF EXISTS "Allow admin manage on blocked_ips" ON public.blocked_ips;

-- Create policies for blocked_ips
CREATE POLICY "Allow public select on blocked_ips" ON public.blocked_ips FOR SELECT USING (true);
CREATE POLICY "Allow admin manage on blocked_ips" ON public.blocked_ips FOR ALL USING (public.is_admin(auth.uid()));


-- 2. Update admin_reset_user_password function to include 'خادم'
CREATE OR REPLACE FUNCTION public.admin_reset_user_password(target_user_id UUID, new_password TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Verify execution privileges (Admins/Super Admins and Servants)
  IF EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role IN ('اب كاهن', 'امين خدمه', 'خادم')
  ) THEN
    -- Encrypt and set password in auth.users schema
    UPDATE auth.users
    SET encrypted_password = crypt(new_password, gen_salt('bf'))
    WHERE id = target_user_id;
    
    -- Also update the plain_password field in profiles so it matches
    UPDATE public.profiles
    SET plain_password = new_password
    WHERE id = target_user_id;
    
    -- Write log
    INSERT INTO public.activity_logs (user_id, action, details)
    VALUES (auth.uid(), 'reset_password', 'تم إعادة تعيين كلمة المرور بنجاح للمستخدم ذو المعرف: ' || target_user_id);
    
    RETURN TRUE;
  ELSE
    RAISE EXCEPTION 'غير مصرح لك بإعادة تعيين كلمات مرور المستخدمين.';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Update admin_delete_user function to include 'خادم'
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Verify execution privileges (Admins/Super Admins and Servants)
  IF EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role IN ('اب كاهن', 'امين خدمه', 'خادم')
  ) THEN
    -- Delete from auth.users (which cascades to public.profiles)
    DELETE FROM auth.users WHERE id = target_user_id;
    
    -- Write log
    INSERT INTO public.activity_logs (user_id, action, details)
    VALUES (auth.uid(), 'delete_user', 'تم حذف حساب المستخدم بشكل نهائي، المعرف: ' || target_user_id);
    
    RETURN TRUE;
  ELSE
    RAISE EXCEPTION 'غير مصرح لك بحذف المستخدمين من النظام.';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. REMOVE PHONE UNIQUENESS CONSTRAINT & INDEX
-- Drop common unique constraints on phone column
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_phone_key;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS unique_phone;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_phone_unique;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS phone_unique;

-- Drop common unique indexes on phone column
DROP INDEX IF EXISTS public.profiles_phone_key;
DROP INDEX IF EXISTS public.idx_profiles_phone;
DROP INDEX IF EXISTS public.idx_profiles_phone_unique;
DROP INDEX IF EXISTS public.phone_unique_idx;
DROP INDEX IF EXISTS public.profiles_phone_idx;

-- 5. UPDATE PROFILES UPDATE POLICY TO ALLOW SERVANTS
DROP POLICY IF EXISTS "Users can update own details; Admins can update everything" ON public.profiles;
CREATE POLICY "Users can update own details; Admins can update everything" ON public.profiles FOR UPDATE USING (auth.uid() = id OR public.is_admin(auth.uid()));

-- 6. UPDATE OTHER TABLES RLS POLICIES TO ALLOW 'خادم' (SERVANTS)
-- user_sessions policies
DROP POLICY IF EXISTS "Users can view own sessions; Admins can view all" ON public.user_sessions;
CREATE POLICY "Users can view own sessions; Admins can view all" ON public.user_sessions FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can update own sessions; Admins can update all" ON public.user_sessions;
CREATE POLICY "Users can update own sessions; Admins can update all" ON public.user_sessions FOR UPDATE USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- mass_schedules policies
DROP POLICY IF EXISTS "Allow admin manage on mass_schedules" ON public.mass_schedules;
CREATE POLICY "Allow admin manage on mass_schedules" ON public.mass_schedules FOR ALL USING (public.is_admin(auth.uid()));

-- church_news policies
DROP POLICY IF EXISTS "Allow admin manage on church_news" ON public.church_news;
CREATE POLICY "Allow admin manage on church_news" ON public.church_news FOR ALL USING (public.is_admin(auth.uid()));

-- slideshow_images policies
DROP POLICY IF EXISTS "Allow admin manage on slideshow_images" ON public.slideshow_images;
CREATE POLICY "Allow admin manage on slideshow_images" ON public.slideshow_images FOR ALL USING (public.is_admin(auth.uid()));


-- 7. ADD class_year COLUMN & ENFORCE PHONE UNIQUENESS & UPDATE handle_new_user TRIGGER
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS class_year TEXT DEFAULT NULL;

-- Resolve duplicate phone numbers conflict by setting duplicates to NULL (keeps oldest profile)
UPDATE public.profiles p
SET phone = NULL
WHERE p.id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY phone ORDER BY created_at ASC) as rn
        FROM public.profiles
        WHERE phone IS NOT NULL AND phone != ''
    ) t
    WHERE t.rn > 1
);

DROP INDEX IF EXISTS public.idx_profiles_phone_unique;
CREATE UNIQUE INDEX idx_profiles_phone_unique ON public.profiles (phone) WHERE (phone IS NOT NULL AND phone != '');

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    first_name TEXT;
    last_name TEXT;
    full_name TEXT;
    username_val TEXT;
    phone_val TEXT;
    role_val TEXT;
    dob_val TEXT;
    plain_pass TEXT;
    class_year_val TEXT;
    age_years INT;
    status_val TEXT := 'Active';
    is_blocked_val BOOLEAN := FALSE;
BEGIN
    -- Handle NULL raw_user_meta_data safely (e.g. when creating users from Supabase Dashboard)
    IF new.raw_user_meta_data IS NULL THEN
        full_name := 'مسؤول النظام';
        username_val := COALESCE(split_part(new.email, '@', 1), 'admin_' || SUBSTR(new.id::text, 1, 4));
        phone_val := COALESCE(new.phone, '');
        role_val := 'مخدوم';
        dob_val := '';
        plain_pass := '';
        class_year_val := NULL;
    ELSE
        first_name := COALESCE(new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'firstName', '');
        last_name := COALESCE(new.raw_user_meta_data->>'last_name', new.raw_user_meta_data->>'lastName', '');
        
        IF first_name = '' AND last_name = '' THEN
            full_name := 'مستخدم جديد';
        ELSE
            full_name := TRIM(first_name || ' ' || last_name);
        END IF;
        
        username_val := COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1));
        phone_val := COALESCE(new.raw_user_meta_data->>'phone', new.phone);
        role_val := COALESCE(new.raw_user_meta_data->>'role', 'مخدوم');
        dob_val := COALESCE(new.raw_user_meta_data->>'dob', '');
        plain_pass := COALESCE(new.raw_user_meta_data->>'plain_password', '');
        class_year_val := COALESCE(new.raw_user_meta_data->>'class_year', new.raw_user_meta_data->>'classYear');
    END IF;

    -- Ensure unique username
    IF EXISTS (SELECT 1 FROM public.profiles WHERE username = username_val) THEN
        username_val := username_val || '_' || SUBSTR(new.id::text, 1, 4);
    END IF;

    -- Parse age safely and check restriction
    IF dob_val IS NOT NULL AND dob_val ~ '^\d{4}-\d{2}-\d{2}$' THEN
        BEGIN
            age_years := DATE_PART('year', AGE(NOW(), dob_val::DATE));
        EXCEPTION WHEN OTHERS THEN
            age_years := 20;
        END;
    ELSE
        age_years := 20;
    END IF;

    -- Enforce age restriction: 
    -- 1. Servants/Admins must be > 18 (i.e. >= 19 years old)
    IF age_years <= 18 AND role_val IN ('اب كاهن', 'امين خدمه', 'خادم') THEN
        status_val := 'Suspended';
        is_blocked_val := TRUE;
    END IF;

    -- 2. Makhdoum must be < 19 (i.e. <= 18 years old)
    IF age_years >= 19 AND role_val = 'مخدوم' THEN
        status_val := 'Suspended';
        is_blocked_val := TRUE;
    END IF;

    -- Insert into public profiles
    INSERT INTO public.profiles (id, full_name, username, email, phone, role, status, online_status, dob, plain_password, is_blocked, class_year, created_at)
    VALUES (
        new.id,
        full_name,
        username_val,
        new.email,
        phone_val,
        role_val,
        status_val,
        FALSE,
        dob_val,
        plain_pass,
        is_blocked_val,
        class_year_val,
        NOW()
    )
    ON CONFLICT (id) DO UPDATE 
    SET 
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        role = EXCLUDED.role,
        dob = EXCLUDED.dob,
        plain_password = EXCLUDED.plain_password,
        class_year = EXCLUDED.class_year,
        status = CASE WHEN profiles.status = 'Suspended' THEN 'Suspended' ELSE EXCLUDED.status END,
        is_blocked = CASE WHEN profiles.is_blocked = TRUE THEN TRUE ELSE EXCLUDED.is_blocked END;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 8. SYNC CLASS YEAR FOR EXISTING USERS FROM AUTH METADATA
UPDATE public.profiles p
SET class_year = COALESCE(u.raw_user_meta_data->>'class_year', u.raw_user_meta_data->>'classYear')
FROM auth.users u
WHERE p.id = u.id AND p.class_year IS NULL;


-- 9. SYNC PHONE FOR EXISTING USERS FROM AUTH METADATA AND AUTH USERS PHONE COLUMN
-- Only sync if the phone number does NOT already exist in public.profiles!
UPDATE public.profiles p
SET phone = COALESCE(u.raw_user_meta_data->>'phone', u.phone)
FROM auth.users u
WHERE p.id = u.id 
  AND (p.phone IS NULL OR p.phone = '')
  AND COALESCE(u.raw_user_meta_data->>'phone', u.phone) IS NOT NULL
  AND COALESCE(u.raw_user_meta_data->>'phone', u.phone) != ''
  AND NOT EXISTS (
      SELECT 1 FROM public.profiles p2 
      WHERE p2.phone = COALESCE(u.raw_user_meta_data->>'phone', u.phone)
        AND p2.id != p.id
  );





  