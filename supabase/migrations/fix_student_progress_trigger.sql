-- Fix handle_student_progress_points trigger function to support INSERT/UPSERT operations without referencing the unassigned OLD record.
-- Also cleans up any old trigger configurations and ensures columns exist.

-- 1. Ensure the quiz_answers column exists
ALTER TABLE public.service_student_progress ADD COLUMN IF NOT EXISTS quiz_answers JSONB;

-- 2. Clean up old triggers to avoid conflict or duplicate executions
DROP TRIGGER IF EXISTS trg_handle_student_progress_change ON public.service_student_progress;
DROP TRIGGER IF EXISTS trg_handle_student_progress_points ON public.service_student_progress;

-- 3. Clean up old function names if they exist
DROP FUNCTION IF EXISTS public.handle_student_progress_change();
DROP FUNCTION IF EXISTS public.handle_student_progress_points();

-- 4. Create the corrected trigger function
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

-- 5. Bind the trigger to the table
CREATE TRIGGER trg_handle_student_progress_points
BEFORE INSERT OR UPDATE ON public.service_student_progress
FOR EACH ROW EXECUTE FUNCTION public.handle_student_progress_points();
