-- =======================================================
-- ST. PETER AND PAUL CHURCH - SERVICE SYSTEM TABLES
-- Run this in your Supabase SQL Editor to initialize
-- the database for the student service dashboard.
-- =======================================================

-- 1. Add points column to public.profiles if not exists
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS points INT DEFAULT 0;

-- 2. Create service_lessons table
CREATE TABLE IF NOT EXISTS public.service_lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_year TEXT NOT NULL, -- e.g., 'الثالث الثانوي', 'KG1'
    category TEXT NOT NULL CHECK (category IN ('bible_study', 'coptic', 'hymns')),
    title TEXT NOT NULL,
    partition_name TEXT NOT NULL DEFAULT 'عام',
    audio_url TEXT,
    video_url TEXT,
    text_content TEXT,
    pdf_urls TEXT[], -- Array of PDF file paths or links
    points_listen INT DEFAULT 0,
    points_watch INT DEFAULT 0,
    points_quiz_question INT DEFAULT 0, -- Points awarded per correct answer
    min_pass_score INT DEFAULT 50, -- Percentage or count of correct questions required to pass
    hymns_mode TEXT DEFAULT 'both' CHECK (hymns_mode IN ('audio', 'video', 'both')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_service_lessons_class_year ON public.service_lessons(class_year);
CREATE INDEX IF NOT EXISTS idx_service_lessons_category ON public.service_lessons(category);

-- 3. Create service_quizzes table
CREATE TABLE IF NOT EXISTS public.service_quizzes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id UUID REFERENCES public.service_lessons(id) ON DELETE CASCADE UNIQUE,
    questions JSONB NOT NULL, -- Array of objects: [{"question": "...", "options": ["...", "..."], "correct_index": 0}]
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. Create service_student_progress table
CREATE TABLE IF NOT EXISTS public.service_student_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    lesson_id UUID REFERENCES public.service_lessons(id) ON DELETE CASCADE,
    last_position_audio DOUBLE PRECISION DEFAULT 0,
    last_position_video DOUBLE PRECISION DEFAULT 0,
    audio_completed BOOLEAN DEFAULT FALSE,
    video_completed BOOLEAN DEFAULT FALSE,
    quiz_completed BOOLEAN DEFAULT FALSE,
    quiz_score INT DEFAULT 0, -- Number of correct answers
    quiz_answers JSONB, -- Student selected options e.g. [1, 0, 2]
    audio_points_earned INT DEFAULT 0,
    video_points_earned INT DEFAULT 0,
    quiz_points_earned INT DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    UNIQUE(user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_student_progress_user ON public.service_student_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_student_progress_lesson ON public.service_student_progress(lesson_id);

-- 5. Create service_attendance table
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

-- 6. Create service_points_log table
CREATE TABLE IF NOT EXISTS public.service_points_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('attendance', 'quiz', 'audio_completion', 'video_completion', 'manual')),
    points INT NOT NULL,
    reference_id UUID, -- References lesson_id or attendance_id
    details TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_points_log_user ON public.service_points_log(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.service_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_student_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_points_log ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Allow auth read lessons" ON public.service_lessons;
DROP POLICY IF EXISTS "Allow admin manage lessons" ON public.service_lessons;
DROP POLICY IF EXISTS "Allow auth read quizzes" ON public.service_quizzes;
DROP POLICY IF EXISTS "Allow admin manage quizzes" ON public.service_quizzes;
DROP POLICY IF EXISTS "Allow user view own progress" ON public.service_student_progress;
DROP POLICY IF EXISTS "Allow user insert own progress" ON public.service_student_progress;
DROP POLICY IF EXISTS "Allow user update own progress" ON public.service_student_progress;
DROP POLICY IF EXISTS "Allow user view own attendance" ON public.service_attendance;
DROP POLICY IF EXISTS "Allow admin manage attendance" ON public.service_attendance;
DROP POLICY IF EXISTS "Allow user view own points logs" ON public.service_points_log;
DROP POLICY IF EXISTS "Allow admin manage points logs" ON public.service_points_log;

-- 7. RLS Policies
-- service_lessons
CREATE POLICY "Allow auth read lessons" ON public.service_lessons FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Allow admin manage lessons" ON public.service_lessons FOR ALL USING (public.is_admin(auth.uid()));

-- service_quizzes
CREATE POLICY "Allow auth read quizzes" ON public.service_quizzes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Allow admin manage quizzes" ON public.service_quizzes FOR ALL USING (public.is_admin(auth.uid()));

-- service_student_progress
CREATE POLICY "Allow user view own progress" ON public.service_student_progress FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "Allow user insert own progress" ON public.service_student_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Allow user update own progress" ON public.service_student_progress FOR UPDATE USING (auth.uid() = user_id);

-- service_attendance
CREATE POLICY "Allow user view own attendance" ON public.service_attendance FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "Allow admin manage attendance" ON public.service_attendance FOR ALL USING (public.is_admin(auth.uid()));

-- service_points_log
CREATE POLICY "Allow user view own points logs" ON public.service_points_log FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE POLICY "Allow admin manage points logs" ON public.service_points_log FOR ALL USING (public.is_admin(auth.uid()));


-- =======================================================
-- TRIGGERS & FUNCTIONS FOR AUTOMATIC POINTS & AUDITING
-- =======================================================

-- 8. Trigger to update profile points when points log changes
CREATE OR REPLACE FUNCTION public.update_profile_points()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        UPDATE public.profiles
        SET points = COALESCE(points, 0) + NEW.points
        WHERE id = NEW.user_id;
    ELSIF (TG_OP = 'DELETE') THEN
        UPDATE public.profiles
        SET points = COALESCE(points, 0) - OLD.points
        WHERE id = OLD.user_id;
    ELSIF (TG_OP = 'UPDATE') THEN
        UPDATE public.profiles
        SET points = COALESCE(points, 0) - OLD.points + NEW.points
        WHERE id = NEW.user_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_update_profile_points
AFTER INSERT OR UPDATE OR DELETE ON public.service_points_log
FOR EACH ROW EXECUTE FUNCTION public.update_profile_points();


-- 9. Trigger to auto-award points when progress is updated
CREATE OR REPLACE FUNCTION public.handle_student_progress_change()
RETURNS TRIGGER AS $$
DECLARE
    v_category TEXT;
    v_title TEXT;
    v_points_listen INT;
    v_points_watch INT;
    v_points_quiz_question INT;
    v_min_pass_score INT;
    v_points_earned INT := 0;
BEGIN
    -- Get lesson details
    SELECT category, title, points_listen, points_watch, points_quiz_question, min_pass_score
    INTO v_category, v_title, v_points_listen, v_points_watch, v_points_quiz_question, v_min_pass_score
    FROM public.service_lessons
    WHERE id = NEW.lesson_id;

    -- A. Audio Completion
    IF NEW.audio_completed = TRUE AND (OLD.audio_completed = FALSE OR OLD.audio_completed IS NULL) THEN
        IF v_points_listen > 0 THEN
            INSERT INTO public.service_points_log (user_id, type, points, reference_id, details)
            VALUES (NEW.user_id, 'audio_completion', v_points_listen, NEW.lesson_id, 'سماع فويس درس: ' || v_title);
            NEW.audio_points_earned := v_points_listen;
        END IF;
    END IF;

    -- B. Video Completion
    IF NEW.video_completed = TRUE AND (OLD.video_completed = FALSE OR OLD.video_completed IS NULL) THEN
        IF v_points_watch > 0 THEN
            INSERT INTO public.service_points_log (user_id, type, points, reference_id, details)
            VALUES (NEW.user_id, 'video_completion', v_points_watch, NEW.lesson_id, 'مشاهدة فيديو درس: ' || v_title);
            NEW.video_points_earned := v_points_watch;
        END IF;
    END IF;

    -- C. Quiz Completion
    IF NEW.quiz_completed = TRUE AND (OLD.quiz_completed = FALSE OR OLD.quiz_completed IS NULL) THEN
        -- Verify minimum pass score or calculate answers
        -- E.g. If it is Coptic language, pass only if they exceed minimum score
        -- If Bible Study, they get points per correct answer
        IF v_category = 'coptic' THEN
            -- Check if score (number of correct answers) meets the min_pass_score requirement
            IF NEW.quiz_score >= v_min_pass_score THEN
                v_points_earned := NEW.quiz_score * v_points_quiz_question;
                IF v_points_earned > 0 THEN
                    INSERT INTO public.service_points_log (user_id, type, points, reference_id, details)
                    VALUES (NEW.user_id, 'quiz', v_points_earned, NEW.lesson_id, 'اجتياز امتحان القبطي لدرس: ' || v_title);
                    NEW.quiz_points_earned := v_points_earned;
                END IF;
            END IF;
        ELSE -- Bible study or Hymns
            v_points_earned := NEW.quiz_score * v_points_quiz_question;
            IF v_points_earned > 0 THEN
                INSERT INTO public.service_points_log (user_id, type, points, reference_id, details)
                VALUES (NEW.user_id, 'quiz', v_points_earned, NEW.lesson_id, 'اجتياز امتحان درس الكتاب: ' || v_title);
                NEW.quiz_points_earned := v_points_earned;
            END IF;
        END IF;
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_handle_student_progress_change
BEFORE INSERT OR UPDATE ON public.service_student_progress
FOR EACH ROW EXECUTE FUNCTION public.handle_student_progress_change();


-- 10. Trigger to auto-log points when attendance is marked
CREATE OR REPLACE FUNCTION public.handle_attendance_points()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.service_points_log (user_id, type, points, reference_id, details)
        VALUES (NEW.user_id, 'attendance', NEW.points_earned, NEW.id, 'حضور الخدمة يوم ' || NEW.attended_date::text);
    ELSIF (TG_OP = 'DELETE') THEN
        DELETE FROM public.service_points_log
        WHERE reference_id = OLD.id AND type = 'attendance';
    ELSIF (TG_OP = 'UPDATE') THEN
        UPDATE public.service_points_log
        SET points = NEW.points_earned
        WHERE reference_id = NEW.id AND type = 'attendance';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_handle_attendance_points
AFTER INSERT OR UPDATE OR DELETE ON public.service_attendance
FOR EACH ROW EXECUTE FUNCTION public.handle_attendance_points();


-- =======================================================
-- SEED SAMPLE LESSONS & QUIZZES DATA FOR TESTING
-- =======================================================

-- Add Bible Study Lesson
INSERT INTO public.service_lessons (id, class_year, category, title, partition_name, audio_url, text_content, pdf_urls, points_listen, points_quiz_question)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'الثالث الثانوي',
    'bible_study',
    'دراسة إنجيل يوحنا - الإصحاح الأول',
    'إنجيل يوحنا',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    'في البدء كان الكلمة، والكلمة كان عند الله، وكان الكلمة الله. هذا كان في البدء عند الله. كل شيء به كان، وبغيره لم يكن شيء مما كان. فيه كانت الحياة، والحياة كانت نور الناس، والنور يضيء في الظلمة، والظلمة لم تدركه. كان إنسان مرسل من الله اسمه يوحنا. هذا جاء للشهادة لكي يشهد للنور، لكي يؤمن الكل بواسطته. لم يكن هو النور، بل ليشهد للنور...',
    ARRAY['https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'],
    15,
    5
) ON CONFLICT (id) DO NOTHING;

-- Add Bible Study Quiz
INSERT INTO public.service_quizzes (lesson_id, questions)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    '[
        {"question": "في البدء كان الكلمة، والكلمة كان عند...؟", "options": ["الآب", "الله", "الناس", "الملائكة"], "correct_index": 1},
        {"question": "من هو النبي الذي أرسل ليشهد للنور؟", "options": ["إيليا", "إشعياء", "يوحنا المعمدان", "إرميا"], "correct_index": 2},
        {"question": "الظلمة لم...؟", "options": ["تدركه", "تراه", "تحبه", "تقبله"], "correct_index": 0}
    ]'::jsonb
) ON CONFLICT (lesson_id) DO NOTHING;

-- Add Coptic Lesson
INSERT INTO public.service_lessons (id, class_year, category, title, partition_name, video_url, points_watch, points_quiz_question, min_pass_score)
VALUES (
    '22222222-2222-2222-2222-222222222222',
    'الثالث الثانوي',
    'coptic',
    'أساسيات الحروف القبطية - الجزء الأول',
    'قواعد اللغة القبطية',
    'https://www.youtube.com/embed/ntznB1dqWBs',
    20,
    5,
    2
) ON CONFLICT (id) DO NOTHING;

-- Add Coptic Quiz
INSERT INTO public.service_quizzes (lesson_id, questions)
VALUES (
    '22222222-2222-2222-2222-222222222222',
    '[
        {"question": "كم عدد الحروف القبطية الكلية؟", "options": ["24 حرف", "32 حرف", "7 حروف", "28 حرف"], "correct_index": 1},
        {"question": "حرف (الجنكم) يوضع فوق الحرف ليعطي صوت...؟", "options": ["الضم", "الكسر أو إي للمتحرك", "الفتح", "السكون"], "correct_index": 1},
        {"question": "أي من الحروف التالية يعتبر حرفاً متحركاً؟", "options": ["ألفا", "بيتا", "غما", "دلتا"], "correct_index": 0}
    ]'::jsonb
) ON CONFLICT (lesson_id) DO NOTHING;

-- Add Hymns Lesson (Audio only)
INSERT INTO public.service_lessons (id, class_year, category, title, partition_name, audio_url, pdf_urls, points_listen, hymns_mode)
VALUES (
    '33333333-3333-3333-3333-333333333333',
    'الثالث الثانوي',
    'hymns',
    'لحن أو أونوف (شيرى ماريا)',
    'ألحان سنوية',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    ARRAY['https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'],
    25,
    'audio'
) ON CONFLICT (id) DO NOTHING;

-- Add Hymns Lesson 2 (Video only)
INSERT INTO public.service_lessons (id, class_year, category, title, partition_name, video_url, pdf_urls, points_watch, hymns_mode)
VALUES (
    '44444444-4444-4444-4444-444444444444',
    'الثالث الثانوي',
    'hymns',
    'لحن بيك إثرونوس (عرشك يا الله)',
    'ألحان أدريبية وحزينة',
    'https://www.youtube.com/embed/ntznB1dqWBs',
    ARRAY['https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'],
    30,
    'video'
) ON CONFLICT (id) DO NOTHING;

-- Add Hymns Lesson 3 (Both Audio & Video)
INSERT INTO public.service_lessons (id, class_year, category, title, partition_name, audio_url, video_url, pdf_urls, points_listen, points_watch, hymns_mode)
VALUES (
    '55555555-5555-5555-5555-555555555555',
    'الثالث الثانوي',
    'hymns',
    'لحن تين ثينو (قوموا يا بني النور)',
    'ألحان كيهكية تسبحة',
    'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    'https://www.youtube.com/embed/ntznB1dqWBs',
    ARRAY['https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'],
    15,
    15,
    'both'
) ON CONFLICT (id) DO NOTHING;

