// =======================================================
// ST. PETER AND PAUL CHURCH - SERVICE SYSTEM SCRIPT
// =======================================================

let currentUser = null;
let currentProfile = null;
let lessonsData = [];
let progressData = [];
let pointsLogs = [];
let attendanceLogs = [];
let restrictionsData = [];

// Video/Audio Tracking Variables
let currentMediaElement = null;
let ytPlayer = null;
let highestTimeListened = 0;
let positionSaveInterval = null;
let currentTrackingLessonId = null;
let currentTrackingCategory = null;

// Navigation SPA states
let currentView = 'dashboard';
let currentCategory = null;
let currentLessonId = null;

// Quiz State
let quizQuestions = [];
let currentQuestionIndex = 0;
let correctAnswersCount = 0;
let currentQuizLessonId = null;
let currentQuizCategory = null;
let studentQuizAnswers = [];

// Calendar State
let calendarDate = new Date();

// Initialize on DOM Load
window.addEventListener('DOMContentLoaded', async () => {
    // Initialize Supabase Auth Check
    await checkPageAuth();
    
    // Set up Modals and Buttons
    setupModalHandlers();
    
    // Set up Edit Profile Events
    initEditProfileEvents();
    
    // Initially force dashboard view
    navigateToDashboard();
});

// --- Auth Guard ---
async function checkPageAuth() {
    showAppLoading(true, true);
    try {
        const result = await authService.checkAuth();
        if (!result) {
            // Redirect to login if not authenticated
            window.location.href = "../login.html";
            return;
        }
        
        currentUser = result.session.user;
        currentProfile = result.profile;
        
        if (currentProfile.role !== 'مخدوم') {
            showToast("⚠️ غير مصرح بالدخول لغير المخدومين.", "warning");
            setTimeout(() => {
                window.location.href = "../index.html";
            }, 2000);
            return;
        }

        // Initialize User Details
        initStudentProfile();
        
        // Fetch all Data
        await reloadAllData();

        // Start background silent refresh every 90 seconds
        setInterval(silentRefreshData, 90_000);

    } catch (err) {
        console.error("Auth initialization error:", err);
        showToast("فشل التحقق من صلاحيات الدخول.", "error");
        window.location.href = "../login.html";
    } finally {
        showAppLoading(false, true);
    }
}

// --- Init Profile & Code Generation ---
function initStudentProfile() {
    document.getElementById('studentName').textContent = currentProfile.full_name;
    document.getElementById('studentGrade').textContent = `فصل: ${currentProfile.class_year || 'غير محدد'}`;
    document.getElementById('totalPoints').textContent = currentProfile.points || 0;

    // Load Profile Picture if set
    const avatarContainer = document.getElementById('studentAvatarContainer');
    if (avatarContainer) {
        if (currentProfile.avatar_url) {
            avatarContainer.innerHTML = `<img src="${currentProfile.avatar_url}" alt="صورة المخدوم" class="student-avatar-img">`;
        } else {
            avatarContainer.innerHTML = `<i class="fas fa-user-graduate" id="studentDefaultAvatarIcon"></i>`;
        }
    }

    // Set up avatar upload change event listener
    const avatarInput = document.getElementById('studentAvatarFile');
    if (avatarInput && !avatarInput.dataset.listenerBound) {
        avatarInput.dataset.listenerBound = 'true';
        avatarInput.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;

            // Validate file size (max 5MB)
            if (file.size > 5 * 1024 * 1024) {
                showToast("⚠️ حجم الصورة كبير جداً. يجب أن يكون أقل من 5 ميجابايت.", "warning");
                return;
            }

            showAppLoading(true);
            try {
                // Upload avatar to Cloudflare (or base64 fallback)
                const imageUrl = await authService.uploadFileToCloudflare(file, 'avatar');
                
                // Update Supabase profiles table
                const { error } = await supabaseClient
                    .from('profiles')
                    .update({ avatar_url: imageUrl })
                    .eq('id', currentUser.id);

                if (error) throw error;

                // Sync locally and update UI
                currentProfile.avatar_url = imageUrl;
                if (avatarContainer) {
                    avatarContainer.innerHTML = `<img src="${imageUrl}" alt="صورة المخدوم" class="student-avatar-img">`;
                }
                showToast("🎉 تم تحديث صورتك الشخصية بنجاح!", "success");

            } catch (err) {
                console.error("Failed to update avatar photo:", err);
                showToast("حدث خطأ أثناء تحميل الصورة الشخصية.", "error");
            } finally {
                showAppLoading(false);
            }
        });
    }

    // Generate Code: DDMM + Last 2 Digits of Phone
    let code = "000000";
    if (currentProfile.dob) {
        const parts = currentProfile.dob.split('-');
        if (parts.length === 3) {
            const month = parts[1].padStart(2, '0');
            const day = parts[2].padStart(2, '0');
            const phoneStr = (currentProfile.phone || '').trim();
            const phoneSuffix = phoneStr.slice(-2).padStart(2, '0');
            code = day + month + phoneSuffix;
        }
    }
    
    document.getElementById('studentCode').textContent = code;
    document.getElementById('qrCodeValue').textContent = code;
    
    // Generate QR Code
    document.getElementById('qrcode').innerHTML = '';
    new QRCode(document.getElementById('qrcode'), {
        text: code,
        width: 220,
        height: 220,
        colorDark: '#d4a017', // Luxury Gold
        colorLight: '#0f1f33', // Deep Blue Matching dark theme card
        correctLevel: QRCode.CorrectLevel.H
    });
}

// --- Fetch Data ---
async function reloadAllData() {
    if (!currentUser) return;
    
    try {
        console.log("📚 Loading data for user:", currentUser.id, "class_year:", currentProfile.class_year);
        
        // Fetch Lessons for this student's grade
        let lessonsQuery = supabaseClient
            .from('service_lessons')
            .select('*')
            .order('created_at', { ascending: true });
        
        // Only filter by class_year if it's defined
        if (currentProfile.class_year) {
            lessonsQuery = lessonsQuery.eq('class_year', currentProfile.class_year);
        }
        
        const { data: lessons, error: lessonsErr } = await lessonsQuery;
            
        if (lessonsErr) throw lessonsErr;
        lessonsData = lessons || [];
        console.log(`✅ Lessons loaded: ${lessonsData.length} lessons`);
        
        if (lessonsData.length === 0 && !currentProfile.class_year) {
            showToast("⚠️ لم يتم تحديد الصف الدراسي لحسابك. تواصل مع الخادم.", "warning");
        }

        // Fetch Student Progress
        const { data: progress, error: progErr } = await supabaseClient
            .from('service_student_progress')
            .select('*')
            .eq('user_id', currentUser.id);
            
        if (progErr) throw progErr;
        progressData = progress || [];

        // Fetch Points Logs
        const { data: logs, error: logsErr } = await supabaseClient
            .from('service_points_log')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });
            
        if (logsErr) throw logsErr;
        pointsLogs = logs || [];

        // Fetch Attendance records
        const { data: atts, error: attsErr } = await supabaseClient
            .from('service_attendance')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('attended_date', { ascending: false });
            
        if (attsErr) throw attsErr;
        attendanceLogs = atts || [];

        // Fetch Student Restrictions (locks)
        try {
            const { data: restrictions, error: restErr } = await supabaseClient
                .from('service_student_restrictions')
                .select('*')
                .eq('user_id', currentUser.id);
            if (restErr) throw restErr;
            restrictionsData = restrictions || [];
        } catch (e) {
            console.warn("Could not load student restrictions:", e.message || e);
            restrictionsData = [];
        }

        // Re-render UI
        updatePointsDisplay();
        renderLessons();
        renderProgressIndicators();

    } catch (err) {
        console.error("Error loading service data:", err);
        showToast("خطأ أثناء تحميل بيانات المنهج من السحابة.", "error");
    }
}

// --- SPA Virtual Views Navigation System ---
window.navigateToView = function(viewName) {
    const views = document.querySelectorAll('.virtual-view');
    views.forEach(v => v.classList.remove('active'));
    
    const targetView = document.getElementById(viewName);
    if (targetView) {
        targetView.classList.add('active');
    }
    
    // Cleanup active player instances on view changes
    cleanupMediaPlayers();
};

window.navigateToDashboard = function() {
    currentView = 'dashboard';
    currentCategory = null;
    currentLessonId = null;
    navigateToView('dashboardView');
    
    // Refresh dashboard statistics and mini progress bars
    renderProgressIndicators();
};

window.openCategoryView = function(category) {
    currentView = 'category';
    currentCategory = category;
    currentLessonId = null;
    
    // Update category titles and icons dynamically
    const headerTitle = document.getElementById('categoryHeaderTitle');
    const headerIcon = document.getElementById('categoryHeaderIcon');
    
    if (headerIcon) {
        if (category === 'bible_study') {
            headerTitle.textContent = 'منهج درس الكتاب الروحي';
            headerIcon.outerHTML = `<i class="fas fa-book-open text-gold" id="categoryHeaderIcon"></i>`;
        } else if (category === 'coptic') {
            headerTitle.textContent = 'منهج دروس اللغة القبطية';
            headerIcon.outerHTML = `
                <svg id="categoryHeaderIcon" class="svg-icon-coptic text-gold" viewBox="0 0 100 100" style="width: 1.5em; height: 1.5em; fill: none; stroke: currentColor; stroke-width: 8; stroke-linecap: round; stroke-linejoin: round; vertical-align: middle;">
                    <circle cx="45" cy="55" r="25" />
                    <path d="M70 25 L70 80 C70 88, 82 85, 85 80" />
                    <path d="M70 25 C70 20, 55 18, 45 22" />
                </svg>
            `;
        } else if (category === 'hymns') {
            headerTitle.textContent = 'مدرسة الألحان والتسبحة الكنسية';
            headerIcon.outerHTML = `
                <svg id="categoryHeaderIcon" class="svg-icon-hymns text-gold" viewBox="0 0 100 100" style="width: 1.5em; height: 1.5em; fill: none; stroke: currentColor; stroke-width: 6; stroke-linecap: round; stroke-linejoin: round; vertical-align: middle;">
                    <path d="M 70 15 L 92 55 L 52 55 L 68 17" />
                    <path d="M 86 18 L 74 38" />
                    <circle cx="38" cy="62" r="20" style="fill: #0d1b2f; stroke-width: 6;" />
                    <circle cx="18" cy="62" r="3.5" style="fill: var(--gold-primary); stroke: none;" />
                    <circle cx="38" cy="82" r="3.5" style="fill: var(--gold-primary); stroke: none;" />
                    <circle cx="24" cy="48" r="3.5" style="fill: var(--gold-primary); stroke: none;" />
                    <circle cx="52" cy="76" r="3.5" style="fill: var(--gold-primary); stroke: none;" />
                </svg>
            `;
        }
    }
    
    navigateToView('categoryView');
    
    // Sync progress indicators for SPA navigation
    renderProgressIndicators();
    
    // Draw lessons for this category
    renderLessons();
};

window.navigateToCategory = function() {
    if (currentCategory) {
        openCategoryView(currentCategory);
    } else {
        navigateToDashboard();
    }
};

window.openLessonDetailView = function(lessonId) {
    const restriction = restrictionsData.find(r => r.lesson_id === lessonId);
    if (restriction && restriction.lesson_locked) {
        showToast("⚠️ هذا الدرس مغلق حالياً من قِبل الخادم.", "warning");
        return;
    }

    currentView = 'lesson';
    currentLessonId = lessonId;
    navigateToView('lessonView');
    
    renderLessonDetails(lessonId);
};

// Update Points Header Counter
function updatePointsDisplay() {
    // Sum logs to verify or use profile points
    const profilePoints = pointsLogs.reduce((sum, log) => sum + log.points, 0);
    document.getElementById('totalPoints').textContent = profilePoints;
}

// Compute Completion Rates (Global & Category Specifics)
function renderProgressIndicators() {
    if (lessonsData.length === 0) {
        document.getElementById('completionProgressBar').style.width = '0%';
        document.getElementById('completionProgressText').textContent = '0%';
        return;
    }
    
    // Global and category metrics
    let globalTotal = 0;
    let globalCompleted = 0;
    
    const catStats = {
        bible_study: { total: 0, completed: 0 },
        coptic: { total: 0, completed: 0 },
        hymns: { total: 0, completed: 0 }
    };
    
    // Detailed counts for bubble stats
    let totalAudios = 0;
    let completedAudios = 0;
    let totalVideos = 0;
    let completedVideos = 0;
    let totalQuizzes = 0;
    let completedQuizzes = 0;
    
    lessonsData.forEach(lesson => {
        const progress = progressData.find(p => p.lesson_id === lesson.id);
        const cat = lesson.category;
        
        if (cat === 'bible_study') {
            // Audio + Quiz
            globalTotal += 2;
            catStats.bible_study.total += 2;
            
            totalAudios++;
            totalQuizzes++;
            
            if (progress) {
                if (progress.audio_completed) {
                    globalCompleted++;
                    catStats.bible_study.completed++;
                    completedAudios++;
                }
                if (progress.quiz_completed) {
                    globalCompleted++;
                    catStats.bible_study.completed++;
                    completedQuizzes++;
                }
            }
        } else if (cat === 'coptic') {
            // Video + Quiz
            globalTotal += 2;
            catStats.coptic.total += 2;
            
            totalVideos++;
            totalQuizzes++;
            
            if (progress) {
                if (progress.video_completed) {
                    globalCompleted++;
                    catStats.coptic.completed++;
                    completedVideos++;
                }
                if (progress.quiz_completed) {
                    globalCompleted++;
                    catStats.coptic.completed++;
                    completedQuizzes++;
                }
            }
        } else if (cat === 'hymns') {
            if (lesson.hymns_mode === 'both') {
                globalTotal += 2;
                catStats.hymns.total += 2;
                totalAudios++;
                totalVideos++;
                if (progress) {
                    if (progress.audio_completed) {
                        globalCompleted++;
                        catStats.hymns.completed++;
                        completedAudios++;
                    }
                    if (progress.video_completed) {
                        globalCompleted++;
                        catStats.hymns.completed++;
                        completedVideos++;
                    }
                }
            } else if (lesson.hymns_mode === 'audio') {
                globalTotal += 1;
                catStats.hymns.total += 1;
                totalAudios++;
                if (progress) {
                    if (progress.audio_completed) {
                        globalCompleted++;
                        catStats.hymns.completed++;
                        completedAudios++;
                    }
                }
            } else if (lesson.hymns_mode === 'video') {
                globalTotal += 1;
                catStats.hymns.total += 1;
                totalVideos++;
                if (progress) {
                    if (progress.video_completed) {
                        globalCompleted++;
                        catStats.hymns.completed++;
                        completedVideos++;
                    }
                }
            }
        }
    });

    // 1. Global Progress
    const globalRate = globalTotal > 0 ? Math.round((globalCompleted / globalTotal) * 100) : 0;
    document.getElementById('completionProgressBar').style.width = `${globalRate}%`;
    document.getElementById('completionProgressText').textContent = `${globalRate}%`;

    // 2. Sub-metrics bubble stats
    document.getElementById('stat_audio_count').textContent = `${completedAudios} من أصل ${totalAudios} فويسات`;
    document.getElementById('stat_video_count').textContent = `${completedVideos} من أصل ${totalVideos} فيديوهات`;
    document.getElementById('stat_quiz_count').textContent = `${completedQuizzes} من أصل ${totalQuizzes} امتحانات`;

    // 3. Mini Progress Bars inside cards
    const bsRate = catStats.bible_study.total > 0 ? Math.round((catStats.bible_study.completed / catStats.bible_study.total) * 100) : 0;
    const copRate = catStats.coptic.total > 0 ? Math.round((catStats.coptic.completed / catStats.coptic.total) * 100) : 0;
    const hymRate = catStats.hymns.total > 0 ? Math.round((catStats.hymns.completed / catStats.hymns.total) * 100) : 0;

    document.getElementById('miniProg_bible_study').style.width = `${bsRate}%`;
    document.getElementById('miniProg_coptic').style.width = `${copRate}%`;
    document.getElementById('miniProg_hymns').style.width = `${hymRate}%`;

    // 4. Update active Category specific view progress if open
    if (currentCategory && currentView === 'category') {
        const activeCatStats = catStats[currentCategory];
        if (activeCatStats) {
            const catRate = activeCatStats.total > 0 ? Math.round((activeCatStats.completed / activeCatStats.total) * 100) : 0;
            const catBar = document.getElementById('categoryProgressBar');
            const catText = document.getElementById('categoryProgressText');
            if (catBar) catBar.style.width = `${catRate}%`;
            if (catText) catText.textContent = `${catRate}%`;
        }
    }
}

// --- Render Lessons Grid ---
function renderLessons() {
    const grid = document.getElementById('categoryLessonsGrid');
    const partitionMenu = document.getElementById('categoryPartitionsMenu');
    
    if (!currentCategory) return;
    
    const lessons = lessonsData.filter(l => l.category === currentCategory);
    
    grid.innerHTML = '';
    partitionMenu.innerHTML = '';
    
    if (lessons.length === 0) {
        grid.innerHTML = `<div class="empty-state">لا توجد دروس متاحة حالياً لهذا الصف الدراسي.</div>`;
        return;
    }

    // Get Unique Partitions
    const partitions = [...new Set(lessons.map(l => l.partition_name || 'عام'))];
    
    // Render Partition Navigation Filters
    if (partitions.length > 1) {
        const allBtn = document.createElement('button');
        allBtn.className = 'partition-pill active';
        allBtn.textContent = 'الكل';
        allBtn.addEventListener('click', () => {
            filterLessonsByPartition('all');
            updateActivePartitionPill(allBtn);
        });
        partitionMenu.appendChild(allBtn);
        
        partitions.forEach(part => {
            const btn = document.createElement('button');
            btn.className = 'partition-pill';
            btn.textContent = part;
            btn.addEventListener('click', () => {
                filterLessonsByPartition(part);
                updateActivePartitionPill(btn);
            });
            partitionMenu.appendChild(btn);
        });
    }
    
    // Render Lessons
    lessons.forEach(lesson => {
        const card = createLessonCard(lesson);
        grid.appendChild(card);
    });
}

function updateActivePartitionPill(activeBtn) {
    const menu = document.getElementById('categoryPartitionsMenu');
    menu.querySelectorAll('.partition-pill').forEach(pill => pill.classList.remove('active'));
    activeBtn.classList.add('active');
}

function filterLessonsByPartition(partitionName) {
    const grid = document.getElementById('categoryLessonsGrid');
    const cards = grid.querySelectorAll('.lesson-card');
    
    cards.forEach(card => {
        if (partitionName === 'all' || card.dataset.partition === partitionName) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

// Create Card Element
function createLessonCard(lesson) {
    const card = document.createElement('div');
    card.className = 'lesson-card glass-card';
    card.dataset.partition = lesson.partition_name || 'عام';
    card.id = `lesson_card_${lesson.id}`;
    
    // Fetch Progress
    const progress = progressData.find(p => p.lesson_id === lesson.id);
    const isAudioDone = progress ? progress.audio_completed : false;
    const isVideoDone = progress ? progress.video_completed : false;
    const isQuizDone = progress ? progress.quiz_completed : false;
    
    let completionBadge = `<span class="badge-status pending"><i class="far fa-circle"></i> غير بدأ</span>`;
    if (lesson.category === 'bible_study' && isAudioDone && isQuizDone) {
        completionBadge = `<span class="badge-status completed"><i class="fas fa-check-circle"></i> مكتمل</span>`;
    } else if (lesson.category === 'coptic' && isVideoDone && isQuizDone) {
        completionBadge = `<span class="badge-status completed"><i class="fas fa-check-circle"></i> مكتمل</span>`;
    } else if (lesson.category === 'hymns') {
        const isHymnDone = (lesson.hymns_mode === 'both' && isAudioDone && isVideoDone) ||
                          (lesson.hymns_mode === 'audio' && isAudioDone) ||
                          (lesson.hymns_mode === 'video' && isVideoDone);
        if (isHymnDone) {
            completionBadge = `<span class="badge-status completed"><i class="fas fa-check-circle"></i> مكتمل</span>`;
        } else if (isAudioDone || isVideoDone) {
            completionBadge = `<span class="badge-status in-progress"><i class="fas fa-spinner fa-spin"></i> جاري التقدم</span>`;
        }
    } else if (isAudioDone || isVideoDone || isQuizDone) {
        completionBadge = `<span class="badge-status in-progress"><i class="fas fa-spinner fa-spin"></i> جاري التقدم</span>`;
    }

    let pointsDescription = '';
    if (lesson.category === 'bible_study') {
        pointsDescription = `🪙 سماع الفويس: ${lesson.points_listen} نقطة | الامتحان: ${lesson.points_quiz_question * 3} نقاط`;
    } else if (lesson.category === 'coptic') {
        pointsDescription = `🪙 مشاهدة الفيديو: ${lesson.points_watch} نقطة | الامتحان: ${lesson.points_quiz_question * 3} نقاط`;
    } else if (lesson.category === 'hymns') {
        pointsDescription = `🪙 سماع الفويس: ${lesson.points_listen || 0} نقطة | مشاهدة الفيديو: ${lesson.points_watch || 0} نقطة`;
    }

    card.innerHTML = `
        <div class="card-header-bar">
            <span class="partition-tag"><i class="fas fa-folder"></i> ${lesson.partition_name || 'عام'}</span>
            ${completionBadge}
        </div>
        <h3 class="lesson-card-title">${lesson.title}</h3>
        <p class="points-info-desc">${pointsDescription}</p>
        
        <div class="card-actions-row">
            <button class="expand-lesson-btn" onclick="openLessonDetailView('${lesson.id}')">
                دخول الدرس والامتحان <i class="fas fa-arrow-left"></i>
            </button>
        </div>
    `;
    
    return card;
}

// --- Render Lesson Details Workspace ---
async function renderLessonDetails(lessonId) {
    const workspace = document.getElementById('lessonDetailWorkspace');
    workspace.innerHTML = `<div class="loading-state"><i class="fas fa-circle-notch fa-spin"></i> جاري تحميل تفاصيل الدرس...</div>`;
    
    const lesson = lessonsData.find(l => l.id === lessonId);
    if (!lesson) {
        workspace.innerHTML = `<div class="empty-state text-red">عذراً! لم يتم العثور على الدرس المطلوب.</div>`;
        return;
    }
    
    // Set headers
    const catLabels = {
        bible_study: 'درس الكتاب',
        coptic: 'اللغة القبطية',
        hymns: 'مدرسة الألحان'
    };
    document.getElementById('lessonBreadcrumbCat').textContent = catLabels[lesson.category] || 'القسم';
    document.getElementById('lessonBreadcrumbTitle').textContent = lesson.title;
    document.getElementById('lessonDetailTitle').textContent = lesson.title;
    document.getElementById('lessonDetailPartition').innerHTML = `<i class="fas fa-folder"></i> ${lesson.partition_name || 'عام'}`;
    
    // Status Badge
    const progress = progressData.find(p => p.lesson_id === lessonId);
    const isAudioDone = progress ? progress.audio_completed : false;
    const isVideoDone = progress ? progress.video_completed : false;
    const isQuizDone = progress ? progress.quiz_completed : false;
    
    const badgeEl = document.getElementById('lessonDetailStatusBadge');
    if (lesson.category === 'bible_study' && isAudioDone && isQuizDone) {
        badgeEl.className = 'badge-status completed';
        badgeEl.innerHTML = `<i class="fas fa-check-circle"></i> مكتمل`;
    } else if (lesson.category === 'coptic' && isVideoDone && isQuizDone) {
        badgeEl.className = 'badge-status completed';
        badgeEl.innerHTML = `<i class="fas fa-check-circle"></i> مكتمل`;
    } else if (lesson.category === 'hymns') {
        const isHymnDone = (lesson.hymns_mode === 'both' && isAudioDone && isVideoDone) ||
                          (lesson.hymns_mode === 'audio' && isAudioDone) ||
                          (lesson.hymns_mode === 'video' && isVideoDone);
        if (isHymnDone) {
            badgeEl.className = 'badge-status completed';
            badgeEl.innerHTML = `<i class="fas fa-check-circle"></i> مكتمل`;
        } else if (isAudioDone || isVideoDone) {
            badgeEl.className = 'badge-status in-progress';
            badgeEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> جاري التقدم`;
        } else {
            badgeEl.className = 'badge-status pending';
            badgeEl.innerHTML = `<i class="far fa-circle"></i> لم يبدأ`;
        }
    } else if (isAudioDone || isVideoDone || isQuizDone) {
        badgeEl.className = 'badge-status in-progress';
        badgeEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> جاري التقدم`;
    } else {
        badgeEl.className = 'badge-status pending';
        badgeEl.innerHTML = `<i class="far fa-circle"></i> لم يبدأ`;
    }
    
    // Points Description Text
    let pointsDescText = '';
    if (lesson.category === 'bible_study') {
        pointsDescText = `🪙 سماع الفويس: ${lesson.points_listen} نقطة | الامتحان الروحي: ${lesson.points_quiz_question * 3} نقاط`;
    } else if (lesson.category === 'coptic') {
        pointsDescText = `🪙 مشاهدة الفيديو: ${lesson.points_watch} نقطة | الامتحان اليومي: ${lesson.points_quiz_question * 3} نقاط`;
    } else if (lesson.category === 'hymns') {
        pointsDescText = `🪙 سماع الصوت: ${lesson.points_listen || 0} نقطة | مشاهدة الفيديو: ${lesson.points_watch || 0} نقطة`;
    }
    document.getElementById('lessonDetailPointsDesc').textContent = pointsDescText;
    
    // Clear old player references
    cleanupMediaPlayers();
    
    showAppLoading(true);
    try {
        let htmlContent = '';
        
        // 1. Bible Study Template
        if (lesson.category === 'bible_study') {
            const isAudioCompleted = progress ? progress.audio_completed : false;
            const isQuizCompleted = progress ? progress.quiz_completed : false;
            
            // Build Quiz display
            let quizSectionHtml = '';
            if (isQuizCompleted) {
                quizSectionHtml = `
                    <div class="quiz-completed-box">
                        <div class="quiz-done-icon-text">
                            <i class="fas fa-check"></i>
                            <div class="quiz-done-meta">
                                <h4>لقد قمت بحل هذا الامتحان بنجاح!</h4>
                                <p>النقاط المضافة لرصيدك: +${progress.quiz_points_earned || 0} نقطة 🪙</p>
                            </div>
                        </div>
                        <div class="quiz-score-badge-val">النتيجة: ${progress.quiz_score || 0} صحيحة</div>
                        <button class="action-btn review-quiz-btn" onclick="startLessonQuizReview('${lesson.id}')">
                            عرض إجاباتي والأسئلة <i class="fas fa-eye"></i>
                        </button>
                    </div>
                `;
            } else {
                quizSectionHtml = `
                    <div class="quiz-status-block">
                        <button class="action-btn quiz-btn-trigger" id="quiz_btn_${lesson.id}" 
                                onclick="startLessonQuiz('${lesson.id}')" 
                                ${isAudioCompleted ? '' : 'disabled'}>
                            <i class="fas fa-edit"></i> دخول الامتحان الروحي اليومي
                        </button>
                        ${isAudioCompleted ? '' : '<span class="lock-hint-text"><i class="fas fa-lock"></i> استمع للفويس بالكامل لفتح الامتحان</span>'}
                    </div>
                `;
            }
            
            htmlContent = `
                <div class="media-workspace">
                    <div class="audio-player-container">
                        <span class="player-label"><i class="fas fa-headphones"></i> فويس الدرس (استمع بالكامل لتسجيل النقاط):</span>
                        <audio id="audio_${lesson.id}" src="${lesson.audio_url}" style="display:none"></audio>
                        <div class="custom-audio-player" id="player_ui_${lesson.id}">
                            <div class="audio-player-controls">
                                <button class="audio-play-btn" id="play_btn_${lesson.id}" onclick="toggleAudioPlay('${lesson.id}')">
                                    <i class="fas fa-play" id="play_icon_${lesson.id}"></i>
                                </button>
                                <div class="audio-progress-container">
                                    <div class="audio-progress-track">
                                        <div class="audio-progress-fill" id="audio_fill_${lesson.id}" style="width:0%"></div>
                                    </div>
                                    <div class="audio-time-row">
                                        <span id="audio_cur_${lesson.id}">0:00</span>
                                        <span id="audio_dur_${lesson.id}">0:00</span>
                                    </div>
                                </div>
                            </div>
                            ${isAudioCompleted ? '' : '<div class="audio-lock-hint"><i class="fas fa-lock"></i> لا يمكنك تقديم الفويس - استمع للنهاية لفتح الامتحان</div>'}
                        </div>
                    </div>
                    
                    <div class="reading-frame-container">
                        <h4 class="reading-title"><i class="fas fa-book-open text-gold"></i> نص القراءة والتأمل الروحي:</h4>
                        <div class="reading-frame">
                            <div class="reading-text-body">${lesson.text_content || 'لا يوجد نص تأمل مضاف حالياً لهذا الدرس.'}</div>
                        </div>
                    </div>
                    
                    ${quizSectionHtml}
                </div>
            `;
            workspace.innerHTML = htmlContent;
            
            setTimeout(() => {
                initAudioPlayer(lesson.id, progress);
            }, 100);
        }
        
        // 2. Coptic Language Template
        else if (lesson.category === 'coptic') {
            const isVideoCompleted = progress ? progress.video_completed : false;
            const isQuizCompleted = progress ? progress.quiz_completed : false;
            
            // Build Quiz display
            let quizSectionHtml = '';
            if (isQuizCompleted) {
                quizSectionHtml = `
                    <div class="quiz-completed-box">
                        <div class="quiz-done-icon-text">
                            <i class="fas fa-check"></i>
                            <div class="quiz-done-meta">
                                <h4>لقد قمت بحل هذا الامتحان بنجاح!</h4>
                                <p>النقاط المضافة لرصيدك: +${progress.quiz_points_earned || 0} نقطة 🪙</p>
                            </div>
                        </div>
                        <div class="quiz-score-badge-val">النتيجة: ${progress.quiz_score || 0} إجابات صحيحة</div>
                        <button class="action-btn review-quiz-btn" onclick="startLessonQuizReview('${lesson.id}')">
                            عرض إجاباتي والأسئلة <i class="fas fa-eye"></i>
                        </button>
                    </div>
                `;
            } else {
                quizSectionHtml = `
                    <div class="quiz-status-block">
                        <button class="action-btn quiz-btn-trigger" id="quiz_btn_${lesson.id}" 
                                onclick="startLessonQuiz('${lesson.id}')" 
                                ${isVideoCompleted ? '' : 'disabled'}>
                            <i class="fas fa-edit"></i> دخول امتحان القبطي اليومي
                        </button>
                        ${isVideoCompleted ? '' : '<span class="lock-hint-text"><i class="fas fa-lock"></i> شاهد الفيديو بالكامل لفتح الامتحان</span>'}
                    </div>
                `;
            }
            
            htmlContent = `
                <div class="media-workspace">
                    <div class="video-player-container">
                        <span class="player-label"><i class="fas fa-video"></i> فيديو الدرس (إجباري المشاهدة للنهاية):</span>
                        <div class="video-ratio-wrapper">
                            ${renderVideoIframe(lesson.id, lesson.video_url, isVideoCompleted, false)}
                        </div>
                    </div>
                    
                    ${quizSectionHtml}
                </div>
            `;
            workspace.innerHTML = htmlContent;
            
            setTimeout(() => {
                initVideoPlayer(lesson.id, lesson.video_url, progress);
            }, 100);
        }
        
        // 3. Hymns School Template
        else if (lesson.category === 'hymns') {
            const isAudioCompleted = progress ? progress.audio_completed : false;
            const isVideoCompleted = progress ? progress.video_completed : false;
            const showAudio = lesson.hymns_mode === 'audio' || lesson.hymns_mode === 'both';
            const showVideo = lesson.hymns_mode === 'video' || lesson.hymns_mode === 'both';
            const unlimitedControls = lesson.hymns_mode === 'both';
            
            let pdfHtml = '';
            if (lesson.pdf_urls && lesson.pdf_urls.length > 0) {
                pdfHtml = `
                    <div class="pdf-viewer-workspace">
                        <h4 class="reading-title"><i class="far fa-file-pdf text-red"></i> ملفات الهزات والألحان (PDF):</h4>
                        <div class="pdf-actions-row">
                            ${lesson.pdf_urls.map((url, idx) => `
                                <a href="${url}" target="_blank" class="pdf-download-link">
                                    <i class="fas fa-download"></i> تحميل الهزات - ملف ${idx + 1}
                                </a>
                            `).join('')}
                        </div>
                        <div class="pdf-frame-wrapper">
                            <iframe src="${lesson.pdf_urls[0]}" class="pdf-iframe-element"></iframe>
                        </div>
                    </div>
                `;
            }
            
            htmlContent = `
                <div class="media-workspace">
                    ${showVideo ? `
                        <div class="video-player-container">
                            <span class="player-label"><i class="fas fa-video"></i> فيديو اللحن (مشاهدة لكسب النقاط):</span>
                            <div class="video-ratio-wrapper">
                                ${renderVideoIframe(lesson.id, lesson.video_url, isVideoCompleted, unlimitedControls)}
                            </div>
                        </div>
                    ` : ''}

                    ${showAudio ? `
                        <div class="audio-player-container">
                            <span class="player-label"><i class="fas fa-headphones"></i> فويس اللحن (استماع لكسب النقاط):</span>
                            <audio id="audio_${lesson.id}" src="${lesson.audio_url}" style="display:none"></audio>
                            <div class="custom-audio-player" id="player_ui_${lesson.id}">
                                <div class="audio-player-controls">
                                    <button class="audio-play-btn" id="play_btn_${lesson.id}" onclick="toggleAudioPlay('${lesson.id}')">
                                        <i class="fas fa-play" id="play_icon_${lesson.id}"></i>
                                    </button>
                                    <div class="audio-progress-container">
                                        <div class="audio-progress-track">
                                            <div class="audio-progress-fill" id="audio_fill_${lesson.id}" style="width:0%"></div>
                                        </div>
                                        <div class="audio-time-row">
                                            <span id="audio_cur_${lesson.id}">0:00</span>
                                            <span id="audio_dur_${lesson.id}">0:00</span>
                                        </div>
                                    </div>
                                </div>
                                ${(unlimitedControls || isAudioCompleted) ? '' : '<div class="audio-lock-hint"><i class="fas fa-lock"></i> استمع من البداية للنهاية لكسب النقاط</div>'}
                            </div>
                        </div>
                    ` : ''}

                    ${pdfHtml}
                </div>
            `;
            workspace.innerHTML = htmlContent;
            
            setTimeout(() => {
                if (showVideo) initVideoPlayer(lesson.id, lesson.video_url, progress, unlimitedControls);
                if (showAudio) initAudioPlayer(lesson.id, progress, unlimitedControls);
            }, 100);
        }
    } catch (e) {
        console.error("Failed to render lesson details:", e);
        workspace.innerHTML = `<div class="empty-state text-red">فشل تحميل تفاصيل الميديا: ${e.message}</div>`;
    } finally {
        showAppLoading(false);
    }
}


// --- Player Logic & Controls Snap ---


// Global play/pause toggle (called from button onclick)
window.toggleAudioPlay = function(lessonId) {
    const audio = document.getElementById(`audio_${lessonId}`);
    if (!audio) return;
    if (audio.paused) {
        audio.play();
    } else {
        audio.pause();
    }
};

function fmtTime(sec) {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

function initAudioPlayer(lessonId, progress, unlimited = false) {
    const audio = document.getElementById(`audio_${lessonId}`);
    if (!audio) return;
    
    currentMediaElement = audio;
    currentTrackingLessonId = lessonId;
    currentTrackingCategory = 'audio';
    
    // Resume position
    const savedTime = progress ? (progress.last_position_audio || 0) : 0;
    highestTimeListened = savedTime;
    audio.currentTime = savedTime;
    
    // Wire up custom player UI
    const fillEl = document.getElementById(`audio_fill_${lessonId}`);
    const curEl  = document.getElementById(`audio_cur_${lessonId}`);
    const durEl  = document.getElementById(`audio_dur_${lessonId}`);
    const playIcon = document.getElementById(`play_icon_${lessonId}`);
    
    // Update duration display once metadata loads
    audio.addEventListener('loadedmetadata', () => {
        if (durEl) durEl.textContent = fmtTime(audio.duration);
        // Restore fill on load
        if (fillEl && audio.duration > 0) {
            fillEl.style.width = `${(savedTime / audio.duration) * 100}%`;
        }
        if (curEl) curEl.textContent = fmtTime(savedTime);
    });
    
    // Play/Pause icon sync
    audio.addEventListener('play', () => {
        if (playIcon) { playIcon.className = 'fas fa-pause'; }
        startPositionSavingTracker();
    });
    audio.addEventListener('pause', () => {
        if (playIcon) { playIcon.className = 'fas fa-play'; }
        stopPositionSavingTracker();
    });
    audio.addEventListener('ended', async () => {
        if (playIcon) { playIcon.className = 'fas fa-play'; }
        stopPositionSavingTracker();
        await markMediaCompleted('audio', lessonId);
        // Remove lock hint after completion
        const lockHint = document.querySelector(`#player_ui_${lessonId} .audio-lock-hint`);
        if (lockHint) lockHint.remove();
    });
    
    // Timeupdate: update fill bar and time display
    audio.addEventListener('timeupdate', () => {
        if (fillEl && audio.duration > 0) {
            fillEl.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
        }
        if (curEl) curEl.textContent = fmtTime(audio.currentTime);
        
        if (!unlimited) {
            // Snapping logic to prevent fast-forwarding
            if (audio.currentTime > highestTimeListened + 1.5) {
                audio.currentTime = highestTimeListened;
                showToast('⚠️ غير مسموح بالتقديم — استمع بالترتيب!', 'warning');
            } else {
                highestTimeListened = Math.max(highestTimeListened, audio.currentTime);
            }
        } else {
            highestTimeListened = Math.max(highestTimeListened, audio.currentTime);
        }
    });
    
    // Prevent speed rate adjustments
    audio.addEventListener('ratechange', () => {
        if (audio.playbackRate > 1.0) {
            audio.playbackRate = 1.0;
            showToast("⚠️ غير مسموح بتسريع المقطع الصوتي!", "warning");
        }
    });
}

function renderVideoIframe(lessonId, videoUrl, isCompleted = false, unlimited = false) {
    if (!videoUrl) return '<div class="empty-state">لا يوجد ملف فيديو متاح.</div>';
    
    // Check if it is a Youtube link
    if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
        let ytId = '';
        if (videoUrl.includes('embed/')) {
            ytId = videoUrl.split('embed/')[1].split('?')[0];
        } else if (videoUrl.includes('watch?v=')) {
            ytId = videoUrl.split('watch?v=')[1].split('&')[0];
        } else if (videoUrl.includes('youtu.be/')) {
            ytId = videoUrl.split('youtu.be/')[1].split('?')[0];
        }
        
        return `<div id="yt_player_${lessonId}"></div>`;
    } else {
        // Direct mp4 video link
        const showOverlay = !unlimited && !isCompleted;
        const videoHtml = `<video id="video_${lessonId}" class="custom-video-element" controls src="${videoUrl}" controlsList="nodownload"></video>`;
        
        if (showOverlay) {
            return `
                <div class="custom-video-wrapper">
                    ${videoHtml}
                    <div class="video-lock-overlay" id="video_overlay_${lessonId}">
                        <i class="fas fa-lock"></i>
                        <span>شاهد من البداية للنهاية لكسب النقاط</span>
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="custom-video-wrapper">
                    ${videoHtml}
                </div>
            `;
        }
    }
}

function initVideoPlayer(lessonId, videoUrl, progress, unlimited = false) {
    currentTrackingLessonId = lessonId;
    currentTrackingCategory = 'video';
    
    const isYt = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be');
    const savedTime = progress ? progress.last_position_video : 0;
    highestTimeListened = savedTime;

    if (isYt) {
        // Load YouTube Player API if it's not loaded
        if (typeof YT === 'undefined' || typeof YT.Player === 'undefined') {
            const tag = document.createElement('script');
            tag.src = "https://www.youtube.com/iframe_api";
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            
            window.onYouTubeIframeAPIReady = () => {
                createYtPlayer(lessonId, videoUrl, savedTime, unlimited);
            };
        } else {
            createYtPlayer(lessonId, videoUrl, savedTime, unlimited);
        }
    } else {
        // Native MP4 video element
        const video = document.getElementById(`video_${lessonId}`);
        if (!video) return;
        
        currentMediaElement = video;
        video.currentTime = savedTime;
        
        const overlay = document.getElementById(`video_overlay_${lessonId}`);
        
        if (unlimited) {
            video.addEventListener('play', () => {
                if (overlay) overlay.style.display = 'none';
                startPositionSavingTracker();
            });
            video.addEventListener('pause', () => {
                stopPositionSavingTracker();
            });
            video.addEventListener('ended', async () => {
                if (overlay) overlay.remove();
                stopPositionSavingTracker();
                await markMediaCompleted('video', lessonId);
            });
            return;
        }

        // Snapping logic
        video.addEventListener('timeupdate', () => {
            if (video.currentTime > highestTimeListened + 1.5) {
                video.currentTime = highestTimeListened;
                showToast("⚠️ لا يمكنك تجاوز محتوى الفيديو دون مشاهدته!", "warning");
            } else {
                highestTimeListened = Math.max(highestTimeListened, video.currentTime);
            }
        });
        
        // Prevent speed rates
        video.addEventListener('ratechange', () => {
            if (video.playbackRate > 1.0) {
                video.playbackRate = 1.0;
                showToast("⚠️ غير مسموح بتسريع الفيديو!", "warning");
            }
        });

        video.addEventListener('play', () => {
            if (overlay) overlay.style.display = 'none';
            startPositionSavingTracker();
        });
        video.addEventListener('pause', () => {
            if (overlay && video.currentTime < video.duration - 2) {
                overlay.style.display = 'flex';
            }
            stopPositionSavingTracker();
        });
        video.addEventListener('ended', async () => {
            if (overlay) overlay.remove();
            stopPositionSavingTracker();
            await markMediaCompleted('video', lessonId);
        });
    }
}

function createYtPlayer(lessonId, videoUrl, startTime, unlimited) {
    let ytId = '';
    if (videoUrl.includes('embed/')) {
        ytId = videoUrl.split('embed/')[1].split('?')[0];
    } else if (videoUrl.includes('watch?v=')) {
        ytId = videoUrl.split('watch?v=')[1].split('&')[0];
    } else if (videoUrl.includes('youtu.be/')) {
        ytId = videoUrl.split('youtu.be/')[1].split('?')[0];
    }

    // Initialize player
    ytPlayer = new YT.Player(`yt_player_${lessonId}`, {
        height: '100%',
        width: '100%',
        videoId: ytId,
        playerVars: {
            'playsinline': 1,
            'rel': 0,
            'modestbranding': 1,
            'controls': unlimited ? 1 : 0, // Hide native controls if limited so they can't scrub
            'start': Math.floor(startTime)
        },
        events: {
            'onReady': (event) => {
                if (startTime > 0) {
                    event.target.seekTo(startTime);
                }
            },
            'onStateChange': (event) => {
                if (event.data === YT.PlayerState.PLAYING) {
                    startYtProgressTracker(unlimited);
                } else if (event.data === YT.PlayerState.ENDED) {
                    stopYtProgressTracker();
                    markMediaCompleted('video', lessonId);
                } else {
                    stopYtProgressTracker();
                }
            }
        }
    });
}

// YouTube Progress Tracking Tick
let ytTrackerInterval = null;
function startYtProgressTracker(unlimited) {
    stopYtProgressTracker();
    
    // Start db sync
    startPositionSavingTracker();
    
    if (unlimited) return;

    ytTrackerInterval = setInterval(() => {
        if (!ytPlayer || typeof ytPlayer.getCurrentTime === 'undefined') return;
        
        const currentTime = ytPlayer.getCurrentTime();
        
        // Prevent forward scrub
        if (currentTime > highestTimeListened + 2.5) { // YouTube buffer offset allowance
            ytPlayer.seekTo(highestTimeListened);
            showToast("⚠️ غير مسموح بتخطي محتوى الفيديو!", "warning");
        } else {
            highestTimeListened = Math.max(highestTimeListened, currentTime);
        }
        
        // Check speed rate
        if (ytPlayer.getPlaybackRate() > 1.0) {
            ytPlayer.setPlaybackRate(1.0);
            showToast("⚠️ لا يمكنك تسريع المقطع التعليمي!", "warning");
        }
        
        // Check if finished (98% completion is treated as finished to allow video margins)
        const duration = ytPlayer.getDuration();
        if (duration > 0 && currentTime >= duration - 2) {
            stopYtProgressTracker();
            stopPositionSavingTracker();
            markMediaCompleted('video', currentTrackingLessonId);
        }
    }, 500);
}

function stopYtProgressTracker() {
    if (ytTrackerInterval) {
        clearInterval(ytTrackerInterval);
        ytTrackerInterval = null;
    }
    stopPositionSavingTracker();
}

// Position Autosave Timer (sync position to DB every 5 seconds)
function startPositionSavingTracker() {
    stopPositionSavingTracker();
    positionSaveInterval = setInterval(async () => {
        await savePlaybackPosition();
    }, 5000);
}

function stopPositionSavingTracker() {
    if (positionSaveInterval) {
        clearInterval(positionSaveInterval);
        positionSaveInterval = null;
    }
}

// Upsert playback state to Supabase
async function savePlaybackPosition() {
    if (!currentUser || !currentTrackingLessonId) return;
    
    let currentTime = 0;
    if (currentTrackingCategory === 'audio' && currentMediaElement) {
        currentTime = currentMediaElement.currentTime;
    } else if (currentTrackingCategory === 'video') {
        if (ytPlayer && typeof ytPlayer.getCurrentTime !== 'undefined') {
            currentTime = ytPlayer.getCurrentTime();
        } else if (currentMediaElement) {
            currentTime = currentMediaElement.currentTime;
        }
    }
    
    if (currentTime === 0) return;

    const updates = {
        user_id: currentUser.id,
        lesson_id: currentTrackingLessonId,
        updated_at: new Date().toISOString()
    };
    
    if (currentTrackingCategory === 'audio') {
        updates.last_position_audio = currentTime;
    } else {
        updates.last_position_video = currentTime;
    }

    try {
        await supabaseClient
            .from('service_student_progress')
            .upsert(updates, { onConflict: 'user_id,lesson_id' });
    } catch (e) {
        console.warn("Playback position sync failed:", e);
    }
}

// Silent reload in the background without showing any spinners
async function silentReloadData() {
    if (!currentUser) return;
    try {
        let lessonsQuery = supabaseClient
            .from('service_lessons')
            .select('*')
            .order('created_at', { ascending: true });
        
        if (currentProfile.class_year) {
            lessonsQuery = lessonsQuery.eq('class_year', currentProfile.class_year);
        }
        
        const { data: lessons } = await lessonsQuery;
        if (lessons) lessonsData = lessons;
        
        const { data: progress } = await supabaseClient
            .from('service_student_progress')
            .select('*')
            .eq('user_id', currentUser.id);
        if (progress) progressData = progress || [];

        const { data: logs } = await supabaseClient
            .from('service_points_log')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });
        if (logs) pointsLogs = logs || [];

        const { data: atts } = await supabaseClient
            .from('service_attendance')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('attended_date', { ascending: false });
        if (atts) attendanceLogs = atts || [];

        updatePointsDisplay();
        renderProgressIndicators();
    } catch (err) {
        console.warn("Silent background reload failed:", err);
    }
}

// Mark Media completed and award points
async function markMediaCompleted(type, lessonId) {
    if (!currentUser) return;
    
    // Return early if this media is already completed to avoid duplicate logs/alerts
    let prog = progressData.find(p => p.lesson_id === lessonId);
    const isCompleted = prog ? (type === 'audio' ? prog.audio_completed : prog.video_completed) : false;
    if (isCompleted) return;
    
    const lesson = lessonsData.find(l => l.id === lessonId);
    if (!lesson) return;
    
    const pointsAwarded = type === 'audio' ? (lesson.points_listen || 0) : (lesson.points_watch || 0);

    // 1. Update local progressData immediately
    if (prog) {
        if (type === 'audio') prog.audio_completed = true;
        else prog.video_completed = true;
    } else {
        prog = {
            user_id: currentUser.id,
            lesson_id: lessonId,
            audio_completed: type === 'audio',
            video_completed: type === 'video',
            quiz_completed: false,
            audio_points_earned: type === 'audio' ? pointsAwarded : 0,
            video_points_earned: type === 'video' ? pointsAwarded : 0
        };
        progressData.push(prog);
    }
    
    // 2. Add to local pointsLogs immediately to sync counters
    if (pointsAwarded > 0) {
        pointsLogs.unshift({
            id: 'temp_' + Date.now(),
            user_id: currentUser.id,
            type: type === 'audio' ? 'audio_completion' : 'video_completion',
            points: pointsAwarded,
            reference_id: lessonId,
            details: (type === 'audio' ? 'سماع فويس درس: ' : 'مشاهدة فيديو درس: ') + (lesson.title || 'بدون عنوان'),
            created_at: new Date().toISOString()
        });
        
        // 3. Show Points Alert Overlay immediately
        showPointsOverlay(pointsAwarded, type === 'audio' ? 'الاستماع للفويس بنجاح' : 'مشاهدة الفيديو بالكامل');
    }
    
    // 4. Update UI counters instantly
    updatePointsDisplay();
    renderProgressIndicators();
    
    // Enable Quiz button in DOM immediately if relevant
    const quizBtn = document.getElementById(`quiz_btn_${lessonId}`);
    if (quizBtn) {
        quizBtn.removeAttribute('disabled');
        const hint = quizBtn.parentElement.querySelector('.lock-hint-text');
        if (hint) hint.remove();
    }
    
    // 5. Send update to Supabase in the background
    const updates = {
        user_id: currentUser.id,
        lesson_id: lessonId,
        updated_at: new Date().toISOString()
    };
    
    if (type === 'audio') {
        updates.audio_completed = true;
    } else {
        updates.video_completed = true;
    }

    supabaseClient
        .from('service_student_progress')
        .upsert(updates, { onConflict: 'user_id,lesson_id' })
        .then(({ error }) => {
            if (error) {
                console.error("Failed to complete media progress on server:", error);
            } else {
                silentReloadData();
            }
        });
}

// Clean active tracking states when opening something else
function cleanupMediaPlayers() {
    stopPositionSavingTracker();
    stopYtProgressTracker();
    
    if (currentMediaElement) {
        currentMediaElement.pause();
        currentMediaElement = null;
    }
    
    if (ytPlayer) {
        try {
            ytPlayer.destroy();
        } catch (e) {}
        ytPlayer = null;
    }
    
    currentTrackingLessonId = null;
    currentTrackingCategory = null;
}

// --- Interactive Quizzes ---
async function startLessonQuiz(lessonId) {
    const restriction = restrictionsData.find(r => r.lesson_id === lessonId);
    if (restriction && restriction.quiz_locked) {
        showToast("⚠️ هذا الامتحان مغلق حالياً من قِبل الخادم.", "warning");
        return;
    }

    const lesson = lessonsData.find(l => l.id === lessonId);
    const progress = progressData.find(p => p.lesson_id === lessonId);
    
    if (progress && progress.quiz_completed) {
        // Direct to review mode instead of showing alert
        startLessonQuizReview(lessonId);
        return;
    }

    showAppLoading(true);
    try {
        // Fetch Quiz Questions
        const { data, error } = await supabaseClient
            .from('service_quizzes')
            .select('*')
            .eq('lesson_id', lessonId)
            .maybeSingle();
            
        if (error) throw error;
        
        if (!data || !data.questions || data.questions.length === 0) {
            showToast("لا يوجد امتحان مضاف لهذا الدرس حالياً.", "warning");
            return;
        }

        quizQuestions = data.questions;
        currentQuestionIndex = 0;
        correctAnswersCount = 0;
        studentQuizAnswers = []; // Reset answers tracker
        currentQuizLessonId = lessonId;
        currentQuizCategory = lesson.category;
        
        // Show Quiz View in SPA
        navigateToView('quizFullView');
        currentView = 'quiz';

        // Set Breadcrumb
        const arabicCat = lesson.category === 'bible_study' ? 'درس الكتاب المقدس' : (lesson.category === 'coptic' ? 'اللغة القبطية' : 'مدرسة الألحان');
        document.getElementById('quizBreadcrumbCat').textContent = arabicCat;
        document.getElementById('quizBreadcrumbTitle').textContent = `امتحان: ${lesson.title}`;

        // Ensure progress section is shown
        document.querySelector('#quizFullView .quiz-progress-section').style.display = 'block';

        renderQuizQuestion();

    } catch (err) {
        console.error("Error launching quiz:", err);
        showToast("حدث خطأ في تحميل الامتحان.", "error");
    } finally {
        showAppLoading(false);
    }
}

function renderQuizQuestion() {
    const totalQuestions = quizQuestions.length;
    const currentQ = quizQuestions[currentQuestionIndex];
    const box = document.getElementById('quizFullWorkspace');
    const nextBtn = document.getElementById('quizNextBtn');
    
    // Update progress bar
    const progressPercent = Math.round((currentQuestionIndex / totalQuestions) * 100);
    document.getElementById('quizProgressText').textContent = `السؤال ${currentQuestionIndex + 1} من ${totalQuestions}`;
    document.getElementById('quizProgressPercent').textContent = `${progressPercent}%`;
    document.getElementById('quizProgressFillBar').style.width = `${progressPercent}%`;
    
    // Disable Next Button until selection
    nextBtn.disabled = true;
    nextBtn.style.display = 'inline-flex';
    
    if (currentQuestionIndex === totalQuestions - 1) {
        nextBtn.innerHTML = `إنهاء وإرسال الامتحان <i class="fas fa-check"></i>`;
    } else {
        nextBtn.innerHTML = `السؤال التالي <i class="fas fa-chevron-left"></i>`;
    }

    box.innerHTML = `
        <div class="quiz-question-container-fullpage" style="margin-top: 20px;">
            <h3 class="quiz-question-title" style="font-size: 18px; font-weight: 900; color:#fff; margin-bottom: 20px; line-height: 1.5;">${currentQ.question}</h3>
            <div class="quiz-options-list-fullpage" style="display: flex; flex-direction: column; gap: 10px;">
                ${currentQ.options.map((opt, idx) => `
                    <label class="quiz-option-item-fullpage" id="optLabel_${idx}" style="display: flex; align-items: center; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); padding: 15px 20px; border-radius: 12px; cursor: pointer; transition: all 0.25s ease;">
                        <input type="radio" name="quiz_opt" value="${idx}" onchange="selectQuizOption(${idx})" style="display: none;">
                        <span class="option-marker" style="width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: var(--text-gold); margin-left: 15px; flex-shrink: 0; transition: all 0.25s ease;">${idx + 1}</span>
                        <span class="option-text" style="color: #fff; font-size: 15px; font-weight: 600;">${opt}</span>
                    </label>
                `).join('')}
            </div>
        </div>
    `;
}

window.selectQuizOption = function(idx) {
    document.querySelectorAll('.quiz-option-item-fullpage').forEach(el => {
        el.classList.remove('selected');
        el.style.background = 'rgba(255,255,255,0.02)';
        el.style.borderColor = 'rgba(255,255,255,0.06)';
        const marker = el.querySelector('.option-marker');
        if (marker) {
            marker.style.background = 'rgba(255,255,255,0.05)';
            marker.style.borderColor = 'rgba(255,255,255,0.1)';
            marker.style.color = 'var(--text-gold)';
        }
    });

    const selectedLabel = document.getElementById(`optLabel_${idx}`);
    if (selectedLabel) {
        selectedLabel.classList.add('selected');
        selectedLabel.style.background = 'rgba(212, 160, 23, 0.08)';
        selectedLabel.style.borderColor = 'var(--border-gold)';
        const marker = selectedLabel.querySelector('.option-marker');
        if (marker) {
            marker.style.background = 'var(--gold-primary)';
            marker.style.borderColor = 'var(--gold-primary)';
            marker.style.color = '#000';
        }
    }
    enableQuizNextButton();
};

function enableQuizNextButton() {
    const btn = document.getElementById('quizNextBtn');
    if (btn) btn.disabled = false;
}

// Handle Question Navigation & Submit
document.getElementById('quizNextBtn').addEventListener('click', async () => {
    const selectedOpt = document.querySelector('input[name="quiz_opt"]:checked');
    if (!selectedOpt) return;
    
    const selectedAnswerIndex = parseInt(selectedOpt.value);
    studentQuizAnswers.push(selectedAnswerIndex); // Record answer
    
    const correctAnswerIndex = quizQuestions[currentQuestionIndex].correct_index;
    
    if (selectedAnswerIndex === correctAnswerIndex) {
        correctAnswersCount++;
    }

    currentQuestionIndex++;
    if (currentQuestionIndex < quizQuestions.length) {
        renderQuizQuestion();
    } else {
        // Submit Quiz Result
        await submitQuizResult();
    }
});

async function submitQuizResult() {
    const nextBtn = document.getElementById('quizNextBtn');
    if (nextBtn) {
        nextBtn.disabled = true;
        nextBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> جاري حفظ النتيجة...';
    }
    
    const lessonId = currentQuizLessonId;
    const category = currentQuizCategory;
    const correctAnswers = correctAnswersCount;
    
    const lesson = lessonsData.find(l => l.id === lessonId);
    if (!lesson) {
        console.error("Lesson not found for quiz submission context:", lessonId);
        return;
    }
    
    const pointsPerQuestion = lesson.points_quiz_question;
    const totalQCount = quizQuestions.length;
    
    let isPassed = true;
    let finalPoints = 0;
    
    if (category === 'coptic') {
        if (correctAnswers >= lesson.min_pass_score) {
            finalPoints = correctAnswers * pointsPerQuestion;
        } else {
            isPassed = false;
        }
    } else {
        finalPoints = correctAnswers * pointsPerQuestion;
    }

    // 1. Update local progressData immediately
    let prog = progressData.find(p => p.lesson_id === lessonId);
    if (prog) {
        prog.quiz_completed = true;
        prog.quiz_score = correctAnswers;
        prog.quiz_answers = studentQuizAnswers;
        prog.quiz_points_earned = finalPoints;
    } else {
        prog = {
            user_id: currentUser.id,
            lesson_id: lessonId,
            quiz_completed: true,
            quiz_score: correctAnswers,
            quiz_answers: studentQuizAnswers,
            quiz_points_earned: finalPoints,
            audio_completed: false,
            video_completed: false
        };
        progressData.push(prog);
    }

    // 2. Add to local pointsLogs immediately
    if (finalPoints > 0) {
        pointsLogs.unshift({
            id: 'temp_' + Date.now(),
            user_id: currentUser.id,
            type: 'quiz',
            points: finalPoints,
            reference_id: lessonId,
            details: 'اجتياز امتحان درس: ' + (lesson.title || 'بدون عنوان'),
            created_at: new Date().toISOString()
        });
    }

    try {
        // Hide progress bar and next button
        document.querySelector('#quizFullView .quiz-progress-section').style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';

        // Render result dashboard
        const box = document.getElementById('quizFullWorkspace');
        const percent = Math.round((correctAnswers / totalQCount) * 100);
        
        let resultMessage = '';
        let iconHtml = '';
        
        if (isPassed && finalPoints > 0) {
            iconHtml = '<i class="fas fa-trophy text-gold fa-3x" style="margin-bottom:15px; display:block;"></i>';
            resultMessage = `
                <h3 style="color:#2ec4b6; font-size:22px; font-weight:900; margin-bottom:10px;">تهانينا! لقد اجتزت الامتحان بنجاح</h3>
                <p style="color:#fff; font-size:16px; margin-bottom:15px;">تمت إضافة <strong>+${finalPoints}</strong> نقطة 🪙 إلى رصيدك.</p>
            `;
        } else if (!isPassed) {
            iconHtml = '<i class="fas fa-exclamation-circle text-orange fa-3x" style="margin-bottom:15px; display:block;"></i>';
            resultMessage = `
                <h3 style="color:#ff9f1c; font-size:20px; font-weight:900; margin-bottom:10px;">حظاً موفقاً في المرة القادمة</h3>
                <p style="color:#fff; font-size:15px; margin-bottom:15px;">لم تتجاوز الحد الأدنى للاجتياز وهو <strong>${lesson.min_pass_score}</strong> أسئلة صحيحة.</p>
            `;
        } else {
            iconHtml = '<i class="fas fa-check-circle text-green fa-3x" style="margin-bottom:15px; display:block;"></i>';
            resultMessage = `
                <h3 style="color:#2ec4b6; font-size:20px; font-weight:900; margin-bottom:10px;">تم إنهاء الامتحان بنجاح</h3>
                <p style="color:#fff; font-size:15px; margin-bottom:15px;">الإجابات الصحيحة: <strong>${correctAnswers}</strong> من أصل <strong>${totalQCount}</strong>.</p>
            `;
        }

        box.innerHTML = `
            <div class="quiz-result-screen text-center" style="padding: 20px 10px; display: flex; flex-direction: column; align-items: center;">
                ${iconHtml}
                <div class="result-score-circle" style="width: 110px; height: 110px; border-radius: 50%; border: 4px solid ${isPassed ? '#2ec4b6' : '#ff9f1c'}; display: flex; flex-direction: column; align-items: center; justify-content: center; margin: 0 auto 20px; background: rgba(255,255,255,0.02);">
                    <span style="font-size: 26px; font-weight: 900; color: #fff;">${percent}%</span>
                    <span style="font-size: 12px; color: var(--text-muted);">${correctAnswers} / ${totalQCount}</span>
                </div>
                ${resultMessage}
                
                <div style="display:flex; flex-direction:column; gap:10px; margin-top:25px; width: 100%; max-width: 280px;">
                    <button class="action-btn" style="background:var(--gold-primary); color:#000; font-weight:bold; border:none; padding:12px; border-radius:8px; cursor:pointer;" onclick="startLessonQuizReview('${lessonId}')">
                        <i class="fas fa-eye"></i> عرض إجاباتي والحل الصحيح
                    </button>
                    <button class="action-btn" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; padding:12px; border-radius:8px; cursor:pointer;" onclick="exitQuizToLesson()">
                        <i class="fas fa-times"></i> إغلاق
                    </button>
                </div>
            </div>
        `;

        // 3. Show Points Alert Overlay
        if (isPassed && finalPoints > 0) {
            showPointsOverlay(finalPoints, `اجتياز الامتحان بنجاح بنسبة ${percent}%`);
        }

        // 4. Update UI counters
        updatePointsDisplay();
        renderProgressIndicators();

        // 5. Send update to Supabase
        supabaseClient
            .from('service_student_progress')
            .upsert({
                user_id: currentUser.id,
                lesson_id: lessonId,
                quiz_completed: true,
                quiz_score: correctAnswers,
                quiz_answers: studentQuizAnswers,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,lesson_id' })
            .then(async ({ error }) => {
                if (error) {
                    console.error("Failed to save quiz results on server:", error);
                } else {
                    await silentReloadData();
                    if (currentView === 'lesson' && currentLessonId === lessonId) {
                        renderLessonDetails(lessonId);
                    }
                }
            });

    } catch (err) {
        console.error("Failed to save quiz results:", err);
        const errMsg = err && err.message ? err.message : JSON.stringify(err);
        showToast("حدث خطأ في حفظ النتيجة: " + errMsg, "error");
    }
}


// --- Points Detail Modal ---
async function openPointsLogsModal() {
    const tableBody = document.getElementById('pointsLogsTableBody');
    tableBody.innerHTML = '<tr><td colspan="4" class="text-center"><i class="fas fa-circle-notch fa-spin"></i> جاري التحميل...</td></tr>';
    
    openModal('pointsModal');
    
    try {
        // Calculate breakdown sums
        let audioSum = 0;
        let videoSum = 0;
        let quizSum = 0;
        let attendanceSum = 0;

        pointsLogs.forEach(log => {
            if (log.type === 'audio_completion') audioSum += log.points;
            else if (log.type === 'video_completion') videoSum += log.points;
            else if (log.type === 'quiz') quizSum += log.points;
            else if (log.type === 'attendance') attendanceSum += log.points;
        });

        document.getElementById('points_audio_sum').textContent = audioSum;
        document.getElementById('points_video_sum').textContent = videoSum;
        document.getElementById('points_quiz_sum').textContent = quizSum;
        document.getElementById('points_attendance_sum').textContent = attendanceSum;

        // Render rows
        if (pointsLogs.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" class="text-center">لا توجد سجلات نقاط بعد.</td></tr>';
            return;
        }

        tableBody.innerHTML = pointsLogs.map(log => {
            let typeLabel = '';
            let icon = '';
            
            if (log.type === 'audio_completion') {
                typeLabel = 'سماع فويس';
                icon = '<i class="fas fa-headphones text-gold"></i>';
            } else if (log.type === 'video_completion') {
                typeLabel = 'مشاهدة فيديو';
                icon = '<i class="fas fa-video text-gold"></i>';
            } else if (log.type === 'quiz') {
                typeLabel = 'امتحان';
                icon = '<i class="fas fa-edit text-gold"></i>';
            } else if (log.type === 'attendance') {
                typeLabel = 'حضور الخدمة';
                icon = '<i class="far fa-calendar-check text-gold"></i>';
            } else {
                typeLabel = 'إضافة يدوية';
                icon = '<i class="fas fa-plus-circle text-gold"></i>';
            }

            const formattedDate = new Date(log.created_at).toLocaleDateString('ar-EG', {
                year: 'numeric', month: 'short', day: 'numeric'
            });

            return `
                <tr>
                    <td>${icon} ${typeLabel}</td>
                    <td>${log.details}</td>
                    <td class="text-gold font-bold">+${log.points} 🪙</td>
                    <td>${formattedDate}</td>
                </tr>
            `;
        }).join('');

    } catch (e) {
        tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-red">فشل تحميل سجل النقاط.</td></tr>';
    }
}

// --- Attendance Calendar Modal ---
function openCalendarModal() {
    renderCalendar();
    renderAttendanceList();
    openModal('calendarModal');
}

function renderCalendar() {
    const daysGrid = document.getElementById('calendarGridDays');
    daysGrid.innerHTML = '';
    
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    
    // Set Month Title in Arabic
    const arabicMonths = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    document.getElementById('calendarMonthTitle').textContent = `${arabicMonths[month]} ${year}`;
    
    // Get first day of the month (0 = Sun, 1 = Mon, ..., 6 = Sat)
    // Convert to grid index (St. Peter calendar starts Saturday)
    // Sat = 0, Sun = 1, Mon = 2, Tue = 3, Wed = 4, Thu = 5, Fri = 6
    const firstDayDate = new Date(year, month, 1);
    let startDayIndex = firstDayDate.getDay() + 1; // standard Sun=0, Mon=1...
    if (startDayIndex === 7) startDayIndex = 0; // Saturday=0
    
    // Days in current month
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    // Empty boxes before start day
    for (let i = 0; i < startDayIndex; i++) {
        const emptyBox = document.createElement('div');
        emptyBox.className = 'calendar-day-box empty';
        daysGrid.appendChild(emptyBox);
    }
    
    // Render days
    for (let day = 1; day <= totalDays; day++) {
        const box = document.createElement('div');
        box.className = 'calendar-day-box';
        
        const daySpan = document.createElement('span');
        daySpan.className = 'day-number';
        daySpan.textContent = day;
        box.appendChild(daySpan);
        
        // Check if student attended on this date
        const formattedDateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const attendance = attendanceLogs.find(a => a.attended_date === formattedDateString);
        
        if (attendance) {
            box.classList.add('attended');
            
            const pointsIndicator = document.createElement('span');
            pointsIndicator.className = 'points-indicator';
            pointsIndicator.textContent = `+${attendance.points_earned}`;
            box.appendChild(pointsIndicator);
            
            box.setAttribute('title', `تم الحضور! النقاط المكتسبة: ${attendance.points_earned}`);
        }
        
        daysGrid.appendChild(box);
    }
}

function renderAttendanceList() {
    const listBody = document.getElementById('attendanceTableBody');
    
    if (attendanceLogs.length === 0) {
        listBody.innerHTML = '<tr><td colspan="3" class="text-center">لا توجد أيام حضور مسجلة بعد.</td></tr>';
        return;
    }

    // Days dictionary
    const daysArabic = {
        'Sunday': 'الأحد', 'Monday': 'الاثنين', 'Tuesday': 'الثلاثاء', 'Wednesday': 'الأربعاء',
        'Thursday': 'الخميس', 'Friday': 'الجمعة', 'Saturday': 'السبت'
    };

    listBody.innerHTML = attendanceLogs.map(att => {
        const dateObj = new Date(att.attended_date);
        
        // Find English name of weekday
        const weekdayEng = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
        const weekdayAr = daysArabic[weekdayEng] || weekdayEng;
        
        const formattedDate = dateObj.toLocaleDateString('ar-EG', {
            year: 'numeric', month: 'long', day: 'numeric'
        });

        return `
            <tr>
                <td>${weekdayAr}</td>
                <td>${formattedDate}</td>
                <td class="text-gold font-bold">+${att.points_earned} 🪙</td>
            </tr>
        `;
    }).join('');
}

// Calendar Navigation
document.getElementById('prevMonthBtn').addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() - 1);
    renderCalendar();
});

document.getElementById('nextMonthBtn').addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() + 1);
    renderCalendar();
});

// --- Modal Helper Logic ---
function setupModalHandlers() {
    // Open Qr
    document.getElementById('openQrBtn').addEventListener('click', () => openModal('qrModal'));
    
    // Open Calendar
    document.getElementById('openCalendarBtn').addEventListener('click', openCalendarModal);
    
    // Open Points details
    document.getElementById('pointsTrackerBtn').addEventListener('click', openPointsLogsModal);
    
    // Close buttons on overlays
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeModal(overlay.id);
            }
        });
        
        const closeBtn = overlay.querySelector('.modal-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                closeModal(overlay.id);
            });
        }
    });
}

function openModal(id) {
    const m = document.getElementById(id);
    if (m) {
        m.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(id) {
    const m = document.getElementById(id);
    if (m) {
        m.classList.remove('active');
        document.body.style.overflow = '';
        
        if (id === 'quizModal') {
            // Restore quiz modal elements
            const progBar = document.querySelector('#quizModal .quiz-progress-bar');
            if (progBar) progBar.style.display = 'block';
            
            const nextBtn = document.getElementById('nextQuestionBtn');
            if (nextBtn) {
                nextBtn.style.display = 'inline-block';
            }
            
            const exitReviewBtn = document.getElementById('exitReviewBtn');
            if (exitReviewBtn) {
                exitReviewBtn.style.display = 'none';
            }

            // Reset Quiz states
            quizQuestions = [];
            currentQuestionIndex = 0;
            correctAnswersCount = 0;
            studentQuizAnswers = [];
            currentQuizLessonId = null;
        }
    }
}

async function startLessonQuizReview(lessonId) {
    const lesson = lessonsData.find(l => l.id === lessonId);
    const progress = progressData.find(p => p.lesson_id === lessonId);
    
    if (!progress || !progress.quiz_completed) {
        showToast("⚠️ لم تقم بحل هذا الامتحان بعد.", "warning");
        return;
    }

    showAppLoading(true);
    try {
        // Fetch Quiz Questions
        const { data, error } = await supabaseClient
            .from('service_quizzes')
            .select('*')
            .eq('lesson_id', lessonId)
            .maybeSingle();
            
        if (error) throw error;
        
        if (!data || !data.questions || data.questions.length === 0) {
            showToast("لا يوجد أسئلة لهذا الامتحان.", "warning");
            return;
        }

        const questions = data.questions;
        const studentAnswers = progress.quiz_answers || [];

        // Transition to full page view
        navigateToView('quizFullView');
        currentView = 'quiz_review';

        // Set Breadcrumb
        const arabicCat = lesson.category === 'bible_study' ? 'درس الكتاب المقدس' : (lesson.category === 'coptic' ? 'اللغة القبطية' : 'مدرسة الألحان');
        document.getElementById('quizBreadcrumbCat').textContent = arabicCat;
        document.getElementById('quizBreadcrumbTitle').textContent = `مراجعة امتحان: ${lesson.title}`;

        // Hide progress section
        document.querySelector('#quizFullView .quiz-progress-section').style.display = 'none';
        
        // Hide next button
        document.getElementById('quizNextBtn').style.display = 'none';

        const box = document.getElementById('quizFullWorkspace');
        box.innerHTML = `
            <div class="quiz-review-header" style="margin-bottom: 25px; padding-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.08); text-align: center;">
                <h3 class="text-gold" style="font-size: 18px; font-weight: 900; margin-bottom: 5px;">مراجعة الإجابات</h3>
                <p style="color: var(--text-muted); font-size: 13px;">الدرجة: ${progress.quiz_score || 0} من أصل ${questions.length} أسئلة صحيحة</p>
            </div>
        `;

        // Render each question
        questions.forEach((q, qIdx) => {
            const chosenAns = studentAnswers[qIdx] !== undefined ? studentAnswers[qIdx] : null;
            const correctAns = q.correct_index;
            
            const qDiv = document.createElement('div');
            qDiv.className = 'review-question-item';
            qDiv.style.marginBottom = '25px';
            qDiv.style.borderBottom = '1px solid rgba(255, 255, 255, 0.05)';
            qDiv.style.paddingBottom = '20px';

            const optionsHtml = q.options.map((opt, optIdx) => {
                let borderClass = '';
                let statusIcon = '';
                
                if (chosenAns !== null && optIdx === chosenAns) {
                    if (chosenAns === correctAns) {
                        borderClass = 'correct-answer'; // Green frame
                        statusIcon = '<i class="fas fa-check-circle text-green" style="margin-left: 8px;"></i>';
                    } else {
                        borderClass = 'wrong-answer'; // Red frame
                        statusIcon = '<i class="fas fa-times-circle text-red" style="margin-left: 8px;"></i>';
                    }
                } else if (optIdx === correctAns) {
                    borderClass = 'correct-answer-highlight';
                    statusIcon = '<i class="fas fa-check-circle text-green" style="margin-left: 8px;"></i>';
                } else {
                    borderClass = 'review-mode';
                }

                return `
                    <div class="quiz-option-item-fullpage ${borderClass}" style="cursor: default; pointer-events: none; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; border-radius: 8px;">
                        <span class="option-text" style="color: var(--text-white); font-size: 14px;">${opt}</span>
                        ${statusIcon}
                    </div>
                `;
            }).join('');

            qDiv.innerHTML = `
                <div class="question-header" style="font-size: 13px; color: var(--text-gold); font-weight: 700; margin-bottom: 8px;">السؤال ${qIdx + 1}</div>
                <div class="question-title" style="font-size: 16px; font-weight: 900; color: var(--text-white); margin-bottom: 15px; line-height: 1.4;">${q.question}</div>
                <div class="quiz-options-list-fullpage" style="display: flex; flex-direction: column; gap: 8px;">
                    ${optionsHtml}
                </div>
            `;
            box.appendChild(qDiv);
        });

        // Add back-to-lesson button at bottom
        const footerActionDiv = document.createElement('div');
        footerActionDiv.style.cssText = 'display:flex; justify-content:center; margin-top:20px;';
        footerActionDiv.innerHTML = `
            <button class="action-btn" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; padding:12px 24px; border-radius:8px; cursor:pointer;" onclick="exitQuizToLesson()">
                <i class="fas fa-arrow-left"></i> العودة للدرس
            </button>
        `;
        box.appendChild(footerActionDiv);

    } catch (err) {
        console.error("Error launching quiz review:", err);
        showToast("حدث خطأ في تحميل مراجعة الامتحان.", "error");
    } finally {
        showAppLoading(false);
    }
}

window.exitQuizToLesson = function() {
    navigateToView('lessonView');
    currentView = 'lesson';
    quizQuestions = [];
    currentQuestionIndex = 0;
    correctAnswersCount = 0;
    studentQuizAnswers = [];
    currentQuizLessonId = null;
    currentQuizCategory = null;
};

// --- Success Overlay Animation ---
function showPointsOverlay(points, details) {
    const alertBox = document.getElementById('pointsEarnedAlert');
    document.getElementById('earnedPointsValue').textContent = `+${points} نقطة 🪙`;
    document.getElementById('earnedPointsDesc').textContent = details;
    
    alertBox.classList.add('show');
    
    // Play subtle audio if available
    
    setTimeout(() => {
        alertBox.classList.remove('show');
    }, 3500);
}

// --- Utils & Toast notification ---
function copyStudentCode() {
    const code = document.getElementById('studentCode').textContent;
    navigator.clipboard.writeText(code).then(() => {
        showToast("📋 تم نسخ كود الطالب بنجاح!", "success");
    }).catch(err => {
        showToast("فشل نسخ الكود.", "error");
    });
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `custom-toast toast-${type}`;
    
    let icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-times-circle';
    else if (type === 'warning') icon = 'fa-exclamation-triangle';
    else if (type === 'info') icon = 'fa-info-circle';
    
    toast.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'slideInLeft 0.3s ease reverse forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- Loading States (Hybrid Loader) ---
function showAppLoading(show, forceFullOverlay = false) {
    if (forceFullOverlay) {
        let loader = document.getElementById('appLoader');
        if (!loader && show) {
            loader = document.createElement('div');
            loader.id = 'appLoader';
            loader.className = 'app-global-loader';
            loader.innerHTML = '<div class="loader-spinner"></div>';
            document.body.appendChild(loader);
        } else if (loader && !show) {
            loader.remove();
        }
    } else {
        if (show) {
            showTopProgressBar();
        } else {
            hideTopProgressBar();
        }
    }
}

// ===== TOP PROGRESS BAR =====
function showTopProgressBar() {
    const topBar = document.getElementById('topProgressBar');
    if (!topBar) return;
    topBar.style.width = '0%';
    topBar.classList.add('active');
    setTimeout(() => { topBar.style.width = '30%'; }, 50);
    setTimeout(() => { topBar.style.width = '60%'; }, 250);
}

function hideTopProgressBar() {
    const topBar = document.getElementById('topProgressBar');
    if (!topBar) return;
    topBar.style.width = '100%';
    setTimeout(() => {
        topBar.classList.remove('active');
        setTimeout(() => { topBar.style.width = '0%'; }, 400);
    }, 200);
}

// ===== UPLOAD PROGRESS =====
let uploadStartTime = 0;
function showUploadProgress(pct, filename = 'الملف') {
    const uploadOverlay = document.getElementById('uploadProgressOverlay');
    if (!uploadOverlay) return;
    uploadOverlay.classList.add('show');
    document.getElementById('uploadProgressLabel').textContent = `جاري رفع ${filename}...`;
    document.getElementById('uploadProgressFill').style.width = pct + '%';
    document.getElementById('uploadProgressPct').textContent = Math.round(pct) + '%';
    if (uploadStartTime > 0) {
        const elapsed = (Date.now() - uploadStartTime) / 1000;
        const speed = pct > 0 ? Math.round((pct / 100 * 1) / elapsed * 1024) : 0;
        document.getElementById('uploadProgressSpeed').textContent = speed > 0 ? speed + ' KB/s' : 'جاري الحساب...';
    }
}

function hideUploadProgress() {
    const uploadOverlay = document.getElementById('uploadProgressOverlay');
    if (!uploadOverlay) return;
    document.getElementById('uploadProgressFill').style.width = '100%';
    document.getElementById('uploadProgressPct').textContent = '100%';
    setTimeout(() => { uploadOverlay.classList.remove('show'); }, 800);
}

// ===== CLOUDINARY UPLOAD =====
const CLOUDINARY_CLOUD = 'driqr3dec';
const CLOUDINARY_PRESET = 'church_preset';
async function uploadToCloudinary(blob, filename = 'image') {
    return new Promise((resolve, reject) => {
        uploadStartTime = Date.now();
        const formData = new FormData();
        formData.append('file', blob, filename);
        formData.append('upload_preset', CLOUDINARY_PRESET);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`);

        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const pct = (e.loaded / e.total) * 100;
                showUploadProgress(pct, filename);
            }
        });

        xhr.onload = () => {
            if (xhr.status === 200) {
                const result = JSON.parse(xhr.responseText);
                hideUploadProgress();
                resolve(result.secure_url);
            } else {
                reject(new Error('فشل رفع الصورة إلى Cloudinary'));
            }
        };

        xhr.onerror = () => reject(new Error('خطأ في الاتصال بـ Cloudinary'));
        xhr.send(formData);
    });
}

// ===== EDIT STUDENT PROFILE DIALOG LOGIC =====
let editCropperInstance = null;
let editCroppedBlob = null;

// Opens the edit profile modal and binds events
function openEditProfileModalAndTriggerPhoto() {
    openModal('editProfileModal');
    // Pre-populate fields
    document.getElementById('editProfileFullName').value = currentProfile.full_name || '';
    document.getElementById('editProfilePhone').value = currentProfile.phone || '';
    document.getElementById('editProfileParentPhone').value = currentProfile.parent_phone || '';
    document.getElementById('editProfileEmail').value = currentProfile.email || '';
    document.getElementById('editProfileAddress').value = currentProfile.address || '';
    document.getElementById('editProfilePassword').value = '';
    
    // Clear validation errors
    document.querySelectorAll('#editProfileForm .form-control').forEach(el => el.classList.remove('is-invalid'));
    document.querySelectorAll('#editProfileForm .error-message').forEach(el => el.style.display = 'none');
    
    editCroppedBlob = null;
    const avatarContainer = document.getElementById('editProfileAvatarContainer');
    if (currentProfile.avatar_url) {
        avatarContainer.innerHTML = `<img src="${currentProfile.avatar_url}" style="width:100%; height:100%; object-fit:cover;" alt="avatar">`;
    } else {
        avatarContainer.innerHTML = `<i class="fas fa-user-graduate" id="editProfileDefaultAvatarIcon" style="font-size: 2.5rem; color: rgba(255,255,255,0.3);"></i>`;
    }
}

// Setup edit profile logic
function initEditProfileEvents() {
    const openBtn = document.getElementById('openEditProfileBtn');
    if (openBtn) {
        openBtn.addEventListener('click', () => openEditProfileModalAndTriggerPhoto());
    }

    const cancelBtn = document.getElementById('btnCancelEditProfile');
    const closeBtn = document.getElementById('closeEditProfileBtn');
    const closeHandler = () => {
        closeModal('editProfileModal');
        if (editCropperInstance) {
            editCropperInstance.destroy();
            editCropperInstance = null;
        }
    };
    if (cancelBtn) cancelBtn.addEventListener('click', closeHandler);
    if (closeBtn) closeBtn.addEventListener('click', closeHandler);

    // Camera button click triggers avatar input selector
    const triggerBtn = document.getElementById('btnTriggerAvatarFile');
    if (triggerBtn) {
        triggerBtn.addEventListener('click', () => {
            document.getElementById('editProfileAvatarFile').click();
        });
    }

    // Handle avatar file input change -> open Cropper
    const avatarInput = document.getElementById('editProfileAvatarFile');
    if (avatarInput) {
        avatarInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;

            if (file.size > 5 * 1024 * 1024) {
                showToast("⚠️ حجم الصورة كبير جداً. يجب أن يكون أقل من 5 ميجابايت.", "warning");
                return;
            }

            const reader = new FileReader();
            reader.onload = function(ev) {
                const cropperModalEl = document.getElementById('cropperModalOverlay');
                const cropperImg = document.getElementById('cropperImage');
                
                cropperImg.src = ev.target.result;
                cropperModalEl.style.display = 'flex';
                
                if (editCropperInstance) {
                    editCropperInstance.destroy();
                }
                
                editCropperInstance = new Cropper(cropperImg, {
                    aspectRatio: 1,
                    viewMode: 1,
                    background: false,
                    autoCropArea: 1
                });
            };
            reader.readAsDataURL(file);
        });
    }

    // Save cropped image
    const btnCropSave = document.getElementById('btnCropSave');
    if (btnCropSave) {
        btnCropSave.addEventListener('click', () => {
            if (!editCropperInstance) return;
            editCropperInstance.getCroppedCanvas({ width: 400, height: 400 }).toBlob((blob) => {
                editCroppedBlob = blob;
                const url = URL.createObjectURL(blob);
                const avatarContainer = document.getElementById('editProfileAvatarContainer');
                avatarContainer.innerHTML = `<img src="${url}" style="width:100%; height:100%; object-fit:cover;" alt="preview">`;
                
                document.getElementById('cropperModalOverlay').style.display = 'none';
                editCropperInstance.destroy();
                editCropperInstance = null;
            }, 'image/jpeg', 0.9);
        });
    }

    // Cancel cropping
    const btnCropCancel = document.getElementById('btnCropCancel');
    if (btnCropCancel) {
        btnCropCancel.addEventListener('click', () => {
            document.getElementById('cropperModalOverlay').style.display = 'none';
            if (editCropperInstance) {
                editCropperInstance.destroy();
                editCropperInstance = null;
            }
        });
    }

    // Password view toggle
    const togglePassBtn = document.getElementById('btnToggleEditPass');
    if (togglePassBtn) {
        togglePassBtn.addEventListener('click', () => {
            const passInput = document.getElementById('editProfilePassword');
            const passIcon = document.getElementById('toggleEditPassIcon');
            if (passInput.type === 'password') {
                passInput.type = 'text';
                passIcon.classList.remove('fa-eye');
                passIcon.classList.add('fa-eye-slash');
            } else {
                passInput.type = 'password';
                passIcon.classList.remove('fa-eye-slash');
                passIcon.classList.add('fa-eye');
            }
        });
    }

    // Profile form submit update
    const form = document.getElementById('editProfileForm');
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            const phone = document.getElementById('editProfilePhone').value.trim();
            const parentPhone = document.getElementById('editProfileParentPhone').value.trim();
            const email = document.getElementById('editProfileEmail').value.trim();
            const address = document.getElementById('editProfileAddress').value.trim();
            const password = document.getElementById('editProfilePassword').value;

            // Clear errors
            document.querySelectorAll('#editProfileForm .form-control').forEach(el => el.classList.remove('is-invalid'));
            document.querySelectorAll('#editProfileForm .error-message').forEach(el => el.style.display = 'none');

            let isValid = true;
            const phoneRegex = /^\+201[0-2,5][0-9]{8}$/;
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

            if (!phoneRegex.test(phone)) {
                showEditFormError('editProfilePhone', 'editProfilePhoneError', 'رقم الهاتف المصري غير صحيح (+201XXXXXXXXX).');
                isValid = false;
            }
            if (!phoneRegex.test(parentPhone)) {
                showEditFormError('editProfileParentPhone', 'editProfileParentPhoneError', 'رقم تليفون ولي الأمر غير صحيح (+201XXXXXXXXX).');
                isValid = false;
            }
            if (!emailRegex.test(email)) {
                showEditFormError('editProfileEmail', 'editProfileEmailError', 'البريد الإلكتروني غير صحيح.');
                isValid = false;
            }
            if (!address) {
                showEditFormError('editProfileAddress', 'editProfileAddressError', 'عنوان المنزل مطلوب.');
                isValid = false;
            }
            if (password && password.length < 8) {
                showEditFormError('editProfilePassword', 'editProfilePasswordError', 'يجب ألا تقل كلمة المرور عن 8 رموز.');
                isValid = false;
            }

            if (!isValid) return;

            showAppLoading(true);

            try {
                let avatarUrl = currentProfile.avatar_url;

                // 1. Upload new image if cropped
                if (editCroppedBlob) {
                    try {
                        avatarUrl = await uploadToCloudinary(editCroppedBlob, `avatar_${currentUser.id}`);
                    } catch (uploadErr) {
                        console.error(uploadErr);
                        showToast("⚠️ فشل رفع الصورة الشخصية لـ Cloudinary، جاري حفظ البيانات الأخرى...", "warning");
                    }
                }

                // 2. Update Supabase Auth if password changes
                if (password) {
                    const { error: authErr } = await supabaseClient.auth.updateUser({
                        password: password
                    });
                    if (authErr) throw authErr;
                }

                // 3. Update public profiles table
                const { error: profileErr } = await supabaseClient
                    .from('profiles')
                    .update({
                        phone: phone,
                        parent_phone: parentPhone,
                        email: email,
                        address: address,
                        avatar_url: avatarUrl
                    })
                    .eq('id', currentUser.id);

                if (profileErr) throw profileErr;

                // Update local profile representation
                currentProfile.phone = phone;
                currentProfile.parent_phone = parentPhone;
                currentProfile.email = email;
                currentProfile.address = address;
                currentProfile.avatar_url = avatarUrl;

                // Re-init header profile views
                initStudentProfile();

                showToast("🎉 تم تحديث بيانات حسابك بنجاح!", "success");
                closeModal('editProfileModal');

            } catch (err) {
                console.error("Failed to update student profile:", err);
                showToast("❌ فشل تحديث البيانات: " + (err.message || err), "error");
            } finally {
                showAppLoading(false);
            }
        });
    }
}

function showEditFormError(inputId, errorId, msg) {
    const input = document.getElementById(inputId);
    const err = document.getElementById(errorId);
    if (input) input.classList.add('is-invalid');
    if (err) {
        err.textContent = msg;
        err.style.display = 'block';
    }
}

// --- Silent Auto-Refresh in the background every 90 seconds ---
async function silentRefreshData() {
    if (!currentUser) return;
    try {
        // Fetch profile to see if points changed
        const { data: newProfile, error: profileErr } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();
            
        if (profileErr) throw profileErr;
        
        const oldPoints = currentProfile.points || 0;
        const newPoints = newProfile.points || 0;
        
        currentProfile = newProfile; // update local cache
        
        // Sync new fields
        initStudentProfile();
        
        // Fetch other data silently
        const { data: progress, error: progErr } = await supabaseClient
            .from('service_student_progress')
            .select('*')
            .eq('user_id', currentUser.id);
        if (!progErr) progressData = progress || [];

        const { data: logs, error: logsErr } = await supabaseClient
            .from('service_points_log')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });
        if (!logsErr) pointsLogs = logs || [];

        const { data: atts, error: attsErr } = await supabaseClient
            .from('service_attendance')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('attended_date', { ascending: false });
        if (!attsErr) attendanceLogs = atts || [];

        const { data: restrictions, error: restErr } = await supabaseClient
            .from('service_student_restrictions')
            .select('*')
            .eq('user_id', currentUser.id);
        if (!restErr) restrictionsData = restrictions || [];

        // Redraw UI sections silently
        if (document.getElementById('dashboardView').classList.contains('active')) {
            updateDashboardProgress();
        } else if (document.getElementById('categoryView').classList.contains('active')) {
            if (currentCategory) {
                renderCategoryLessons(currentCategory);
            }
        }

        // If points increased, show a subtle flash
        if (newPoints > oldPoints) {
            showToast(`🎉 حصلت على نقاط جديدة! نقاطك الآن: ${newPoints}`, "success");
            
            // Add a subtle flash animation on the points element
            const pointsEl = document.getElementById('totalPoints');
            if (pointsEl) {
                pointsEl.style.transition = 'color 0.3s ease, transform 0.3s ease';
                pointsEl.style.color = '#10b981'; // Green
                pointsEl.style.transform = 'scale(1.2)';
                setTimeout(() => {
                    pointsEl.style.color = '';
                    pointsEl.style.transform = '';
                }, 1000);
            }
        }
    } catch (err) {
        console.warn("Background auto-refresh error:", err.message || err);
    }
}