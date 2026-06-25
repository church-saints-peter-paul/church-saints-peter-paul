-- =====================================================
-- ADD PARENT_PHONE AND ADDRESS FIELDS TO PROFILES
-- & UPDATE handle_new_user TRIGGER TO MAP THEM FROM METADATA
-- Run this in your Supabase SQL Editor
-- Safe to run multiple times
-- =====================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS parent_phone TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS address TEXT DEFAULT NULL;

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
    parent_phone_val TEXT;
    address_val TEXT;
    avatar_url_val TEXT;
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
        parent_phone_val := NULL;
        address_val := NULL;
        avatar_url_val := NULL;
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
        parent_phone_val := COALESCE(new.raw_user_meta_data->>'parent_phone', new.raw_user_meta_data->>'parentPhone', NULL);
        address_val := COALESCE(new.raw_user_meta_data->>'address', NULL);
        avatar_url_val := COALESCE(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'avatarUrl', NULL);
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
    INSERT INTO public.profiles (id, full_name, username, email, phone, role, status, online_status, dob, plain_password, is_blocked, class_year, parent_phone, address, avatar_url, created_at)
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
        parent_phone_val,
        address_val,
        avatar_url_val,
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
        parent_phone = EXCLUDED.parent_phone,
        address = EXCLUDED.address,
        avatar_url = EXCLUDED.avatar_url,
        status = CASE WHEN profiles.status = 'Suspended' THEN 'Suspended' ELSE EXCLUDED.status END,
        is_blocked = CASE WHEN profiles.is_blocked = TRUE THEN TRUE ELSE EXCLUDED.is_blocked END;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Done
SELECT 'profiles table updated and trigger handle_new_user recreated successfully!' as status;
