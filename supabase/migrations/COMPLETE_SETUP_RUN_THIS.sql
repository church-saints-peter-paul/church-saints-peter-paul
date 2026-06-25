-- =======================================================
-- ST. PETER AND PAUL CHURCH - COMPLETE DATABASE SETUP
-- Run this ONCE in your Supabase SQL Editor to fix ALL issues.
-- It is safe to run multiple times (uses IF NOT EXISTS / OR REPLACE).
-- =======================================================


-- -------------------------------------------------------
-- PART 1: SECURITY HELPER FUNCTIONS
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
-- PART 2: PROFILES TABLE - FIX RLS POLICIES
-- -------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

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

GRANT SELECT ON public.profiles TO authenticated;
GRANT INSERT, UPDATE ON public.profiles TO authenticated;


-- -------------------------------------------------------
-- PART 3: USER_SESSIONS TABLE - FIX RLS POLICIES
-- -------------------------------------------------------

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

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

GRANT SELECT, INSERT, UPDATE ON public.user_sessions TO authenticated;


-- -------------------------------------------------------
-- PART 4: ACTIVITY_LOGS - FIX RLS
-- -------------------------------------------------------

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins/Moderators can view audit logs" ON public.activity_logs;
CREATE POLICY "Admins/Moderators can view audit logs"
ON public.activity_logs FOR SELECT
USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can insert activity logs" ON public.activity_logs;
CREATE POLICY "Authenticated users can insert activity logs"
ON public.activity_logs FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

GRANT INSERT ON public.activity_logs TO authenticated;


-- -------------------------------------------------------
-- PART 5: PUBLIC CONTENT TABLES (mass_schedules, church_news, etc.)
-- -------------------------------------------------------

ALTER TABLE public.mass_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.church_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slideshow_images ENABLE ROW LEVEL SECURITY;

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

GRANT SELECT ON public.mass_schedules TO anon, authenticated;
GRANT SELECT ON public.church_news TO anon, authenticated;
GRANT SELECT ON public.slideshow_images TO anon, authenticated;


-- -------------------------------------------------------
-- PART 6: BLOCKED IPS TABLE
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.blocked_ips (
    ip_address TEXT PRIMARY KEY,
    blocked_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    reason TEXT
);

ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public select on blocked_ips" ON public.blocked_ips;
DROP POLICY IF EXISTS "Allow admin manage on blocked_ips" ON public.blocked_ips;
CREATE POLICY "Allow public select on blocked_ips" ON public.blocked_ips FOR SELECT USING (true);
CREATE POLICY "Allow admin manage on blocked_ips" ON public.blocked_ips FOR ALL USING (public.is_admin(auth.uid()));

GRANT SELECT ON public.blocked_ips TO anon, authenticated;


-- -------------------------------------------------------
-- PART 7: ADD MISSING COLUMNS TO PROFILES
-- -------------------------------------------------------

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS class_year TEXT DEFAULT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS points INT DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plain_password TEXT DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS dob TEXT DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS online_status BOOLEAN DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE;


-- -------------------------------------------------------
-- PART 8: SERVICE SYSTEM TABLES (جداول نظام الخدمة)
-- -------------------------------------------------------

-- service_lessons
CREATE TABLE IF NOT EXISTS public.service_lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_year TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('bible_study', 'coptic', 'hymns')),
    title TEXT NOT NULL,
    partition_name TEXT NOT NULL DEFAULT 'عام',
    audio_url TEXT,
    video_url TEXT,
    text_content TEXT,
    pdf_urls TEXT[],
    points_listen INT DEFAULT 0,
    points_watch INT DEFAULT 0,
    points_quiz_question INT DEFAULT 0,
    min_pass_score INT DEFAULT 50,
    hymns_mode TEXT DEFAULT 'both' CHECK (hymns_mode IN ('audio', 'video', 'both')),
    quiz_locked BOOLEAN DEFAULT FALSE,
    quiz_lock_timer TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    allow_scrubbing BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_service_lessons_class_year ON public.service_lessons(class_year);
CREATE INDEX IF NOT EXISTS idx_service_lessons_category ON public.service_lessons(category);

-- service_quizzes
CREATE TABLE IF NOT EXISTS public.service_quizzes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id UUID REFERENCES public.service_lessons(id) ON DELETE CASCADE UNIQUE,
    questions JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- service_student_progress
CREATE TABLE IF NOT EXISTS public.service_student_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    lesson_id UUID REFERENCES public.service_lessons(id) ON DELETE CASCADE,
    last_position_audio DOUBLE PRECISION DEFAULT 0,
    last_position_video DOUBLE PRECISION DEFAULT 0,
    audio_completed BOOLEAN DEFAULT FALSE,
    video_completed BOOLEAN DEFAULT FALSE,
    quiz_completed BOOLEAN DEFAULT FALSE,
    quiz_score INT DEFAULT 0,
    quiz_answers JSONB,
    audio_points_earned INT DEFAULT 0,
    video_points_earned INT DEFAULT 0,
    quiz_points_earned INT DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_student_progress_user ON public.service_student_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_student_progress_lesson ON public.service_student_progress(lesson_id);

-- service_attendance
CREATE TABLE IF NOT EXISTS public.service_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    attended_date DATE DEFAULT CURRENT_DATE NOT NULL,
    points_earned INT DEFAULT 0,
    marked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(user_id, attended_date)
);

CREATE INDEX IF NOT EXISTS idx_service_attendance_user ON public.service_attendance(user_id);

-- service_points_log
CREATE TABLE IF NOT EXISTS public.service_points_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('attendance', 'quiz', 'audio_completion', 'video_completion', 'manual')),
    points INT NOT NULL,
    reference_id UUID,
    details TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_points_log_user ON public.service_points_log(user_id);

-- service_student_restrictions
CREATE TABLE IF NOT EXISTS public.service_student_restrictions (
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    lesson_id UUID REFERENCES public.service_lessons(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    PRIMARY KEY (user_id, lesson_id)
);


-- -------------------------------------------------------
-- PART 9: ENABLE RLS ON SERVICE TABLES
-- -------------------------------------------------------

ALTER TABLE public.service_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_student_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_points_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_student_restrictions ENABLE ROW LEVEL SECURITY;


-- -------------------------------------------------------
-- PART 10: SERVICE TABLES RLS POLICIES (SERVANT ACCESS)
-- -------------------------------------------------------

-- service_lessons
DROP POLICY IF EXISTS "Allow auth read lessons" ON public.service_lessons;
DROP POLICY IF EXISTS "Allow admin manage lessons" ON public.service_lessons;
DROP POLICY IF EXISTS "Allow servant manage lessons" ON public.service_lessons;
CREATE POLICY "Allow auth read lessons" ON public.service_lessons FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Allow servant manage lessons" ON public.service_lessons FOR ALL USING (public.is_servant(auth.uid())) WITH CHECK (public.is_servant(auth.uid()));

-- service_quizzes
DROP POLICY IF EXISTS "Allow auth read quizzes" ON public.service_quizzes;
DROP POLICY IF EXISTS "Allow admin manage quizzes" ON public.service_quizzes;
DROP POLICY IF EXISTS "Allow servant manage quizzes" ON public.service_quizzes;
CREATE POLICY "Allow auth read quizzes" ON public.service_quizzes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Allow servant manage quizzes" ON public.service_quizzes FOR ALL USING (public.is_servant(auth.uid())) WITH CHECK (public.is_servant(auth.uid()));

-- service_student_progress
DROP POLICY IF EXISTS "Allow user view own progress" ON public.service_student_progress;
DROP POLICY IF EXISTS "Allow user or servant view progress" ON public.service_student_progress;
DROP POLICY IF EXISTS "Allow user insert own progress" ON public.service_student_progress;
DROP POLICY IF EXISTS "Allow user update own progress" ON public.service_student_progress;
CREATE POLICY "Allow user or servant view progress" ON public.service_student_progress FOR SELECT USING (auth.uid() = user_id OR public.is_servant(auth.uid()));
CREATE POLICY "Allow user insert own progress" ON public.service_student_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Allow user update own progress" ON public.service_student_progress FOR UPDATE USING (auth.uid() = user_id OR public.is_servant(auth.uid()));

-- service_attendance
DROP POLICY IF EXISTS "Allow user view own attendance" ON public.service_attendance;
DROP POLICY IF EXISTS "Allow user or servant view attendance" ON public.service_attendance;
DROP POLICY IF EXISTS "Allow admin manage attendance" ON public.service_attendance;
DROP POLICY IF EXISTS "Allow servant manage attendance" ON public.service_attendance;
CREATE POLICY "Allow user or servant view attendance" ON public.service_attendance FOR SELECT USING (auth.uid() = user_id OR public.is_servant(auth.uid()));
CREATE POLICY "Allow servant manage attendance" ON public.service_attendance FOR ALL USING (public.is_servant(auth.uid())) WITH CHECK (public.is_servant(auth.uid()));

-- service_points_log
DROP POLICY IF EXISTS "Allow user view own points logs" ON public.service_points_log;
DROP POLICY IF EXISTS "Allow user or servant view points" ON public.service_points_log;
DROP POLICY IF EXISTS "Allow admin manage points logs" ON public.service_points_log;
DROP POLICY IF EXISTS "Allow servant manage points" ON public.service_points_log;
CREATE POLICY "Allow user or servant view points" ON public.service_points_log FOR SELECT USING (auth.uid() = user_id OR public.is_servant(auth.uid()));
CREATE POLICY "Allow servant manage points" ON public.service_points_log FOR ALL USING (public.is_servant(auth.uid())) WITH CHECK (public.is_servant(auth.uid()));

-- service_student_restrictions
DROP POLICY IF EXISTS "Allow auth read restrictions" ON public.service_student_restrictions;
DROP POLICY IF EXISTS "Allow admin manage restrictions" ON public.service_student_restrictions;
CREATE POLICY "Allow auth read restrictions" ON public.service_student_restrictions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Allow admin manage restrictions" ON public.service_student_restrictions FOR ALL USING (public.is_servant(auth.uid())) WITH CHECK (public.is_servant(auth.uid()));


-- -------------------------------------------------------
-- PART 11: GRANT TABLE PERMISSIONS
-- -------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_lessons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_quizzes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_student_progress TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_attendance TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_points_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_student_restrictions TO authenticated;


-- -------------------------------------------------------
-- PART 12: TRIGGERS FOR AUTOMATIC POINTS TRACKING
-- -------------------------------------------------------

-- Trigger: update profile total points on points log change
CREATE OR REPLACE FUNCTION public.update_profile_points()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE public.profiles SET points = COALESCE(points, 0) + NEW.points WHERE id = NEW.user_id;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE public.profiles SET points = COALESCE(points, 0) - OLD.points WHERE id = OLD.user_id;
    ELSIF (TG_OP = 'UPDATE') THEN
        UPDATE public.profiles SET points = COALESCE(points, 0) - OLD.points + NEW.points WHERE id = NEW.user_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_profile_points ON public.service_points_log;
CREATE TRIGGER trg_update_profile_points
AFTER INSERT OR UPDATE OR DELETE ON public.service_points_log
FOR EACH ROW EXECUTE FUNCTION public.update_profile_points();


-- Trigger: auto-award points when attendance is marked
CREATE OR REPLACE FUNCTION public.handle_attendance_points()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.service_points_log (user_id, type, points, reference_id, details)
        VALUES (NEW.user_id, 'attendance', NEW.points_earned, NEW.id, 'حضور الخدمة يوم ' || NEW.attended_date::text);
    ELSIF (TG_OP = 'DELETE') THEN
        DELETE FROM public.service_points_log WHERE reference_id = OLD.id AND type = 'attendance';
    ELSIF (TG_OP = 'UPDATE') THEN
        UPDATE public.service_points_log SET points = NEW.points_earned WHERE reference_id = NEW.id AND type = 'attendance';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_handle_attendance_points ON public.service_attendance;
CREATE TRIGGER trg_handle_attendance_points
AFTER INSERT OR UPDATE OR DELETE ON public.service_attendance
FOR EACH ROW EXECUTE FUNCTION public.handle_attendance_points();


-- -------------------------------------------------------
-- PART 13: ADMIN FUNCTIONS
-- -------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_reset_user_password(target_user_id UUID, new_password TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('اب كاهن', 'امين خدمه', 'خادم')) THEN
    UPDATE auth.users SET encrypted_password = crypt(new_password, gen_salt('bf')) WHERE id = target_user_id;
    UPDATE public.profiles SET plain_password = new_password WHERE id = target_user_id;
    INSERT INTO public.activity_logs (user_id, action, details)
    VALUES (auth.uid(), 'reset_password', 'تم إعادة تعيين كلمة المرور بنجاح للمستخدم ذو المعرف: ' || target_user_id);
    RETURN TRUE;
  ELSE
    RAISE EXCEPTION 'غير مصرح لك بإعادة تعيين كلمات مرور المستخدمين.';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('اب كاهن', 'امين خدمه', 'خادم')) THEN
    DELETE FROM auth.users WHERE id = target_user_id;
    INSERT INTO public.activity_logs (user_id, action, details)
    VALUES (auth.uid(), 'delete_user', 'تم حذف حساب المستخدم بشكل نهائي، المعرف: ' || target_user_id);
    RETURN TRUE;
  ELSE
    RAISE EXCEPTION 'غير مصرح لك بحذف المستخدمين من النظام.';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- -------------------------------------------------------
-- PART 14: PROGRESS AUTOMATIC POINTS TRIGGER
-- -------------------------------------------------------

-- Trigger: auto-award points when student progress (audio/video/quiz) is updated/completed
CREATE OR REPLACE FUNCTION public.handle_student_progress_points()
RETURNS TRIGGER AS $$
DECLARE
    v_points_listen INT;
    v_points_watch INT;
    v_points_quiz_question INT;
    v_min_pass_score INT;
    v_category TEXT;
    v_quiz_points INT := 0;
    v_title TEXT;
    v_old_audio_completed BOOLEAN := FALSE;
    v_old_video_completed BOOLEAN := FALSE;
    v_old_quiz_completed BOOLEAN := FALSE;
BEGIN
    -- Ensure NEW.id is generated for before-insert reference constraints
    IF NEW.id IS NULL THEN
        NEW.id := gen_random_uuid();
    END IF;

    -- Get lesson details
    SELECT points_listen, points_watch, points_quiz_question, min_pass_score, category, title
    INTO v_points_listen, v_points_watch, v_points_quiz_question, v_min_pass_score, v_category, v_title
    FROM public.service_lessons
    WHERE id = NEW.lesson_id;

    -- Safely read OLD values only during UPDATE operations
    IF TG_OP = 'UPDATE' THEN
        v_old_audio_completed := COALESCE(OLD.audio_completed, FALSE);
        v_old_video_completed := COALESCE(OLD.video_completed, FALSE);
        v_old_quiz_completed := COALESCE(OLD.quiz_completed, FALSE);
    END IF;

    -- 1. Handle Audio Completion
    IF NEW.audio_completed = TRUE AND v_old_audio_completed = FALSE THEN
        IF NEW.audio_points_earned = 0 AND v_points_listen > 0 THEN
            NEW.audio_points_earned := v_points_listen;
            INSERT INTO public.service_points_log (user_id, type, points, reference_id, details)
            VALUES (NEW.user_id, 'audio_completion', v_points_listen, NEW.id, 'سماع فويس درس: ' || COALESCE(v_title, 'بدون عنوان'));
        END IF;
    END IF;

    -- 2. Handle Video Completion
    IF NEW.video_completed = TRUE AND v_old_video_completed = FALSE THEN
        IF NEW.video_points_earned = 0 AND v_points_watch > 0 THEN
            NEW.video_points_earned := v_points_watch;
            INSERT INTO public.service_points_log (user_id, type, points, reference_id, details)
            VALUES (NEW.user_id, 'video_completion', v_points_watch, NEW.id, 'مشاهدة فيديو درس: ' || COALESCE(v_title, 'بدون عنوان'));
        END IF;
    END IF;

    -- 3. Handle Quiz Completion
    IF NEW.quiz_completed = TRUE AND v_old_quiz_completed = FALSE THEN
        IF NEW.quiz_points_earned = 0 AND v_points_quiz_question > 0 AND NEW.quiz_score > 0 THEN
            -- Calculate points based on category pass rules
            IF v_category = 'coptic' THEN
                IF NEW.quiz_score >= v_min_pass_score THEN
                    v_quiz_points := NEW.quiz_score * v_points_quiz_question;
                ELSE
                    v_quiz_points := 0;
                END IF;
            ELSE
                v_quiz_points := NEW.quiz_score * v_points_quiz_question;
            END IF;

            IF v_quiz_points > 0 THEN
                NEW.quiz_points_earned := v_quiz_points;
                INSERT INTO public.service_points_log (user_id, type, points, reference_id, details)
                VALUES (NEW.user_id, 'quiz', v_quiz_points, NEW.id, 'اجتياز امتحان درس: ' || COALESCE(v_title, 'بدون عنوان'));
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_handle_student_progress_points ON public.service_student_progress;
DROP TRIGGER IF EXISTS trg_handle_student_progress_change ON public.service_student_progress;
DROP FUNCTION IF EXISTS public.handle_student_progress_change();

CREATE TRIGGER trg_handle_student_progress_points
BEFORE INSERT OR UPDATE ON public.service_student_progress
FOR EACH ROW EXECUTE FUNCTION public.handle_student_progress_points();


-- -------------------------------------------------------
-- DONE! All tables, policies, and functions are set up.
-- -------------------------------------------------------
