-- ==========================================
-- ST. PETER AND PAUL CHURCH - DATABASE SCHEMA
-- ==========================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop old triggers and tables if they exist to prevent column mismatch conflicts
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_session_activity ON public.user_sessions;
DROP TABLE IF EXISTS public.activity_logs CASCADE;
DROP TABLE IF EXISTS public.user_sessions CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.mass_schedules CASCADE;
DROP TABLE IF EXISTS public.church_news CASCADE;
DROP TABLE IF EXISTS public.slideshow_images CASCADE;

-- 1. PROFILES TABLE
-- Linked to Supabase Auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    role TEXT DEFAULT 'مخدوم' NOT NULL,
    status TEXT DEFAULT 'Active' NOT NULL,
    online_status BOOLEAN DEFAULT FALSE NOT NULL,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    dob TEXT, -- Date of birth stored as string
    plain_password TEXT, -- Plaintext password for admin visibility
    is_blocked BOOLEAN DEFAULT FALSE NOT NULL, -- Permanent block from homepage
    security_pin VARCHAR(4) DEFAULT NULL, -- 4-digit security PIN for admins
    avatar_url TEXT DEFAULT NULL, -- Base64 profile photo or URL
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    
    CONSTRAINT check_role CHECK (role IN ('اب كاهن', 'امين خدمه', 'خادم', 'مخدوم')),
    CONSTRAINT check_status CHECK (status IN ('Active', 'Suspended'))
);

-- Indexing for fast search & filtering
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);

-- 2. USER SESSIONS TABLE
-- Tracks active logins and devices
CREATE TABLE IF NOT EXISTS public.user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    device_info TEXT,
    ip_address TEXT,
    login_time TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_is_active ON public.user_sessions(is_active);

-- 3. ACTIVITY LOGS TABLE
-- Audit logs for system actions
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON public.activity_logs(action);

-- 4. MASS SCHEDULES TABLE
-- Stores masses schedule dynamically
CREATE TABLE IF NOT EXISTS public.mass_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day_name TEXT NOT NULL,
    time_from TEXT NOT NULL,
    time_to TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 5. CHURCH NEWS TABLE
-- Stores news slider cards dynamically
CREATE TABLE IF NOT EXISTS public.church_news (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    date_day TEXT NOT NULL,
    date_month TEXT NOT NULL,
    category TEXT NOT NULL,
    image_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 6. SLIDESHOW IMAGES TABLE
-- Background slide images
CREATE TABLE IF NOT EXISTS public.slideshow_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 7. BLOCKED IPS TABLE
CREATE TABLE IF NOT EXISTS public.blocked_ips (
    ip_address TEXT PRIMARY KEY,
    blocked_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    reason TEXT
);


-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mass_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.church_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slideshow_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- ROW LEVEL SECURITY POLICIES & HELPER FUNCTIONS
-- ==========================================

-- 1. Security Definer helper functions to prevent infinite RLS recursion
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = user_id AND role IN ('اب كاهن', 'امين خدمه', 'خادم')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin_or_super(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = user_id AND role IN ('اب كاهن', 'امين خدمه')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- --- PROFILES POLICIES ---

-- 1. Read Profiles
DROP POLICY IF EXISTS "Users can read own profile; Admins/Moderators can read all profiles" ON public.profiles;
CREATE POLICY "Users can read own profile; Admins/Moderators can read all profiles"
ON public.profiles FOR SELECT
USING (
    auth.uid() = id 
    OR public.is_admin(auth.uid())
);

-- 2. Update Profiles
DROP POLICY IF EXISTS "Users can update own details; Admins can update everything" ON public.profiles;
CREATE POLICY "Users can update own details; Admins can update everything"
ON public.profiles FOR UPDATE
USING (
    auth.uid() = id 
    OR public.is_admin(auth.uid())
);

-- 3. Delete Profiles (Admins only)
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete profiles"
ON public.profiles FOR DELETE
USING (
    public.is_admin_or_super(auth.uid())
);

-- --- SESSIONS POLICIES ---

-- 1. Select Sessions
DROP POLICY IF EXISTS "Users can view own sessions; Admins can view all" ON public.user_sessions;
CREATE POLICY "Users can view own sessions; Admins can view all"
ON public.user_sessions FOR SELECT
USING (
    auth.uid() = user_id
    OR public.is_admin_or_super(auth.uid())
);

-- 2. Insert Sessions
DROP POLICY IF EXISTS "Authenticated users can insert sessions" ON public.user_sessions;
CREATE POLICY "Authenticated users can insert sessions"
ON public.user_sessions FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 3. Update Sessions (To update heartbeat/inactivity)
DROP POLICY IF EXISTS "Users can update own sessions; Admins can update all" ON public.user_sessions;
CREATE POLICY "Users can update own sessions; Admins can update all"
ON public.user_sessions FOR UPDATE
USING (
    auth.uid() = user_id
    OR public.is_admin_or_super(auth.uid())
);

-- --- ACTIVITY LOGS POLICIES ---

-- 1. Select Logs (Admins/Moderators only)
DROP POLICY IF EXISTS "Admins/Moderators can view audit logs" ON public.activity_logs;
CREATE POLICY "Admins/Moderators can view audit logs"
ON public.activity_logs FOR SELECT
USING (
    public.is_admin(auth.uid())
);

-- 2. Insert Logs (Anyone authenticated can write logs)
DROP POLICY IF EXISTS "Authenticated users can insert activity logs" ON public.activity_logs;
CREATE POLICY "Authenticated users can insert activity logs"
ON public.activity_logs FOR INSERT
WITH CHECK (auth.uid() = user_id OR auth.uid() IS NULL);

-- --- PUBLIC ACCESS POLICIES FOR SITE CONTENT TABLES ---

-- 1. Mass Schedules Policies
DROP POLICY IF EXISTS "Allow public select on mass_schedules" ON public.mass_schedules;
DROP POLICY IF EXISTS "Allow admin manage on mass_schedules" ON public.mass_schedules;
CREATE POLICY "Allow public select on mass_schedules" ON public.mass_schedules FOR SELECT USING (true);
CREATE POLICY "Allow admin manage on mass_schedules" ON public.mass_schedules FOR ALL USING (public.is_admin_or_super(auth.uid()));

-- 2. Church News Policies
DROP POLICY IF EXISTS "Allow public select on church_news" ON public.church_news;
DROP POLICY IF EXISTS "Allow admin manage on church_news" ON public.church_news;
CREATE POLICY "Allow public select on church_news" ON public.church_news FOR SELECT USING (true);
CREATE POLICY "Allow admin manage on church_news" ON public.church_news FOR ALL USING (public.is_admin_or_super(auth.uid()));

-- 3. Slideshow Images Policies
DROP POLICY IF EXISTS "Allow public select on slideshow_images" ON public.slideshow_images;
DROP POLICY IF EXISTS "Allow admin manage on slideshow_images" ON public.slideshow_images;
CREATE POLICY "Allow public select on slideshow_images" ON public.slideshow_images FOR SELECT USING (true);
CREATE POLICY "Allow admin manage on slideshow_images" ON public.slideshow_images FOR ALL USING (public.is_admin_or_super(auth.uid()));

-- 4. Blocked IPs Policies
DROP POLICY IF EXISTS "Allow public select on blocked_ips" ON public.blocked_ips;
DROP POLICY IF EXISTS "Allow admin manage on blocked_ips" ON public.blocked_ips;
CREATE POLICY "Allow public select on blocked_ips" ON public.blocked_ips FOR SELECT USING (true);
CREATE POLICY "Allow admin manage on blocked_ips" ON public.blocked_ips FOR ALL USING (public.is_admin(auth.uid()));


-- ==========================================
-- TRIGGERS & AUTOMATION FUNCTIONS
-- ==========================================

-- Function to handle new user registration automatically
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

    -- Enforce age restriction: under 18 cannot have service/admin roles
    IF age_years < 18 AND role_val IN ('اب كاهن', 'امين خدمه', 'خادم') THEN
        status_val := 'Suspended';
        is_blocked_val := TRUE;
    END IF;

    -- Insert into public profiles (using ON CONFLICT to avoid failing the trigger on retries)
    INSERT INTO public.profiles (id, full_name, username, email, phone, role, status, online_status, dob, plain_password, is_blocked, created_at)
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
        status = CASE WHEN profiles.status = 'Suspended' THEN 'Suspended' ELSE EXCLUDED.status END,
        is_blocked = CASE WHEN profiles.is_blocked = TRUE THEN TRUE ELSE EXCLUDED.is_blocked END;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for auth.users creation
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger function to update profile updated_at or track online heartbeat
CREATE OR REPLACE FUNCTION public.update_last_seen()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.profiles
    SET last_seen = NOW()
    WHERE id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_session_activity
  AFTER INSERT OR UPDATE ON public.user_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_last_seen();

-- ==========================================
-- SECURE ADMIN RPC FUNCTIONS
-- ==========================================

-- 1. Admin reset user password
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

-- 2. Admin delete user
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


-- ==========================================
-- DEFAULT INITIAL SEED DATA
-- ==========================================

-- Seed Mass Schedules
INSERT INTO public.mass_schedules (day_name, time_from, time_to) VALUES
('الأحد', '07:00 ص', '09:30 ص'),
('الأربعاء', '12:00 م', '03:00 م'),
('الجمعة', '07:30 ص', '10:00 ص'),
('السبت', '07:30 ص', '10:00 ص');

-- Seed Church News
INSERT INTO public.church_news (title, content, date_day, date_month, category, image_url) VALUES
('ترقية الشمامسة الي اغنسطس', 'سيامه مجموعه من ابناء الكنيسه برتبه أغنسطس بيد صاحب النيافه مطرننا الجليل أنبا بنيامين', '06', 'أغسطس', 'رسامة', '16.jpg'),
('فريق الحان ثانوي', 'مشاركة الكنيسه بفرع الالحان للمرحله الثانويه تحت إشراف (بيتر ميخائيل) و (مريم هاني) و (إبرام إيهاب) و فاز الفريق بدرع التميز', '24', 'أغسطس', 'كرازة', '17.jpg');

-- Seed Slideshow Images
INSERT INTO public.slideshow_images (image_url) VALUES
('3.jpg'),
('1.png'),
('9.jpg'),
('10.jpg'),
('11.jpg'),
('12.jpg'),
('13.jpg'),
('14.jpg'),
('15.jpg'),
('16.jpg'),
('17.jpg');
