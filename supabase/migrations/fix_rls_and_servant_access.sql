-- =======================================================
-- ST. PETER AND PAUL CHURCH - FIX RLS POLICIES FOR SERVANT DASHBOARD
-- Run this in your Supabase SQL Editor to fix all data-fetching issues.
-- =======================================================

-- -------------------------------------------------------
-- STEP 1: Re-create security helper functions
-- These functions allow servants (خادم / امين خدمه) to read all data
-- -------------------------------------------------------

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

CREATE OR REPLACE FUNCTION public.is_servant(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = user_id AND role IN ('امين خدمه', 'خادم')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- -------------------------------------------------------
-- STEP 2: FIX PROFILES TABLE RLS POLICIES
-- Allow servants to read ALL profiles (they need to see students/مخدوم)
-- -------------------------------------------------------

DROP POLICY IF EXISTS "Users can read own profile; Admins/Moderators can read all profiles" ON public.profiles;
CREATE POLICY "Users can read own profile; Admins/Moderators can read all profiles"
ON public.profiles FOR SELECT
USING (
    auth.uid() = id 
    OR public.is_admin(auth.uid())
);

DROP POLICY IF EXISTS "Users can update own details; Admins can update everything" ON public.profiles;
CREATE POLICY "Users can update own details; Admins can update everything"
ON public.profiles FOR UPDATE
USING (
    auth.uid() = id 
    OR public.is_admin(auth.uid())
);

DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete profiles"
ON public.profiles FOR DELETE
USING (
    public.is_admin_or_super(auth.uid())
);


-- -------------------------------------------------------
-- STEP 3: FIX USER_SESSIONS TABLE RLS POLICIES
-- -------------------------------------------------------

DROP POLICY IF EXISTS "Users can view own sessions; Admins can view all" ON public.user_sessions;
CREATE POLICY "Users can view own sessions; Admins can view all"
ON public.user_sessions FOR SELECT
USING (
    auth.uid() = user_id
    OR public.is_admin(auth.uid())
);

DROP POLICY IF EXISTS "Authenticated users can insert sessions" ON public.user_sessions;
CREATE POLICY "Authenticated users can insert sessions"
ON public.user_sessions FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own sessions; Admins can update all" ON public.user_sessions;
CREATE POLICY "Users can update own sessions; Admins can update all"
ON public.user_sessions FOR UPDATE
USING (
    auth.uid() = user_id
    OR public.is_admin(auth.uid())
);


-- -------------------------------------------------------
-- STEP 4: FIX ACTIVITY_LOGS RLS POLICIES
-- Servants need to write logs too
-- -------------------------------------------------------

DROP POLICY IF EXISTS "Admins/Moderators can view audit logs" ON public.activity_logs;
CREATE POLICY "Admins/Moderators can view audit logs"
ON public.activity_logs FOR SELECT
USING (
    public.is_admin(auth.uid())
);

DROP POLICY IF EXISTS "Authenticated users can insert activity logs" ON public.activity_logs;
CREATE POLICY "Authenticated users can insert activity logs"
ON public.activity_logs FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);


-- -------------------------------------------------------
-- STEP 5: FIX SERVICE TABLES RLS POLICIES (CRITICAL!)
-- This is the main cause of "no data fetching" in service dashboard
-- -------------------------------------------------------

-- service_lessons: Servants must be able to SELECT and INSERT/UPDATE/DELETE
DROP POLICY IF EXISTS "Allow auth read lessons" ON public.service_lessons;
DROP POLICY IF EXISTS "Allow admin manage lessons" ON public.service_lessons;

CREATE POLICY "Allow auth read lessons" 
ON public.service_lessons FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow servant manage lessons" 
ON public.service_lessons FOR ALL 
USING (public.is_servant(auth.uid()))
WITH CHECK (public.is_servant(auth.uid()));


-- service_quizzes: Servants must be able to SELECT and manage quizzes
DROP POLICY IF EXISTS "Allow auth read quizzes" ON public.service_quizzes;
DROP POLICY IF EXISTS "Allow admin manage quizzes" ON public.service_quizzes;

CREATE POLICY "Allow auth read quizzes" 
ON public.service_quizzes FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow servant manage quizzes" 
ON public.service_quizzes FOR ALL 
USING (public.is_servant(auth.uid()))
WITH CHECK (public.is_servant(auth.uid()));


-- service_student_progress: Servants must be able to read ALL student progress
DROP POLICY IF EXISTS "Allow user view own progress" ON public.service_student_progress;
DROP POLICY IF EXISTS "Allow user insert own progress" ON public.service_student_progress;
DROP POLICY IF EXISTS "Allow user update own progress" ON public.service_student_progress;

CREATE POLICY "Allow user or servant view progress" 
ON public.service_student_progress FOR SELECT 
USING (
    auth.uid() = user_id 
    OR public.is_servant(auth.uid())
);

CREATE POLICY "Allow user insert own progress" 
ON public.service_student_progress FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Allow user update own progress" 
ON public.service_student_progress FOR UPDATE 
USING (
    auth.uid() = user_id 
    OR public.is_servant(auth.uid())
);


-- service_attendance: Servants must be able to read ALL attendance and mark it
DROP POLICY IF EXISTS "Allow user view own attendance" ON public.service_attendance;
DROP POLICY IF EXISTS "Allow admin manage attendance" ON public.service_attendance;

CREATE POLICY "Allow user or servant view attendance" 
ON public.service_attendance FOR SELECT 
USING (
    auth.uid() = user_id 
    OR public.is_servant(auth.uid())
);

CREATE POLICY "Allow servant manage attendance" 
ON public.service_attendance FOR ALL 
USING (public.is_servant(auth.uid()))
WITH CHECK (public.is_servant(auth.uid()));


-- service_points_log: Servants must be able to read ALL points and add/modify
DROP POLICY IF EXISTS "Allow user view own points logs" ON public.service_points_log;
DROP POLICY IF EXISTS "Allow admin manage points logs" ON public.service_points_log;

CREATE POLICY "Allow user or servant view points" 
ON public.service_points_log FOR SELECT 
USING (
    auth.uid() = user_id 
    OR public.is_servant(auth.uid())
);

CREATE POLICY "Allow servant manage points" 
ON public.service_points_log FOR ALL 
USING (public.is_servant(auth.uid()))
WITH CHECK (public.is_servant(auth.uid()));


-- service_student_restrictions (if exists): Servants must be able to manage
DROP POLICY IF EXISTS "Allow auth read restrictions" ON public.service_student_restrictions;
DROP POLICY IF EXISTS "Allow admin manage restrictions" ON public.service_student_restrictions;

CREATE POLICY "Allow auth read restrictions"
ON public.service_student_restrictions FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Allow servant manage restrictions"
ON public.service_student_restrictions FOR ALL
USING (public.is_servant(auth.uid()))
WITH CHECK (public.is_servant(auth.uid()));


-- -------------------------------------------------------
-- STEP 6: FIX SITE CONTENT TABLE POLICIES
-- (mass_schedules, church_news, slideshow_images)
-- -------------------------------------------------------

DROP POLICY IF EXISTS "Allow public select on mass_schedules" ON public.mass_schedules;
DROP POLICY IF EXISTS "Allow admin manage on mass_schedules" ON public.mass_schedules;
CREATE POLICY "Allow public select on mass_schedules" ON public.mass_schedules FOR SELECT USING (true);
CREATE POLICY "Allow admin manage on mass_schedules" ON public.mass_schedules FOR ALL USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Allow public select on church_news" ON public.church_news;
DROP POLICY IF EXISTS "Allow admin manage on church_news" ON public.church_news;
CREATE POLICY "Allow public select on church_news" ON public.church_news FOR SELECT USING (true);
CREATE POLICY "Allow admin manage on church_news" ON public.church_news FOR ALL USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Allow public select on slideshow_images" ON public.slideshow_images;
DROP POLICY IF EXISTS "Allow admin manage on slideshow_images" ON public.slideshow_images;
CREATE POLICY "Allow public select on slideshow_images" ON public.slideshow_images FOR SELECT USING (true);
CREATE POLICY "Allow admin manage on slideshow_images" ON public.slideshow_images FOR ALL USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Allow public select on blocked_ips" ON public.blocked_ips;
DROP POLICY IF EXISTS "Allow admin manage on blocked_ips" ON public.blocked_ips;
CREATE POLICY "Allow public select on blocked_ips" ON public.blocked_ips FOR SELECT USING (true);
CREATE POLICY "Allow admin manage on blocked_ips" ON public.blocked_ips FOR ALL USING (public.is_admin(auth.uid()));


-- -------------------------------------------------------
-- STEP 7: GRANT ALL NECESSARY TABLE PERMISSIONS
-- -------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_lessons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_quizzes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_student_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_attendance TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_points_log TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_sessions TO authenticated;
GRANT INSERT ON public.activity_logs TO authenticated;
GRANT SELECT ON public.mass_schedules TO anon, authenticated;
GRANT SELECT ON public.church_news TO anon, authenticated;
GRANT SELECT ON public.slideshow_images TO anon, authenticated;
GRANT SELECT ON public.blocked_ips TO anon, authenticated;

-- Also grant to service_student_restrictions if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'service_student_restrictions' AND table_schema = 'public') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_student_restrictions TO authenticated';
    END IF;
END $$;


-- -------------------------------------------------------
-- STEP 8: VERIFY - Show current policies on service tables
-- (run these individually to confirm)
-- -------------------------------------------------------

-- SELECT schemaname, tablename, policyname, cmd, qual FROM pg_policies WHERE tablename LIKE 'service_%' ORDER BY tablename, policyname;
-- SELECT schemaname, tablename, policyname, cmd, qual FROM pg_policies WHERE tablename = 'profiles' ORDER BY policyname;

