// =======================================================
// ST. PETER AND PAUL CHURCH - SERVANT SYSTEM CONTROLLER
// Fully compatible with current control.html structure
// =======================================================

let currentUser = null;
let currentProfile = null;

// Class Listings mapping (Servant grouped class -> Student individual grades)
const classMap = {
    'KG1 و KG2': ['KG1', 'KG2'],
    'الأول والثاني الابتدائي': ['الأول الابتدائي', 'الثاني الابتدائي'],
    'الثالث والرابع الابتدائي': ['الثالث الابتدائي', 'الرابع الابتدائي'],
    'الخامس والسادس الابتدائي': ['الخامس الابتدائي', 'السادس الابتدائي'],
    'الأول الإعدادي': ['الأول الإعدادي'],
    'الثاني الإعدادي': ['الثاني الإعدادي'],
    'الثالث الإعدادي': ['الثالث الإعدادي'],
    'الأول والثاني والثالث الثانوي': ['الأول الثانوي', 'الثاني الثانوي', 'الثالث الثانوي']
};

let studentProfiles = [];
let allWebsiteUsers = [];
let studentLessons = [];
let studentProgress = [];
let pointsLogs = [];
let attendanceLogs = [];
let studentRestrictions = [];
let selectedStudentId = null;
let attendanceSessionActive = false;
let pendingAttendanceStudent = null;
let currentCalMonth = new Date().getMonth();
let currentCalYear = new Date().getFullYear();
let currentCategoryDetailType = null;



// Quiz Builder State
let quizQuestions = [];

// QR Code Scanner State
let html5QrcodeScanner = null;
let isCameraActive = false;

// Student being edited
let editingStudentId = null;
let editingUserRole = null;
let coordinatorViewMode = 'my_class_students'; // 'my_class_students', 'my_class', 'all_servants', 'all_students'

// =============================================
// INIT
// =============================================
window.addEventListener('DOMContentLoaded', async () => {
    await checkServantAuth();
    setupNavigationTabs();
    setupClassSelector();
    setupCoordinatorFilters();
    setupSearchAndSort();
    setupContentManagerForm();
    setupPointsAdjustmentForm();
    setupAttendanceScanner();
    setupAttendanceConfirmModals();
    setupStudentEditModal();
});

// =============================================
// AUTH GUARD
// =============================================
async function checkServantAuth() {
    showAppLoading(true, true);
    try {
        console.log('🔐 Control: Starting auth check...');

        if (!supabaseClient) {
            throw new Error("supabaseClient غير محدد. تأكد من تشغيل ملف supabase-config.js أولاً.");
        }

        const result = await authService.checkAuth();
        console.log('🔐 Control: Auth result:', result ? `role=${result.profile?.role}` : 'null');

        if (!result || !result.session) {
            // Not logged in → redirect to login
            console.warn('🔐 Control: No session, redirecting to login...');
            window.location.replace('../login.html');
            return;
        }

        currentUser = result.session.user;
        currentProfile = result.profile;

        if (currentProfile.role !== 'خادم' && currentProfile.role !== 'امين خدمه') {
            if (currentProfile.role === 'اب كاهن') {
                showToast("✝️ يا ابونا، لوحة تحكم الخدمة مخصصة للخدام فقط.", "warning");
            } else {
                showToast("⚠️ غير مصرح لك بدخول لوحة الخدمة.", "error");
            }
            setTimeout(() => { window.location.replace("../index.html"); }, 2200);
            return;
        }

        const firstName = currentProfile.full_name.split(' ')[0];
        const nameEl = document.getElementById('servantName');
        if (nameEl) {
            nameEl.textContent =
                currentProfile.role === 'امين خدمه'
                    ? `أهلاً، أمين الخدمة: ${firstName}`
                    : `أهلاً، خادم: ${firstName}`;
        }

        // Change-class button: ONLY for 'امين خدمه'
        const btnChangeClass = document.getElementById('btnChangeClass');
        if (btnChangeClass) {
            btnChangeClass.style.display = currentProfile.role === 'امين خدمه' ? '' : 'none';
        }

        // Coordinator Filter Bar: ONLY for 'امين خدمه'
        const coordBar = document.getElementById('coordinatorFilterBar');
        if (coordBar) {
            coordBar.style.display = currentProfile.role === 'امين خدمه' ? 'flex' : 'none';
        }

        checkClassGroupSession();

    } catch (err) {
        console.error("❌ Servant auth check failed:", err);
        // Show visible error in the grid area instead of silent redirect
        const grid = document.getElementById('studentsGrid');
        if (grid) {
            grid.innerHTML = `
                <div class="empty-state" style="color:#ff6b6b;padding:40px;text-align:center;border:1px dashed rgba(229,80,80,0.3);border-radius:12px;background:rgba(229,80,80,0.05);">
                    <i class="fas fa-exclamation-triangle" style="font-size:40px;margin-bottom:15px;"></i>
                    <h3 style="font-weight:900;margin-bottom:8px;">خطأ في التحقق من الهوية</h3>
                    <code style="display:block;background:rgba(0,0,0,0.3);padding:10px;border-radius:6px;font-size:12px;margin-bottom:15px;word-break:break-all;font-family:monospace;">${err.message || String(err)}</code>
                    <button onclick="window.location.replace('../login.html')" class="action-btn primary-gold" style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;">
                        <i class="fas fa-sign-in-alt"></i> إعادة تسجيل الدخول
                    </button>
                </div>
            `;
        }
    } finally {
        showAppLoading(false, true);
    }
}

// =============================================
// CLASS GROUP SESSION
// =============================================
function checkClassGroupSession() {
    // For regular servants: ALWAYS use their profile class_year (ignore sessionStorage)
    // This prevents servants from seeing other classes even if sessionStorage was polluted
    if (currentProfile.role === 'خادم') {
        let servantClassGroup = null;

        // Find the matching class group from classMap
        for (const [groupName, grades] of Object.entries(classMap)) {
            if (groupName === currentProfile.class_year || grades.includes(currentProfile.class_year)) {
                servantClassGroup = groupName;
                break;
            }
        }

        if (servantClassGroup) {
            // Lock servant to their assigned class group
            sessionStorage.setItem('activeClassGroup', servantClassGroup);
            closeModal('classSelectorModal');
            updateClassHeaderBadge(servantClassGroup);
            reloadDashboardData();
        } else if (currentProfile.class_year) {
            // class_year exists but doesn't match classMap groups - use it directly
            sessionStorage.setItem('activeClassGroup', currentProfile.class_year);
            closeModal('classSelectorModal');
            updateClassHeaderBadge(currentProfile.class_year);
            reloadDashboardData();
        } else {
            // Servant has NO class_year assigned - show error, not all classes
            console.warn('⚠️ Servant has no class_year assigned in profile.');
            const grid = document.getElementById('studentsGrid');
            if (grid) {
                grid.innerHTML = `
                    <div class="empty-state" style="color:#ffd166;padding:40px;text-align:center;border:1px dashed rgba(212,160,23,0.3);border-radius:12px;background:rgba(212,160,23,0.05);">
                        <i class="fas fa-exclamation-circle" style="font-size:40px;margin-bottom:15px;color:#ffd166;"></i>
                        <h3 style="font-weight:900;margin-bottom:8px;">لم يتم تعيين فصل لك</h3>
                        <p style="opacity:0.8;margin-bottom:15px;">لم يتم تحديد الفصل الدراسي المسؤول عنك. يرجى التواصل مع أمين الخدمة لإضافة فصلك.</p>
                    </div>
                `;
            }
            showAppLoading(false);
        }
        return;
    }

    // For coordinator (امين خدمه): use sessionStorage or prompt to pick a class
    let activeGroup = sessionStorage.getItem('activeClassGroup');

    if (!activeGroup) {
        // Try to derive from profile class_year
        let derivedGroup = null;
        for (const [groupName, grades] of Object.entries(classMap)) {
            if (groupName === currentProfile.class_year || grades.includes(currentProfile.class_year)) {
                derivedGroup = groupName;
                break;
            }
        }
        if (derivedGroup) {
            sessionStorage.setItem('activeClassGroup', derivedGroup);
            activeGroup = derivedGroup;
        } else if (currentProfile.class_year) {
            sessionStorage.setItem('activeClassGroup', currentProfile.class_year);
            activeGroup = currentProfile.class_year;
        } else {
            // Coordinator with no class set: open class picker
            openClassSelectorModal();
            return;
        }
    }

    closeModal('classSelectorModal');
    updateClassHeaderBadge(activeGroup || 'كل الفصول');
    reloadDashboardData();
}

function updateClassHeaderBadge(groupName) {
    const el = document.getElementById('servantClass');
    if (el) el.textContent = `فصل الخدمة: ${groupName}`;
}

// =============================================
// CLASS SELECTOR
// =============================================
function setupClassSelector() {
    const btnChange = document.getElementById('btnChangeClass');
    if (btnChange) btnChange.addEventListener('click', openClassSelectorModal);

    document.querySelectorAll('.class-group-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            if (currentProfile && currentProfile.role === 'خادم') {
                showToast("⚠️ عذراً، لا يمكنك تغيير الفصل المسؤول عنه. فقط أمين الخدمة يمتلك هذه الصلاحية.", "warning");
                return;
            }
            const selectedClass = this.getAttribute('data-class');
            sessionStorage.setItem('activeClassGroup', selectedClass);
            closeModal('classSelectorModal');
            updateClassHeaderBadge(selectedClass);
            reloadDashboardData();
            showToast(`📂 تم تفعيل فصل: [ ${selectedClass} ]`, "success");
        });
    });
}

function openClassSelectorModal() {
    document.getElementById('classSelectorModal').classList.add('show');
}

// =============================================
// NAV TABS
// =============================================
function setupNavigationTabs() {
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.nav-tab-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            const targetPane = this.getAttribute('data-tab');
            showPane(targetPane);

            cleanupScanner();
            if (targetPane === 'pane_attendance_manager') {
                renderTodayAttendanceList();
            } else if (targetPane === 'pane_content_manager') {
                loadCurriculumLessons();
            }
        });
    });

    document.querySelectorAll('.inner-tab-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.inner-tab-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            const targetSubpane = this.getAttribute('data-subtab');
            document.querySelectorAll('.inner-dashboard-subpane').forEach(sp => sp.classList.remove('active'));
            const target = document.getElementById(targetSubpane);
            if (target) target.classList.add('active');

            if (targetSubpane === 'subpane_published_lessons') loadCurriculumLessons();
        });
    });
}

function showPane(paneId) {
    document.querySelectorAll('.dashboard-pane').forEach(p => p.classList.remove('active'));
    const pane = document.getElementById(paneId);
    if (pane) pane.classList.add('active');
}

// =============================================
// DATA FETCHING
// =============================================
async function reloadDashboardData() {
    const activeClassGroup = sessionStorage.getItem('activeClassGroup');

    showAppLoading(true);

    try {
        if (!supabaseClient) {
            throw new Error("Supabase client is not initialized. تأكد من صحة الاتصال بقاعدة البيانات.");
        }

        const targetStudentGrades = activeClassGroup ? (classMap[activeClassGroup] || [activeClassGroup]) : [];

        let profilesQuery = supabaseClient.from('profiles').select('*');

        if (currentProfile.role === 'خادم') {
            // Standard servant: only fetch students in their assigned class grades
            profilesQuery = profilesQuery.eq('role', 'مخدوم');
            if (targetStudentGrades.length > 0) {
                profilesQuery = profilesQuery.in('class_year', targetStudentGrades);
            }
        } else if (currentProfile.role === 'امين خدمه') {
            // Coordinator view modes:
            if (coordinatorViewMode === 'my_class_students') {
                profilesQuery = profilesQuery
                    .eq('role', 'مخدوم')
                    .in('class_year', targetStudentGrades);
            } else if (coordinatorViewMode === 'my_class') {
                // Servants with class_year = activeClassGroup AND students with class_year in targetStudentGrades
                profilesQuery = profilesQuery
                    .in('role', ['مخدوم', 'خادم'])
                    .in('class_year', [activeClassGroup, ...targetStudentGrades]);
            } else if (coordinatorViewMode === 'all_servants') {
                // All servants
                profilesQuery = profilesQuery.eq('role', 'خادم');
            } else {
                // All students
                profilesQuery = profilesQuery.eq('role', 'مخدوم');
            }
        } else {
            // Fallback
            profilesQuery = profilesQuery.eq('role', 'مخدوم');
        }

        const { data: students, error: studentsErr } = await profilesQuery;
        if (studentsErr) throw studentsErr;
        studentProfiles = students || [];

        // Fetch lessons — non-fatal (table may not exist yet)
        try {
            let lessonsQuery = supabaseClient
                .from('service_lessons')
                .select('*')
                .order('created_at', { ascending: true });

            if (targetStudentGrades.length > 0) {
                lessonsQuery = lessonsQuery.in('class_year', targetStudentGrades);
            }

            const { data: lessons, error: lessonsErr } = await lessonsQuery;
            if (lessonsErr) {
                console.warn("service_lessons query failed (table may not exist yet):", lessonsErr.message);
                studentLessons = [];
            } else {
                studentLessons = lessons || [];
            }
        } catch (e) {
            console.warn("service_lessons fetch error:", e);
            studentLessons = [];
        }

        const studentIds = studentProfiles.map(s => s.id);
        if (studentIds.length > 0) {
            // Fetch progress — non-fatal
            try {
                const { data: progress, error: progressErr } = await supabaseClient
                    .from('service_student_progress').select('*').in('user_id', studentIds);
                studentProgress = progressErr ? [] : (progress || []);
                if (progressErr) console.warn("service_student_progress error:", progressErr.message);
            } catch (e) { studentProgress = []; }

            // Fetch points logs — non-fatal
            try {
                const { data: pLogs, error: pointsErr } = await supabaseClient
                    .from('service_points_log').select('*').in('user_id', studentIds);
                pointsLogs = pointsErr ? [] : (pLogs || []);
                if (pointsErr) console.warn("service_points_log error:", pointsErr.message);
            } catch (e) { pointsLogs = []; }

            // Fetch attendance logs — non-fatal
            try {
                const { data: aLogs, error: attErr } = await supabaseClient
                    .from('service_attendance').select('*').in('user_id', studentIds);
                attendanceLogs = attErr ? [] : (aLogs || []);
                if (attErr) console.warn("service_attendance error:", attErr.message);
            } catch (e) { attendanceLogs = []; }

            // Fetch restrictions — non-fatal
            try {
                const { data: restrictions, error: restErr } = await supabaseClient
                    .from('service_student_restrictions').select('*').in('user_id', studentIds);
                studentRestrictions = restErr ? [] : (restrictions || []);
                if (restErr) console.warn("service_student_restrictions error:", restErr.message);
            } catch (e) { studentRestrictions = []; }

        } else {
            studentProgress = []; pointsLogs = []; attendanceLogs = []; studentRestrictions = [];
        }

        renderDashboardStats();
        renderStudentsDirectory();

    } catch (err) {
        console.error("Dashboard reload failed:", err);
        showToast("خطأ أثناء جلب بيانات الفصل الدراسي: " + (err.message || err), "error");

        // Hide the spinning loader inside the grid and show an error message
        const grid = document.getElementById('studentsGrid');
        if (grid) {
            grid.innerHTML = `
                <div class="empty-state" style="color: var(--danger); border: 1px dashed rgba(229, 80, 80, 0.3); padding: 30px; border-radius: 12px; background: rgba(229, 80, 80, 0.05); text-align:center;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 40px; margin-bottom: 15px; color: var(--danger);"></i>
                    <h3 style="font-weight: 900; margin-bottom: 8px;">فشل تحميل دليل المخدومين</h3>
                    <p style="font-size: 14px; opacity: 0.8; margin-bottom: 8px;">حدث خطأ أثناء الاتصال بقاعدة البيانات.</p>
                    <code style="display: block; background: rgba(0,0,0,0.3); padding: 8px; border-radius: 6px; font-size: 12px; color: var(--text-2); max-width: 100%; word-break: break-all; font-family: monospace;">${escHtml(err.message || String(err))}</code>
                    <div style="margin-top: 15px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                        <button onclick="reloadDashboardData()" class="action-btn primary-gold" style="display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px;">
                            <i class="fas fa-sync-alt"></i> إعادة المحاولة
                        </button>
                        <button onclick="window.location.href='../login.html'" class="action-btn" style="display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; background: rgba(229,80,80,0.15); border-color: rgba(229,80,80,0.4);">
                            <i class="fas fa-sign-in-alt"></i> إعادة تسجيل الدخول
                        </button>
                    </div>
                </div>
            `;
        }
    } finally {
        showAppLoading(false);
    }
}


// =============================================
// STATS
// =============================================
function renderDashboardStats() {
    const makhdoumProfiles = studentProfiles.filter(s => s.role === 'مخدوم');

    document.getElementById('stat_total_students').textContent = studentProfiles.length;

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const activeCount = studentProfiles.filter(s => s.last_seen >= oneDayAgo || s.online_status).length;
    document.getElementById('stat_active_today').textContent = activeCount;

    const totalPoints = makhdoumProfiles.reduce((sum, s) => sum + (s.points || 0), 0);
    const avgPoints = makhdoumProfiles.length > 0 ? Math.round(totalPoints / makhdoumProfiles.length) : 0;
    document.getElementById('stat_avg_points').textContent = avgPoints;
}

// =============================================
// SEARCH & SORT
// =============================================
function setupSearchAndSort() {
    document.getElementById('searchStudentInput').addEventListener('input', renderStudentsDirectory);
    document.getElementById('sortSelector').addEventListener('change', renderStudentsDirectory);
    document.getElementById('viewFilter').addEventListener('change', handleViewFilterChange);
}

async function handleViewFilterChange() {
    const viewMode = document.getElementById('viewFilter').value;
    if (viewMode === 'all_users') {
        showAppLoading(true);
        try {
            const { data: allUsers, error } = await supabaseClient
                .from('profiles').select('*').order('last_seen', { ascending: false });
            if (error) throw error;
            allWebsiteUsers = allUsers || [];
        } catch (err) {
            showToast('فشل جلب كل مستخدمي الموقع.', 'error');
        } finally {
            showAppLoading(false);
        }
    }
    renderStudentsDirectory();
}

// =============================================
// STUDENTS GRID
// =============================================
function renderStudentsDirectory() {
    const grid = document.getElementById('studentsGrid');
    const query = document.getElementById('searchStudentInput').value.trim().toLowerCase();
    const sortVal = document.getElementById('sortSelector').value;
    const viewMode = document.getElementById('viewFilter').value;

    grid.innerHTML = '';

    const sourceList = viewMode === 'all_users' ? allWebsiteUsers : studentProfiles;
    let list = sourceList.filter(s =>
        (s.full_name || '').toLowerCase().includes(query) ||
        (s.phone || '').includes(query)
    );

    if (sortVal === 'latest_login') list.sort((a, b) => new Date(b.last_seen || 0) - new Date(a.last_seen || 0));
    else if (sortVal === 'points_desc') list.sort((a, b) => (b.points || 0) - (a.points || 0));
    else if (sortVal === 'points_asc') list.sort((a, b) => (a.points || 0) - (b.points || 0));
    else if (sortVal === 'name_asc') list.sort((a, b) => a.full_name.localeCompare(b.full_name, 'ar'));
    else if (sortVal === 'name_desc') list.sort((a, b) => b.full_name.localeCompare(a.full_name, 'ar'));

    if (list.length === 0) {
        grid.innerHTML = `<div class="empty-state"><i class="fas fa-search-minus"></i><p>لا يوجد مستخدمون يطابقون معايير البحث.</p></div>`;
        return;
    }

    list.forEach(student => {
        const card = document.createElement('div');
        card.className = 'student-detail-card';

        const statusClass = student.online_status ? 'online' : 'offline';
        const avatarIcon = student.role === 'مخدوم' ? 'fa-user-graduate' : 'fa-chalkboard-teacher';
        const avatar = student.avatar_url
            ? `<img src="${student.avatar_url}" class="card-avatar-img" alt="الصورة الشخصية">`
            : `<div class="card-default-avatar"><i class="fas ${avatarIcon}"></i></div>`;
            
        const code = getAttendanceCode(student);
        const waLink = getWhatsAppLink(student.phone);

        const pointsBadge = student.role === 'مخدوم'
            ? `<span class="points-glowing-badge">🪙 ${student.points || 0}</span>`
            : `<span class="role-glowing-badge" style="background: rgba(212, 160, 23, 0.15); border: 1px solid var(--border-gold); padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; color: var(--text-gold);"><i class="fas fa-user-shield"></i> ${student.role}</span>`;

        const attendanceRow = student.role === 'مخدوم'
            ? `
                <div class="info-item">
                    <span class="label">كود الحضور:</span>
                    <span class="value code-badge">${code}</span>
                </div>
            `
            : '';

        const classLabel = student.role === 'مخدوم' ? 'الصف' : 'فصل الخدمة';
        const classValue = student.class_year || 'غير محدد';

        const analyticsBtn = student.role === 'مخدوم'
            ? `
                <button class="action-btn primary-gold" onclick="openAnalyticsModal('${student.id}')">
                    <i class="fas fa-chart-line"></i> تحليل الأداء
                </button>
            `
            : '';

        const canEdit = currentProfile.role === 'امين خدمه' || student.role === 'مخدوم';
        const editBtn = canEdit
            ? `
                <button class="action-btn secondary-adjust" onclick="openStudentEditModal('${student.id}')">
                    <i class="fas fa-user-edit"></i> تعديل الحساب
                </button>
            `
            : '';

        card.innerHTML = `
            <div class="card-top-section">
                <div class="card-avatar-wrapper">
                    ${avatar}
                    <span class="card-status-dot ${statusClass}" title="${student.online_status ? 'متصل الآن' : 'غير متصل'}"></span>
                </div>
                <div class="card-name-title">
                    <h3>${escHtml(student.full_name)}</h3>
                    <span class="card-grade-badge">${student.role === 'مخدوم' ? 'الصف: ' + classValue : '🎖️ ' + classValue}</span>
                </div>
                ${pointsBadge}
            </div>

            <div class="card-info-grid">
                ${attendanceRow}
                <div class="info-item">
                    <span class="label">الدور:</span>
                    <span class="value" style="font-weight: bold; color: var(--secondary-color);">${student.role}</span>
                </div>
                <div class="info-item">
                    <span class="label">آخر ظهور:</span>
                    <span class="value">${formatLastSeen(student.last_seen, student.online_status)}</span>
                </div>
                <div class="info-item">
                    <span class="label">اسم المستخدم:</span>
                    <span class="value">${escHtml(student.username || '—')}</span>
                </div>
                <div class="info-item">
                    <span class="label">كلمة المرور:</span>
                    <span class="value">
                        <span id="pw_${student.id}">••••••••</span>
                        <button class="pw-toggle-btn" onclick="togglePasswordDisplay('${student.id}', '${escHtml(student.plain_password || '------')}')" style="background:none;border:none;color:var(--text-muted);cursor:pointer;margin-right:5px;">
                            <i class="fas fa-eye" id="eye_${student.id}"></i>
                        </button>
                    </span>
                </div>
                <div class="info-item">
                    <span class="label">التليفون:</span>
                    <span class="value"><a href="tel:${student.phone || ''}" class="contact-link">${student.phone || 'غير مسجل'}</a></span>
                </div>
                <div class="info-item">
                    <span class="label">البريد:</span>
                    <span class="value" style="font-size:11px;word-break:break-all">${escHtml(student.email || '—')}</span>
                </div>
                <div class="info-item">
                    <span class="label">تاريخ الميلاد:</span>
                    <span class="value">${student.dob || 'غير مسجل'}</span>
                </div>
            </div>

            <div class="card-contact-row">
                <a href="tel:${student.phone || ''}" class="contact-action-btn call-btn">
                    <i class="fas fa-phone"></i> اتصال
                </a>
                <a href="${waLink}" target="_blank" rel="noopener" class="contact-action-btn wa-btn">
                    <i class="fab fa-whatsapp"></i> واتساب
                </a>
            </div>

            <div class="card-actions-row">
                ${analyticsBtn}
                ${editBtn}
            </div>
        `;
        grid.appendChild(card);
    });
}

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.togglePasswordDisplay = function (studentId, plaintext) {
    const pwSpan = document.getElementById(`pw_${studentId}`);
    const eyeIcon = document.getElementById(`eye_${studentId}`);
    if (!pwSpan) return;
    if (pwSpan.textContent === '••••••••') {
        pwSpan.textContent = plaintext;
        eyeIcon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        pwSpan.textContent = '••••••••';
        eyeIcon.classList.replace('fa-eye-slash', 'fa-eye');
    }
};

function getWhatsAppLink(phone) {
    if (!phone) return '#';
    let clean = phone.replace(/[^0-9]/g, '');
    if (clean.startsWith('01')) clean = '20' + clean;
    return `https://wa.me/${clean}`;
}

// =============================================
// STUDENT ANALYTICS SPA VIEW
// =============================================
window.openAnalyticsModal = function (studentId) {
    selectedStudentId = studentId;
    
    // Switch to the student analytics pane
    showPane('pane_student_analytics');
    
    // Deactivate the header navigation tabs
    document.querySelectorAll('.nav-tab-btn').forEach(b => b.classList.remove('active'));
    
    // Initialize calendar to current month/year
    currentCalMonth = new Date().getMonth();
    currentCalYear = new Date().getFullYear();
    
    // Wire calendar buttons once if they exist
    const prevBtn = document.getElementById('analyticsPrevMonth');
    const nextBtn = document.getElementById('analyticsNextMonth');
    if (prevBtn) {
        prevBtn.onclick = () => {
            currentCalMonth--;
            if (currentCalMonth < 0) {
                currentCalMonth = 11;
                currentCalYear--;
            }
            renderAttendanceCalendar(selectedStudentId);
        };
    }
    if (nextBtn) {
        nextBtn.onclick = () => {
            currentCalMonth++;
            if (currentCalMonth > 11) {
                currentCalMonth = 0;
                currentCalYear++;
            }
            renderAttendanceCalendar(selectedStudentId);
        };
    }
    
    renderStudentAnalyticsPage(studentId);
};

window.closeAnalyticsPage = function () {
    showPane('pane_students');
    // Reactivate header nav button for students
    document.querySelectorAll('.nav-tab-btn').forEach(b => {
        if (b.getAttribute('data-tab') === 'pane_students') {
            b.classList.add('active');
        } else {
            b.classList.remove('active');
        }
    });
};

window.closeCategoryDetailView = function () {
    showPane('pane_student_analytics');
};

window.renderStudentAnalyticsPage = function (studentId) {
    const student = [...studentProfiles, ...allWebsiteUsers].find(s => s.id === studentId);
    if (!student) return;

    // 1. Identity Header
    const identityEl = document.getElementById('analyticsStudentIdentity');
    if (identityEl) {
        const avatar = student.avatar_url
            ? `<img src="${student.avatar_url}" style="width:50px;height:50px;border-radius:50%;object-fit:cover;border:2px solid var(--border-gold);">`
            : `<div class="avatar-fallback" style="width:50px;height:50px;border-radius:50%;background:rgba(212,160,23,0.1);border:2px solid var(--border-gold);display:flex;align-items:center;justify-content:center;color:var(--text-gold);font-size:20px;"><i class="fas fa-user-graduate"></i></div>`;
        
        identityEl.innerHTML = `
            ${avatar}
            <div style="margin-right:12px;">
                <h2 class="text-gold" style="font-size:18px;font-weight:900;margin:0;">${escHtml(student.full_name)}</h2>
                <span class="badge-class" style="margin-top:4px;display:inline-block;">كود الحضور: ${getAttendanceCode(student)} | الصف: ${student.class_year || '—'}</span>
            </div>
        `;
    }

    const pointsBox = document.getElementById('analyticsTotalPointsBox');
    if (pointsBox) {
        pointsBox.innerHTML = `
            <div style="font-size:28px;font-weight:900;color:var(--text-gold);line-height:1;">${student.points || 0}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px;text-align:center;">إجمالي النقاط</div>
        `;
    }

    // 2. Attendance Calendar
    renderAttendanceCalendar(studentId);

    // 3. Stats Row & Lesson Progress calculations
    const progressRecords = studentProgress.filter(p => p.user_id === student.id);
    
    let globalTotal = 0;
    let globalCompleted = 0;
    const catStats = {
        bible_study: { total: 0, completed: 0 },
        coptic: { total: 0, completed: 0 },
        hymns: { total: 0, completed: 0 }
    };
    let totalAudios = 0;
    let completedAudios = 0;
    let totalVideos = 0;
    let completedVideos = 0;
    let totalQuizzes = 0;
    let completedQuizzes = 0;

    studentLessons.forEach(lesson => {
        const progress = progressRecords.find(p => p.lesson_id === lesson.id);
        const cat = lesson.category;
        
        if (cat === 'bible_study') {
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

    const bsRate = catStats.bible_study.total > 0 ? Math.round((catStats.bible_study.completed / catStats.bible_study.total) * 100) : 0;
    const copRate = catStats.coptic.total > 0 ? Math.round((catStats.coptic.completed / catStats.coptic.total) * 100) : 0;
    const hymRate = catStats.hymns.total > 0 ? Math.round((catStats.hymns.completed / catStats.hymns.total) * 100) : 0;

    // Set stats text elements
    document.getElementById('astat_audio').textContent = `${completedAudios}/${totalAudios}`;
    document.getElementById('astat_video').textContent = `${completedVideos}/${totalVideos}`;
    document.getElementById('astat_quiz').textContent = `${completedQuizzes}/${totalQuizzes}`;
    document.getElementById('astat_pts').textContent = `${student.points || 0}`;

    // Set big buttons progress bars
    document.getElementById('acbtn_bible_fill').style.width = `${bsRate}%`;
    document.getElementById('acbtn_coptic_fill').style.width = `${copRate}%`;
    document.getElementById('acbtn_hymns_fill').style.width = `${hymRate}%`;

    // 4. Points Log Table
    const studentPtsLog = pointsLogs.filter(pl => pl.user_id === student.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const ptsLogContainer = document.getElementById('analyticsPointsLogContainer');
    if (ptsLogContainer) {
        if (studentPtsLog.length === 0) {
            ptsLogContainer.innerHTML = `<div class="empty-state"><i class="fas fa-coins"></i><p>لا توجد سجلات نقاط مضافة بعد.</p></div>`;
        } else {
            ptsLogContainer.innerHTML = `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>التاريخ</th>
                            <th>النوع</th>
                            <th>النقاط المكتسبة</th>
                            <th>التفاصيل</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${studentPtsLog.map(log => {
                            const date = new Date(log.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
                            const typeLabel = log.type === 'quiz' ? 'امتحان' : (log.type === 'attendance' ? 'حضور' : (log.type === 'media' ? 'مشاهدة/سماع' : 'يدوي'));
                            const classColor = log.points > 0 ? 'text-green' : 'text-danger';
                            const prefix = log.points > 0 ? '+' : '';
                            return `
                                <tr>
                                    <td>${date}</td>
                                    <td><span class="badge-class">${typeLabel}</span></td>
                                    <td class="${classColor}">${prefix}${log.points} 🪙</td>
                                    <td>${escHtml(log.details || '—')}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;
        }
    }

    // 5. Bottom Action Buttons
    const actionFooter = document.getElementById('analyticsActionFooter');
    if (actionFooter) {
        actionFooter.innerHTML = `
            <button class="submit-action-btn" onclick="openPointsModal('${student.id}', '${escHtml(student.full_name)}', ${student.points || 0})">
                <i class="fas fa-coins"></i> تعديل النقاط يدوياً
            </button>
            <button class="cancel-btn" onclick="openStudentEditModal('${student.id}')">
                <i class="fas fa-user-edit"></i> تعديل بيانات الحساب
            </button>
        `;
    }
};

window.renderAttendanceCalendar = function (studentId) {
    const grid = document.getElementById('analyticsCalendarGrid');
    const title = document.getElementById('analyticsMonthTitle');
    const summary = document.getElementById('analyticsAttendanceSummary');
    if (!grid || !title) return;

    grid.innerHTML = '';

    const arabicMonths = [
        "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
        "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
    ];

    title.textContent = `${arabicMonths[currentCalMonth]} ${currentCalYear}`;

    // First day of the month
    const firstDay = new Date(currentCalYear, currentCalMonth, 1).getDay();
    // Number of days in the month
    const daysInMonth = new Date(currentCalYear, currentCalMonth + 1, 0).getDate();

    // Align starting offset so Saturday is 0. standard getDay: Sun=0, Mon=1, ..., Sat=6
    // If firstDay is Saturday (6), offset should be 0.
    // If firstDay is Sunday (0), offset should be 1.
    // If firstDay is Friday (5), offset should be 6.
    const startOffset = (firstDay + 1) % 7;

    // Blank cells
    for (let i = 0; i < startOffset; i++) {
        const blank = document.createElement('div');
        blank.className = 'calendar-day-cell empty';
        grid.appendChild(blank);
    }

    // Attendance logs for this student
    const studentAtt = attendanceLogs.filter(a => a.user_id === studentId);

    let attendedCount = 0;
    let totalPoints = 0;

    for (let day = 1; day <= daysInMonth; day++) {
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-day-cell';

        const dayNum = document.createElement('span');
        dayNum.className = 'day-number';
        dayNum.textContent = day;
        dayCell.appendChild(dayNum);

        // Format: YYYY-MM-DD
        const yyyy = currentCalYear;
        const mm = String(currentCalMonth + 1).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;

        const att = studentAtt.find(a => {
            const attDate = typeof a.attended_date === 'string' ? a.attended_date.split('T')[0] : '';
            return attDate === dateStr;
        });

        if (att) {
            dayCell.classList.add('attended');
            const ptsBadge = document.createElement('span');
            ptsBadge.className = 'day-points';
            ptsBadge.textContent = `+${att.points_earned} 🪙`;
            dayCell.appendChild(ptsBadge);
            attendedCount++;
            totalPoints += att.points_earned || 0;
        }

        grid.appendChild(dayCell);
    }

    if (summary) {
        summary.innerHTML = `
            <div class="att-summary-item">
                <span class="label">أيام الحضور في هذا الشهر:</span>
                <span class="value text-green" style="font-weight: 700;">${attendedCount} يوم</span>
            </div>
            <div class="att-summary-item">
                <span class="label">نقاط الحضور المكتسبة:</span>
                <span class="value text-gold" style="font-weight: 700;">+${totalPoints} 🪙</span>
            </div>
        `;
    }
};

window.openCategoryDetailView = function (category) {
    currentCategoryDetailType = category;
    const student = [...studentProfiles, ...allWebsiteUsers].find(s => s.id === selectedStudentId);
    if (!student) return;

    showPane('pane_category_detail');

    // 1. Identity Header
    const nameEl = document.getElementById('catDetailStudentName');
    if (nameEl) {
        nameEl.innerHTML = `
            <h2 class="text-gold" style="font-size:18px;font-weight:900;margin:0;">${escHtml(student.full_name)}</h2>
            <span class="badge-class" style="margin-top:4px;display:inline-block;">الصف: ${student.class_year || '—'}</span>
        `;
    }

    const badgeEl = document.getElementById('catDetailBadge');
    if (badgeEl) {
        const arabicCat = category === 'bible_study' ? 'درس الكتاب المقدس' : (category === 'coptic' ? 'اللغة القبطية' : 'مدرسة الألحان');
        badgeEl.textContent = arabicCat;
    }

    // 2. Compute metrics
    const lessons = studentLessons.filter(l => l.category === category);
    const progressRecords = studentProgress.filter(p => p.user_id === student.id);

    let catAudios = 0;
    let catCompletedAudios = 0;
    let catVideos = 0;
    let catCompletedVideos = 0;
    let catQuizzes = 0;
    let catCompletedQuizzes = 0;

    lessons.forEach(l => {
        const prog = progressRecords.find(p => p.lesson_id === l.id);
        if (category === 'bible_study') {
            catAudios++;
            catQuizzes++;
            if (prog) {
                if (prog.audio_completed) catCompletedAudios++;
                if (prog.quiz_completed) catCompletedQuizzes++;
            }
        } else if (category === 'coptic') {
            catVideos++;
            catQuizzes++;
            if (prog) {
                if (prog.video_completed) catCompletedVideos++;
                if (prog.quiz_completed) catCompletedQuizzes++;
            }
        } else if (category === 'hymns') {
            if (l.hymns_mode === 'both') {
                catAudios++;
                catVideos++;
                if (prog) {
                    if (prog.audio_completed) catCompletedAudios++;
                    if (prog.video_completed) catCompletedVideos++;
                }
            } else if (l.hymns_mode === 'audio') {
                catAudios++;
                if (prog) {
                    if (prog.audio_completed) catCompletedAudios++;
                }
            } else if (l.hymns_mode === 'video') {
                catVideos++;
                if (prog) {
                    if (prog.video_completed) catCompletedVideos++;
                }
            }
        }
    });

    const statsRow = document.getElementById('catDetailStats');
    if (statsRow) {
        let statsHtml = '';
        if (category === 'bible_study') {
            statsHtml = `
                <div class="analytics-stat-card glass-card">
                    <div class="astat-icon"><i class="fas fa-headphones"></i></div>
                    <div class="astat-body">
                        <div class="astat-value">${catCompletedAudios}/${catAudios}</div>
                        <div class="astat-label">فويسات مستمعة</div>
                    </div>
                </div>
                <div class="analytics-stat-card glass-card">
                    <div class="astat-icon" style="color:#818cf8"><i class="fas fa-clipboard-check"></i></div>
                    <div class="astat-body">
                        <div class="astat-value">${catCompletedQuizzes}/${catQuizzes}</div>
                        <div class="astat-label">امتحانات مجتازة</div>
                    </div>
                </div>
            `;
        } else if (category === 'coptic') {
            statsHtml = `
                <div class="analytics-stat-card glass-card">
                    <div class="astat-icon" style="color:#4ade80"><i class="fas fa-video"></i></div>
                    <div class="astat-body">
                        <div class="astat-value">${catCompletedVideos}/${catVideos}</div>
                        <div class="astat-label">فيديوهات مشاهَدة</div>
                    </div>
                </div>
                <div class="analytics-stat-card glass-card">
                    <div class="astat-icon" style="color:#818cf8"><i class="fas fa-clipboard-check"></i></div>
                    <div class="astat-body">
                        <div class="astat-value">${catCompletedQuizzes}/${catQuizzes}</div>
                        <div class="astat-label">امتحانات مجتازة</div>
                    </div>
                </div>
            `;
        } else if (category === 'hymns') {
            statsHtml = `
                <div class="analytics-stat-card glass-card">
                    <div class="astat-icon"><i class="fas fa-headphones"></i></div>
                    <div class="astat-body">
                        <div class="astat-value">${catCompletedAudios}/${catAudios}</div>
                        <div class="astat-label">فويسات مستمعة</div>
                    </div>
                </div>
                <div class="analytics-stat-card glass-card">
                    <div class="astat-icon" style="color:#4ade80"><i class="fas fa-video"></i></div>
                    <div class="astat-body">
                        <div class="astat-value">${catCompletedVideos}/${catVideos}</div>
                        <div class="astat-label">فيديوهات مشاهَدة</div>
                    </div>
                </div>
            `;
        }
        statsRow.innerHTML = statsHtml;
    }

    // 3. Build Tables
    const thead = document.getElementById('catDetailTableHead');
    const tbody = document.getElementById('catDetailTableBody');

    let headers = [];
    if (category === 'bible_study') {
        headers = ['اسم الدرس', 'استماع الفويس (وقت)', 'حالة الامتحان', 'الدرجة والنسبة', 'التحكم بالدرس والامتحان'];
    } else if (category === 'coptic') {
        headers = ['اسم الدرس', 'مشاهدة الفيديو (وقت)', 'حالة الامتحان', 'الدرجة والنسبة', 'التحكم بالدرس والامتحان'];
    } else { // hymns
        headers = ['اسم اللحن', 'استماع الفويس (وقت)', 'مشاهدة الفيديو (وقت)', 'النقاط', 'التحكم بالدرس والامتحان'];
    }

    thead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;

    if (lessons.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${headers.length}" style="text-align:center;padding:30px;"><div class="empty-state"><i class="fas fa-inbox"></i><p>لا توجد دروس في هذا القسم حالياً.</p></div></td></tr>`;
        return;
    }

    const formatTime = (secs) => {
        if (!secs || isNaN(secs)) return '00:00';
        const m = Math.floor(secs / 60);
        const s = Math.floor(secs % 60);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    const doneBadge = `<span class="status-indicator completed" style="display:inline-flex;align-items:center;gap:4px;background:rgba(74,222,128,0.15);color:#4ade80;padding:2px 8px;border-radius:4px;font-size:11px;"><i class="fas fa-check-circle"></i> مكتمل</span>`;
    const notDoneBadge = `<span class="status-indicator not-started" style="display:inline-flex;align-items:center;gap:4px;background:rgba(255,255,255,0.05);color:var(--text-muted);padding:2px 8px;border-radius:4px;font-size:11px;"><i class="far fa-circle"></i> لم يكتمل</span>`;

    const rows = lessons.map(lesson => {
        const prog = progressRecords.find(p => p.lesson_id === lesson.id);
        const pts = (prog?.audio_points_earned || 0) + (prog?.video_points_earned || 0) + (prog?.quiz_points_earned || 0);
        
        const restriction = studentRestrictions.find(r => r.user_id === student.id && r.lesson_id === lesson.id);
        const lessonLocked = restriction ? restriction.lesson_locked : false;
        const quizLocked = restriction ? restriction.quiz_locked : false;

        let lessonLockBtn = `
            <button class="lock-btn ${lessonLocked ? 'locked' : 'unlocked'}" onclick="toggleLessonLock('${student.id}', '${lesson.id}', ${lessonLocked})" title="${lessonLocked ? 'اضغط لفتح الدرس' : 'اضغط لقفل الدرس'}">
                <i class="fas ${lessonLocked ? 'fa-lock' : 'fa-lock-open'}"></i> ${lessonLocked ? 'فتح الدرس' : 'قفل الدرس'}
            </button>
        `;
        let quizLockBtn = `
            <button class="lock-btn ${quizLocked ? 'locked' : 'unlocked'}" onclick="toggleQuizLock('${student.id}', '${lesson.id}', ${quizLocked})" title="${quizLocked ? 'اضغط لفتح الامتحان' : 'اضغط لقفل الامتحان'}">
                <i class="fas ${quizLocked ? 'fa-lock' : 'fa-lock-open'}"></i> ${quizLocked ? 'فتح الامتحان' : 'قفل الامتحان'}
            </button>
        `;

        const controlHtml = `<div class="lock-controls-cell" style="display:flex;gap:6px;">${lessonLockBtn} ${quizLockBtn}</div>`;

        if (category === 'bible_study') {
            const hasStarted = prog && prog.last_position_audio > 0;
            const timeStr = prog?.audio_completed 
                ? `${doneBadge} (${formatTime(prog.last_position_audio)})` 
                : (hasStarted ? `${notDoneBadge} (${formatTime(prog.last_position_audio)})` : notDoneBadge);
            
            const quizScoreHtml = prog?.quiz_completed 
                ? `<div style="display:flex;align-items:center;gap:6px;">
                    <span style="font-weight: 700; color:var(--text-gold);">${prog.quiz_score || 0} صحيحة</span>
                    <button class="action-btn" style="padding:2px 8px;font-size:10px;background:rgba(212,160,23,0.15);border:1px solid var(--border-gold);color:var(--text-gold);cursor:pointer;font-family:'Cairo';border-radius:4px;" onclick="viewStudentQuizAnswers('${student.id}', '${lesson.id}')" title="عرض الإجابات التفصيلية">
                        <i class="fas fa-eye"></i> تفاصيل
                    </button>
                   </div>` 
                : '—';
            
            return `<tr>
                <td><strong>${escHtml(lesson.title)}</strong></td>
                <td>${timeStr}</td>
                <td>${prog?.quiz_completed ? doneBadge : notDoneBadge}</td>
                <td>${quizScoreHtml}</td>
                <td>${controlHtml}</td>
            </tr>`;
        } else if (category === 'coptic') {
            const hasStarted = prog && prog.last_position_video > 0;
            const timeStr = prog?.video_completed 
                ? `${doneBadge} (${formatTime(prog.last_position_video)})` 
                : (hasStarted ? `${notDoneBadge} (${formatTime(prog.last_position_video)})` : notDoneBadge);
            
            const quizScoreHtml = prog?.quiz_completed 
                ? `<div style="display:flex;align-items:center;gap:6px;">
                    <span style="font-weight: 700; color:var(--text-gold);">${prog.quiz_score || 0} صحيحة</span>
                    <button class="action-btn" style="padding:2px 8px;font-size:10px;background:rgba(212,160,23,0.15);border:1px solid var(--border-gold);color:var(--text-gold);cursor:pointer;font-family:'Cairo';border-radius:4px;" onclick="viewStudentQuizAnswers('${student.id}', '${lesson.id}')" title="عرض الإجابات التفصيلية">
                        <i class="fas fa-eye"></i> تفاصيل
                    </button>
                   </div>` 
                : '—';
            
            return `<tr>
                <td><strong>${escHtml(lesson.title)}</strong></td>
                <td>${timeStr}</td>
                <td>${prog?.quiz_completed ? doneBadge : notDoneBadge}</td>
                <td>${quizScoreHtml}</td>
                <td>${controlHtml}</td>
            </tr>`;
        } else { // hymns
            const hasAudio = lesson.hymns_mode !== 'video';
            const hasVideo = lesson.hymns_mode !== 'audio';

            const audioStarted = prog && prog.last_position_audio > 0;
            const videoStarted = prog && prog.last_position_video > 0;

            const audioHtml = hasAudio 
                ? (prog?.audio_completed ? `${doneBadge} (${formatTime(prog.last_position_audio)})` : (audioStarted ? `${notDoneBadge} (${formatTime(prog.last_position_audio)})` : notDoneBadge))
                : '—';
            
            const videoHtml = hasVideo 
                ? (prog?.video_completed ? `${doneBadge} (${formatTime(prog.last_position_video)})` : (videoStarted ? `${notDoneBadge} (${formatTime(prog.last_position_video)})` : notDoneBadge))
                : '—';

            return `<tr>
                <td><strong>${escHtml(lesson.title)}</strong></td>
                <td>${audioHtml}</td>
                <td>${videoHtml}</td>
                <td class="text-gold">+${pts} 🪙</td>
                <td>${controlHtml}</td>
            </tr>`;
        }
    }).join('');

    tbody.innerHTML = rows;
};

window.toggleLessonLock = async function (studentId, lessonId, currentLocked) {
    showAppLoading(true);
    try {
        const { error } = await supabaseClient
            .from('service_student_restrictions')
            .upsert({
                user_id: studentId,
                lesson_id: lessonId,
                lesson_locked: !currentLocked,
                locked_by: currentUser.id
            }, { onConflict: 'user_id,lesson_id' });

        if (error) throw error;
        showToast(!currentLocked ? "🔒 تم قفل الدرس بنجاح" : "🔓 تم فتح الدرس بنجاح", "success");
        
        await reloadRestrictionsForStudent(studentId);
        openCategoryDetailView(currentCategoryDetailType);
    } catch (e) {
        console.error("Error toggling lesson lock:", e);
        showToast("فشل تعديل حالة قفل الدرس.", "error");
    } finally {
        showAppLoading(false);
    }
};

window.toggleQuizLock = async function (studentId, lessonId, currentLocked) {
    showAppLoading(true);
    try {
        const { error } = await supabaseClient
            .from('service_student_restrictions')
            .upsert({
                user_id: studentId,
                lesson_id: lessonId,
                quiz_locked: !currentLocked,
                locked_by: currentUser.id
            }, { onConflict: 'user_id,lesson_id' });

        if (error) throw error;
        showToast(!currentLocked ? "🔒 تم قفل الامتحان بنجاح" : "🔓 تم فتح الامتحان بنجاح", "success");
        
        await reloadRestrictionsForStudent(studentId);
        openCategoryDetailView(currentCategoryDetailType);
    } catch (e) {
        console.error("Error toggling quiz lock:", e);
        showToast("فشل تعديل حالة قفل الامتحان.", "error");
    } finally {
        showAppLoading(false);
    }
};

async function reloadRestrictionsForStudent(studentId) {
    try {
        const { data: restrictions } = await supabaseClient
            .from('service_student_restrictions')
            .select('*')
            .eq('user_id', studentId);
        
        if (restrictions) {
            studentRestrictions = studentRestrictions.filter(r => r.user_id !== studentId);
            studentRestrictions.push(...restrictions);
        }
    } catch (e) {
        console.error("Failed to reload restrictions:", e);
    }
}

// =============================================
// POINTS MODAL
// =============================================
window.openPointsModal = function (studentId, name, currentPoints) {
    document.getElementById('adjustStudentId').value = studentId;
    document.getElementById('adjustStudentName').textContent = name;
    document.getElementById('adjustStudentCurrentPoints').textContent = `النقاط الحالية: 🪙 ${currentPoints}`;
    document.getElementById('adjustAmount').value = '';
    document.getElementById('adjustReason').value = '';
    document.getElementById('pointsModal').classList.add('show');
};

function setupPointsAdjustmentForm() {
    const form = document.getElementById('pointsAdjustmentForm');
    if (!form) return;
    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        const studentId = document.getElementById('adjustStudentId').value;
        const amount = parseInt(document.getElementById('adjustAmount').value);
        const reason = document.getElementById('adjustReason').value.trim();

        if (!studentId || isNaN(amount) || amount === 0 || !reason) {
            showToast("⚠️ يرجى إدخال كافة البيانات بشكل صحيح.", "warning");
            return;
        }

        showAppLoading(true);
        try {
            const { error } = await supabaseClient.from('service_points_log').insert({
                user_id: studentId,
                type: 'manual',
                points: amount,
                reference_id: currentUser.id,
                details: reason
            });
            if (error) throw error;

            showToast(`🪙 تم تعديل النقاط بقيمة [ ${amount > 0 ? '+' + amount : amount} ]`, "success");
            closeModal('pointsModal');
            await reloadDashboardData();
        } catch (err) {
            console.error("Points adjustment failed:", err);
            showToast("فشل تحديث النقاط في قاعدة البيانات.", "error");
        } finally {
            showAppLoading(false);
        }
    });
}

// =============================================
// STUDENT EDIT MODAL
// =============================================
window.openStudentEditModal = function (studentId) {
    const student = [...studentProfiles, ...allWebsiteUsers].find(s => s.id === studentId);
    if (!student) return;

    editingStudentId = studentId;
    editingUserRole = student.role;

    document.getElementById('edit_student_id').value = studentId;
    document.getElementById('edit_fullName').value = student.full_name || '';
    document.getElementById('edit_username').value = student.username || '';
    document.getElementById('edit_phone').value = student.phone || '';
    document.getElementById('edit_email').value = student.email || '';
    document.getElementById('edit_dob').value = student.dob || '';
    document.getElementById('edit_points').value = student.points || 0;

    // Dynamic Class Selection Dropdown Setup
    const classSelect = document.getElementById('edit_classYear');
    if (classSelect) {
        if (student.role === 'خادم' || student.role === 'امين خدمه') {
            classSelect.innerHTML = `
                <option value="KG1 و KG2">KG1 و KG2</option>
                <option value="الأول والثاني الابتدائي">الأول والثاني الابتدائي</option>
                <option value="الثالث والرابع الابتدائي">الثالث والرابع الابتدائي</option>
                <option value="الخامس والسادس الابتدائي">الخامس والسادس الابتدائي</option>
                <option value="الأول الإعدادي">الأول الإعدادي</option>
                <option value="الثاني الإعدادي">الثاني الإعدادي</option>
                <option value="الثالث الإعدادي">الثالث الإعدادي</option>
                <option value="الأول والثاني والثالث الثانوي">الأول والثاني والثالث الثانوي</option>
            `;
        } else {
            classSelect.innerHTML = `
                <option value="KG1">KG1</option>
                <option value="KG2">KG2</option>
                <option value="الأول الابتدائي">الأول الابتدائي</option>
                <option value="الثاني الابتدائي">الثاني الابتدائي</option>
                <option value="الثالث الابتدائي">الثالث الابتدائي</option>
                <option value="الرابع الابتدائي">الرابع الابتدائي</option>
                <option value="الخامس الابتدائي">الخامس الابتدائي</option>
                <option value="السادس الابتدائي">السادس الابتدائي</option>
                <option value="الأول الإعدادي">الأول الإعدادي</option>
                <option value="الثاني الإعدادي">الثاني الإعدادي</option>
                <option value="الثالث الإعدادي">الثالث الإعدادي</option>
                <option value="الأول الثانوي">الأول الثانوي</option>
                <option value="الثاني الثانوي">الثاني الثانوي</option>
                <option value="الثالث الثانوي">الثالث الثانوي</option>
            `;
        }
        classSelect.value = student.class_year || '';
    }

    // Toggle points field visibility depending on role
    const pointsCell = document.getElementById('edit_points').parentElement;
    if (pointsCell) {
        pointsCell.style.display = student.role === 'مخدوم' ? 'flex' : 'none';
    }

    // Toggle modal title dynamically based on role
    const modalTitle = document.querySelector('#studentEditModal .modal-header h2');
    if (modalTitle) {
        modalTitle.innerHTML = student.role === 'مخدوم' 
            ? `<i class="fas fa-user-edit text-gold"></i> تعديل بيانات المخدوم` 
            : `<i class="fas fa-user-edit text-gold"></i> تعديل بيانات الخادم`;
    }

    // Avatar preview
    const previewBox = document.getElementById('editAvatarPreview');
    const defaultAvatarIcon = student.role === 'مخدوم' ? 'fa-user-graduate' : 'fa-chalkboard-teacher';
    if (student.avatar_url) {
        previewBox.innerHTML = `<img src="${student.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    } else {
        previewBox.innerHTML = `<i class="fas ${defaultAvatarIcon}"></i>`;
    }

    document.getElementById('studentEditModal').classList.add('show');
};

function setupStudentEditModal() {
    // Avatar file change preview
    const avatarInput = document.getElementById('editStudentAvatarFile');
    if (avatarInput) {
        avatarInput.addEventListener('change', function () {
            if (this.files && this.files[0]) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    document.getElementById('editAvatarPreview').innerHTML =
                        `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
                };
                reader.readAsDataURL(this.files[0]);
            }
        });
    }

    // Delete avatar
    const btnDelAvatar = document.getElementById('btnDeleteStudentAvatar');
    if (btnDelAvatar) {
        btnDelAvatar.addEventListener('click', async () => {
            if (!editingStudentId) return;
            if (!confirm('هل تريد حذف صورة الحساب؟')) return;
            showAppLoading(true);
            try {
                await supabaseClient.from('profiles').update({ avatar_url: null }).eq('id', editingStudentId);
                document.getElementById('editAvatarPreview').innerHTML = `<i class="fas fa-user-graduate"></i>`;
                showToast('تم حذف الصورة.', 'success');
                await reloadDashboardData();
            } catch (err) {
                showToast('فشل حذف الصورة.', 'error');
            } finally {
                showAppLoading(false);
            }
        });
    }

    // Block student
    const btnBlock = document.getElementById('btnBlockStudent');
    if (btnBlock) {
        btnBlock.addEventListener('click', async () => {
            if (!editingStudentId) return;
            const student = studentProfiles.find(s => s.id === editingStudentId);
            const name = student ? student.full_name : 'هذا المخدوم';
            if (!confirm(`هل تريد حظر [ ${name} ]؟`)) return;
            showAppLoading(true);
            try {
                await supabaseClient.from('profiles').update({ is_blocked: true }).eq('id', editingStudentId);
                showToast(`تم حظر [ ${name} ] بنجاح.`, 'warning');
                closeModal('studentEditModal');
                await reloadDashboardData();
            } catch (err) {
                showToast('فشل حظر المخدوم.', 'error');
            } finally {
                showAppLoading(false);
            }
        });
    }

    // Delete student
    const btnDelete = document.getElementById('btnDeleteStudent');
    if (btnDelete) {
        btnDelete.addEventListener('click', async () => {
            if (!editingStudentId) return;
            const student = studentProfiles.find(s => s.id === editingStudentId);
            const name = student ? student.full_name : 'هذا المخدوم';
            if (!confirm(`⚠️ هل أنت متأكد من حذف حساب [ ${name} ] نهائياً؟ هذا الإجراء لا يمكن التراجع عنه.`)) return;
            showAppLoading(true);
            try {
                await supabaseClient.from('profiles').delete().eq('id', editingStudentId);
                showToast(`تم حذف حساب [ ${name} ] نهائياً.`, 'success');
                closeModal('studentEditModal');
                await reloadDashboardData();
            } catch (err) {
                showToast('فشل حذف المخدوم.', 'error');
            } finally {
                showAppLoading(false);
            }
        });
    }

    // Edit form submit
    const editForm = document.getElementById('studentEditForm');
    if (editForm) {
        editForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            if (!editingStudentId) return;

            showAppLoading(true);
            try {
                const avatarFile = document.getElementById('editStudentAvatarFile').files[0];
                let avatarUrl = undefined;
                if (avatarFile) {
                    showToast('☁️ جاري رفع الصورة...', 'info');
                    avatarUrl = await authService.uploadFileToCloudflare(avatarFile, 'image');
                }

                const updatePayload = {
                    full_name: document.getElementById('edit_fullName').value.trim(),
                    username: document.getElementById('edit_username').value.trim(),
                    phone: document.getElementById('edit_phone').value.trim(),
                    email: document.getElementById('edit_email').value.trim(),
                    dob: document.getElementById('edit_dob').value || null,
                    class_year: document.getElementById('edit_classYear').value,
                    points: parseInt(document.getElementById('edit_points').value) || 0,
                };
                if (avatarUrl) updatePayload.avatar_url = avatarUrl;

                const { error } = await supabaseClient.from('profiles').update(updatePayload).eq('id', editingStudentId);
                if (error) throw error;

                showToast('✅ تم حفظ بيانات المخدوم بنجاح.', 'success');
                closeModal('studentEditModal');
                await reloadDashboardData();
            } catch (err) {
                console.error('Student edit failed:', err);
                showToast('فشل حفظ بيانات المخدوم.', 'error');
            } finally {
                showAppLoading(false);
            }
        });
    }
}

// =============================================
// CURRICULUM WIZARD
// =============================================
function setupContentManagerForm() {
    // Category selector cards
    document.querySelectorAll('.wizard-card-btn').forEach(card => {
        card.addEventListener('click', function () {
            openWizardForm(this.getAttribute('data-category'));
        });
    });

    const btnBack = document.getElementById('btnBackToCategories');
    if (btnBack) btnBack.addEventListener('click', resetWizardForm);

    const btnNext = document.getElementById('btnWizardNextStep');
    if (btnNext) {
        btnNext.addEventListener('click', () => {
            const title = document.getElementById('w_lessonTitle').value.trim();
            const partition = document.getElementById('w_lessonPartition').value.trim();
            if (!title || !partition) {
                showToast("⚠️ يرجى ملء عنوان الدرس والقسم الفرعي أولاً.", "warning");
                return;
            }
            document.getElementById('wizard_step_1').style.display = 'none';
            document.getElementById('wizard_step_2').style.display = 'block';
        });
    }

    const btnPrev = document.getElementById('btnWizardPrevStep');
    if (btnPrev) {
        btnPrev.addEventListener('click', () => {
            document.getElementById('wizard_step_2').style.display = 'none';
            document.getElementById('wizard_step_1').style.display = 'block';
        });
    }

    // Quiz toggle
    const quizToggle = document.getElementById('w_enableQuiz');
    const quizBlock = document.getElementById('wizardQuizSettingsBlock');
    if (quizToggle && quizBlock) {
        quizToggle.addEventListener('change', function () {
            quizBlock.style.display = this.checked ? 'block' : 'none';
            const submitBtn = document.getElementById('btnWizardSubmit');
            if (submitBtn) {
                submitBtn.innerHTML = this.checked
                    ? `حفظ ونشر الدرس والامتحان <i class="fas fa-save"></i>`
                    : `نشر الدرس بدون امتحان <i class="fas fa-cloud-upload-alt"></i>`;
            }
        });
    }

    // PDF row adder
    const btnAddPdf = document.getElementById('w_btnAddPdf');
    if (btnAddPdf) {
        btnAddPdf.addEventListener('click', () => {
            const container = document.getElementById('w_pdfContainer');
            const row = document.createElement('div');
            row.className = 'pdf-link-row mt-10';
            row.style.display = 'flex'; row.style.gap = '8px'; row.style.marginTop = '8px';
            row.innerHTML = `
                <input type="url" class="w-pdf-url" placeholder="رابط ملف PDF المرفق" style="flex:1;background:var(--bg-input);border:1px solid rgba(255,255,255,0.08);border-radius:var(--radius-medium);padding:10px 13px;color:white;font-family:'Cairo',sans-serif;font-size:13px;outline:none;">
                <button type="button" onclick="this.parentElement.remove()" style="background:rgba(231,29,54,0.1);border:1px solid rgba(231,29,54,0.28);color:#ff6b6b;width:36px;height:36px;border-radius:8px;cursor:pointer;flex-shrink:0;">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            container.appendChild(row);
        });
    }

    // Hymns mode sync
    const hymnsModeEl = document.getElementById('w_hymnsMode');
    if (hymnsModeEl) hymnsModeEl.addEventListener('change', syncHymnsFormInputs);

    // Question adder
    const btnAddQ = document.getElementById('w_btnAddQuestion');
    if (btnAddQ) btnAddQ.addEventListener('click', addQuestionBuilderRow);

    // Form submit
    const form = document.getElementById('wizardCurriculumForm');
    if (form) form.addEventListener('submit', handleWizardFormSubmit);
}

function openWizardForm(category, editLessonData = null) {
    resetWizardFormState();

    document.getElementById('wizardActiveCategory').value = category;
    document.getElementById('wizardCategorySelector').style.display = 'none';
    document.getElementById('wizardFormContainer').style.display = 'block';

    const badge = document.getElementById('wizardCategoryBadge');
    const audioGroup = document.getElementById('w_audioGroup');
    const videoGroup = document.getElementById('w_videoGroup');
    const readingGroup = document.getElementById('w_readingGroup');
    const pdfGroup = document.getElementById('w_pdfGroup');
    const hymnsSettings = document.getElementById('w_hymnsSettingsCell');
    const listenCell = document.getElementById('w_pointsListenCell');
    const watchCell = document.getElementById('w_pointsWatchCell');

    [audioGroup, videoGroup, readingGroup, pdfGroup, hymnsSettings, listenCell, watchCell]
        .forEach(el => { if (el) el.style.display = 'none'; });

    if (category === 'bible_study') {
        badge.textContent = "القسم: درس كتاب مقدس";
        [audioGroup, readingGroup, listenCell].forEach(el => { if (el) el.style.display = 'block'; });
    } else if (category === 'coptic') {
        badge.textContent = "القسم: اللغة القبطية";
        [videoGroup, watchCell].forEach(el => { if (el) el.style.display = 'block'; });
    } else if (category === 'hymns') {
        badge.textContent = "القسم: مدرسة الألحان";
        [hymnsSettings, pdfGroup, listenCell, watchCell].forEach(el => { if (el) el.style.display = 'block'; });
        syncHymnsFormInputs();
    }

    if (editLessonData) {
        document.getElementById('wizardEditLessonId').value = editLessonData.id;
        document.getElementById('w_lessonTitle').value = editLessonData.title || '';
        document.getElementById('w_lessonPartition').value = editLessonData.partition_name || '';
        document.getElementById('w_pointsListen').value = editLessonData.points_listen || 10;
        document.getElementById('w_pointsWatch').value = editLessonData.points_watch || 10;
        document.getElementById('w_allowScrubbing').checked = editLessonData.allow_scrubbing || false;
        if (editLessonData.audio_url) document.getElementById('w_audioUrl').value = editLessonData.audio_url;
        if (editLessonData.video_url) document.getElementById('w_videoUrl').value = editLessonData.video_url;
        if (editLessonData.text_content) document.getElementById('w_textContent').value = editLessonData.text_content;

        if (category === 'hymns') {
            document.getElementById('w_hymnsMode').value = editLessonData.hymns_mode || 'both';
            syncHymnsFormInputs();
            const container = document.getElementById('w_pdfContainer');
            container.innerHTML = '';
            (editLessonData.pdf_urls || []).forEach((url, i) => {
                const row = document.createElement('div');
                row.className = 'pdf-link-row';
                row.style.cssText = 'display:flex;gap:8px;' + (i > 0 ? 'margin-top:8px;' : '');
                row.innerHTML = `
                    <input type="url" class="w-pdf-url" value="${escHtml(url)}" placeholder="رابط ملف PDF" style="flex:1;background:var(--bg-input);border:1px solid rgba(255,255,255,0.08);border-radius:var(--radius-medium);padding:10px 13px;color:white;font-family:'Cairo',sans-serif;font-size:13px;outline:none;">
                    ${i > 0 ? `<button type="button" onclick="this.parentElement.remove()" style="background:rgba(231,29,54,0.1);border:1px solid rgba(231,29,54,0.28);color:#ff6b6b;width:36px;height:36px;border-radius:8px;cursor:pointer;flex-shrink:0;"><i class="fas fa-trash"></i></button>` : ''}
                `;
                container.appendChild(row);
            });
            if (!editLessonData.pdf_urls || editLessonData.pdf_urls.length === 0) {
                container.innerHTML = `<div class="pdf-link-row"><input type="url" class="w-pdf-url" placeholder="رابط ملف PDF المرفق" style="width:100%;background:var(--bg-input);border:1px solid rgba(255,255,255,0.08);border-radius:var(--radius-medium);padding:10px 13px;color:white;font-family:'Cairo',sans-serif;font-size:13px;outline:none;"></div>`;
            }
        }

        const submitBtn = document.getElementById('btnWizardSubmit');
        if (submitBtn) submitBtn.innerHTML = `حفظ وتعديل الدرس <i class="fas fa-save"></i>`;
    }
}

function syncHymnsFormInputs() {
    const mode = document.getElementById('w_hymnsMode').value;
    const audioGroup = document.getElementById('w_audioGroup');
    const videoGroup = document.getElementById('w_videoGroup');
    const listenCell = document.getElementById('w_pointsListenCell');
    const watchCell = document.getElementById('w_pointsWatchCell');

    [audioGroup, videoGroup, listenCell, watchCell].forEach(el => { if (el) el.style.display = 'block'; });

    if (mode === 'audio') {
        if (videoGroup) videoGroup.style.display = 'none';
        if (watchCell) watchCell.style.display = 'none';
    } else if (mode === 'video') {
        if (audioGroup) audioGroup.style.display = 'none';
        if (listenCell) listenCell.style.display = 'none';
    }
}

function resetWizardForm() {
    document.getElementById('wizardCategorySelector').style.display = 'block';
    document.getElementById('wizardFormContainer').style.display = 'none';
    resetWizardFormState();
}

function resetWizardFormState() {
    const form = document.getElementById('wizardCurriculumForm');
    if (form) form.reset();
    document.getElementById('wizardEditLessonId').value = '';
    document.getElementById('wizardActiveCategory').value = '';
    document.getElementById('w_pdfContainer').innerHTML = `<div class="pdf-link-row"><input type="url" class="w-pdf-url" placeholder="رابط ملف PDF المرفق" style="width:100%;background:var(--bg-input);border:1px solid rgba(255,255,255,0.08);border-radius:var(--radius-medium);padding:10px 13px;color:white;font-family:'Cairo',sans-serif;font-size:13px;outline:none;"></div>`;
    document.getElementById('w_questionsList').innerHTML = '';
    document.getElementById('wizard_step_1').style.display = 'block';
    document.getElementById('wizard_step_2').style.display = 'none';
    const quizBlock = document.getElementById('wizardQuizSettingsBlock');
    if (quizBlock) quizBlock.style.display = 'block';
    const quizToggle = document.getElementById('w_enableQuiz');
    if (quizToggle) quizToggle.checked = true;
    quizQuestions = [];
}

function addQuestionBuilderRow(qData = null) {
    const container = document.getElementById('w_questionsList');
    const qIndex = container.querySelectorAll('.question-builder-row').length;

    const div = document.createElement('div');
    div.className = 'question-builder-row';
    div.style.cssText = 'background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:16px;margin-bottom:12px;';

    const qText = qData?.question || '';
    const opts = qData?.options || ['', '', '', ''];
    const corr = qData?.correct_index ?? 0;

    div.innerHTML = `
        <div class="question-header-row" style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="q-number-badge">${qIndex + 1}</div>
            <input type="text" class="q-text-field q-text-input" placeholder="نص السؤال..." value="${escHtml(qText)}"
                style="flex:1;background:rgba(3,7,15,0.6);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:9px 12px;color:white;font-family:'Cairo',sans-serif;font-size:13px;font-weight:700;outline:none;">
            <button type="button" class="delete-question-btn" onclick="this.closest('.question-builder-row').remove();renumberQuestions();">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            ${['أ', 'ب', 'ج', 'د'].map((letter, i) => `
                <div style="display:flex;align-items:center;gap:7px;">
                    <input type="radio" name="correct_q_${qIndex}" class="is-correct-radio" value="${i}" ${corr === i ? 'checked' : ''} title="الإجابة الصحيحة">
                    <input type="text" class="q-option-text-input opt-field-${i}" placeholder="الخيار (${letter})" value="${escHtml(opts[i])}"
                        style="flex:1;background:rgba(3,7,15,0.5);border:1px solid rgba(255,255,255,0.07);border-radius:6px;padding:7px 10px;color:white;font-family:'Cairo',sans-serif;font-size:12px;outline:none;">
                </div>
            `).join('')}
        </div>
    `;
    container.appendChild(div);
}

window.renumberQuestions = function () {
    document.querySelectorAll('#w_questionsList .q-number-badge').forEach((badge, i) => {
        badge.textContent = i + 1;
    });
};

async function handleWizardFormSubmit(e) {
    e.preventDefault();
    const activeClassGroup = sessionStorage.getItem('activeClassGroup');
    if (!activeClassGroup) {
        showToast("⚠️ يرجى تحديد فصل الخدمة أولاً.", "warning");
        return;
    }

    const category = document.getElementById('wizardActiveCategory').value;
    const title = document.getElementById('w_lessonTitle').value.trim();
    const partition = document.getElementById('w_lessonPartition').value.trim();
    const enableQuiz = document.getElementById('w_enableQuiz').checked;
    const editId = document.getElementById('wizardEditLessonId').value;

    if (!title || !partition) {
        showToast("⚠️ يرجى ملء عنوان الدرس والقسم الفرعي.", "warning");
        return;
    }

    showAppLoading(true);
    try {
        // Upload audio file if any
        let audioUrl = document.getElementById('w_audioUrl')?.value.trim() || null;
        const audioFile = document.getElementById('w_audioFile')?.files[0];
        if (audioFile && !audioUrl) {
            showToast('☁️ جاري رفع ملف الصوت...', 'info');
            audioUrl = await authService.uploadFileToCloudflare(audioFile, 'audio');
        }

        // Upload video file if any
        let videoUrl = document.getElementById('w_videoUrl')?.value.trim() || null;
        const videoFile = document.getElementById('w_videoFile')?.files[0];
        if (videoFile && !videoUrl) {
            showToast('☁️ جاري رفع ملف الفيديو...', 'info');
            videoUrl = await authService.uploadFileToCloudflare(videoFile, 'video');
        }

        // Collect PDFs
        const pdfUrls = [];
        document.querySelectorAll('.w-pdf-url').forEach(el => {
            const v = el.value.trim();
            if (v) pdfUrls.push(v);
        });

        const targetGrades = classMap[activeClassGroup] || [activeClassGroup];
        const primaryGrade = targetGrades[0] || activeClassGroup;

        const payload = {
            class_year: primaryGrade,
            category,
            title,
            partition_name: partition,
            audio_url: audioUrl,
            video_url: videoUrl,
            text_content: document.getElementById('w_textContent')?.value.trim() || null,
            pdf_urls: pdfUrls,
            points_listen: parseInt(document.getElementById('w_pointsListen')?.value) || 0,
            points_watch: parseInt(document.getElementById('w_pointsWatch')?.value) || 0,
            allow_scrubbing: document.getElementById('w_allowScrubbing')?.checked || false,
        };
        if (category === 'hymns') {
            payload.hymns_mode = document.getElementById('w_hymnsMode')?.value || 'both';
        }

        let lessonId = editId;

        if (editId) {
            const { error } = await supabaseClient.from('service_lessons').update(payload).eq('id', editId);
            if (error) throw error;
        } else {
            const { data, error } = await supabaseClient.from('service_lessons').insert(payload).select().single();
            if (error) throw error;
            lessonId = data.id;
        }

        // Handle quiz
        if (enableQuiz && lessonId) {
            const builderCards = document.querySelectorAll('#w_questionsList .question-builder-row');
            if (builderCards.length > 0) {
                const questionsData = [];
                let valid = true;

                builderCards.forEach((card, idx) => {
                    const qText = card.querySelector('.q-text-field')?.value.trim();
                    const opts = [0, 1, 2, 3].map(i => card.querySelector(`.opt-field-${i}`)?.value.trim() || '');
                    const correctRadio = card.querySelector('.is-correct-radio:checked');
                    const correctIndex = correctRadio ? parseInt(correctRadio.value) : 0;

                    if (!qText || opts.some(o => !o)) { valid = false; return; }
                    questionsData.push({ question: qText, options: opts, correct_index: correctIndex });
                });

                if (!valid) {
                    showToast("⚠️ يرجى ملء كافة خانات الأسئلة والخيارات.", "warning");
                    showAppLoading(false);
                    return;
                }

                const pointsPerQ = parseInt(document.getElementById('w_quizPointsPerQuestion')?.value) || 5;
                const minPass = parseInt(document.getElementById('w_quizMinPassPercent')?.value) || 50;

                await supabaseClient.from('service_quizzes').upsert({
                    lesson_id: lessonId,
                    questions: questionsData,
                }, { onConflict: 'lesson_id' });

                await supabaseClient.from('service_lessons').update({
                    points_quiz_question: pointsPerQ,
                    min_pass_score: Math.ceil(questionsData.length * minPass / 100)
                }).eq('id', lessonId);
            }
        }

        showToast(editId ? "✅ تم تعديل الدرس بنجاح!" : "🎉 تم نشر الدرس بنجاح!", "success");
        resetWizardForm();
        await reloadDashboardData();
        loadCurriculumLessons();

    } catch (err) {
        console.error("Lesson publish failed:", err);
        showToast("حدث خطأ أثناء نشر الدرس. يرجى المحاولة مجدداً.", "error");
    } finally {
        showAppLoading(false);
    }
}

// =============================================
// PUBLISHED LESSONS TABLE
// =============================================
async function loadCurriculumLessons() {
    const tableBody = document.getElementById('publishedLessonsTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = `<tr><td colspan="7" class="text-center"><i class="fas fa-circle-notch fa-spin text-gold"></i> جاري تحميل الدروس...</td></tr>`;

    const activeClassGroup = sessionStorage.getItem('activeClassGroup');
    if (!activeClassGroup) return;

    const targetGrades = classMap[activeClassGroup] || [];

    try {
        const { data: lessons, error } = await supabaseClient
            .from('service_lessons').select('*')
            .in('class_year', targetGrades)
            .order('created_at', { ascending: false });
        if (error) throw error;

        const lessonIds = (lessons || []).map(l => l.id);
        let quizzes = [];
        if (lessonIds.length > 0) {
            const { data: qz } = await supabaseClient.from('service_quizzes')
                .select('lesson_id, questions').in('lesson_id', lessonIds);
            quizzes = qz || [];
        }

        if (!lessons || lessons.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">لا توجد دروس منشورة في هذا الفصل.</td></tr>`;
            return;
        }

        const catMap = { bible_study: '📖 كتاب', coptic: '✝️ قبطي', hymns: '🎵 ألحان' };
        tableBody.innerHTML = '';

        lessons.forEach(lesson => {
            const quiz = quizzes.find(q => q.lesson_id === lesson.id);
            const quizCell = quiz
                ? `<span style="color:var(--success)"><i class="fas fa-check-circle"></i> ${quiz.questions.length} أسئلة</span>`
                : `<span class="text-muted"><i class="far fa-circle"></i> لا يوجد</span>`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="badge-class">${catMap[lesson.category] || lesson.category}</span></td>
                <td><strong>${escHtml(lesson.title)}</strong></td>
                <td style="color:var(--text-muted);font-size:12px;">${escHtml(lesson.partition_name || '—')}</td>
                <td>${quizCell}</td>
                <td style="font-size:12px;">
                    ${lesson.quiz_is_locked
                    ? `<span style="color:var(--danger)"><i class="fas fa-lock"></i> مقفول</span>`
                    : `<span class="text-green"><i class="fas fa-lock-open"></i> مفتوح</span>`}
                </td>
                <td style="font-size:12px;">${lesson.lock_timer_minutes ? `${lesson.lock_timer_minutes} دقيقة` : '—'}</td>
                <td>
                    <div style="display:flex;gap:5px;flex-wrap:wrap;">
                        <button class="tbl-action-btn edit" onclick="editLessonFromTable('${lesson.id}')" title="تعديل">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="tbl-action-btn delete" onclick="deleteLesson('${lesson.id}','${escHtml(lesson.title)}')" title="حذف">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    } catch (err) {
        console.error("Load published lessons failed:", err);
        tableBody.innerHTML = `<tr><td colspan="7" class="text-center" style="color:var(--danger)">فشل تحميل الدروس.</td></tr>`;
    }
}

window.editLessonFromTable = async function (lessonId) {
    const lesson = studentLessons.find(l => l.id === lessonId);
    if (!lesson) {
        showToast('جاري جلب بيانات الدرس...', 'info');
        const { data } = await supabaseClient.from('service_lessons').select('*').eq('id', lessonId).single();
        if (data) {
            // Switch to wizard tab
            document.querySelectorAll('.inner-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.inner-dashboard-subpane').forEach(sp => sp.classList.remove('active'));
            document.getElementById('subpane_curriculum_wizard').classList.add('active');
            document.querySelector('[data-subtab="subpane_curriculum_wizard"]')?.classList.add('active');
            openWizardForm(data.category, data);
        }
        return;
    }
    document.querySelectorAll('.inner-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.inner-dashboard-subpane').forEach(sp => sp.classList.remove('active'));
    document.getElementById('subpane_curriculum_wizard').classList.add('active');
    document.querySelector('[data-subtab="subpane_curriculum_wizard"]')?.classList.add('active');
    openWizardForm(lesson.category, lesson);
};

window.deleteLesson = async function (lessonId, title) {
    if (!confirm(`هل أنت متأكد من حذف درس [ ${title} ] نهائياً؟`)) return;
    showAppLoading(true);
    try {
        const { error } = await supabaseClient.from('service_lessons').delete().eq('id', lessonId);
        if (error) throw error;
        showToast("🗑️ تم حذف الدرس بنجاح.", "success");
        await reloadDashboardData();
        loadCurriculumLessons();
    } catch (err) {
        showToast("فشل حذف الدرس.", "error");
    } finally {
        showAppLoading(false);
    }
};

// =============================================
// ATTENDANCE
// =============================================
function setupAttendanceScanner() {
    const btnToggle = document.getElementById('btnToggleCamera');
    if (btnToggle) btnToggle.addEventListener('click', toggleQrCameraScanner);

    const btnManual = document.getElementById('btnSubmitManualAttendance');
    if (btnManual) btnManual.addEventListener('click', submitManualAttendanceLog);

    const btnStart = document.getElementById('btnStartAttendanceSession');
    if (btnStart) {
        btnStart.addEventListener('click', () => {
            const pts = parseInt(document.getElementById('attendancePoints').value) || 0;
            document.getElementById('confirmPointsVal').textContent = pts;
            document.getElementById('attendanceConfirmModal').classList.add('show');
        });
    }

    const btnEnd = document.getElementById('btnEndAttendanceSession');
    if (btnEnd) {
        btnEnd.addEventListener('click', () => {
            attendanceSessionActive = false;
            document.getElementById('attendanceActivePanel').style.display = 'none';
            document.getElementById('attendancePoints').disabled = false;
            document.getElementById('btnStartAttendanceSession').disabled = false;
            cleanupScanner();
            showToast('✅ تم إنهاء جلسة الحضور.', 'success');
        });
    }

    // Enter key on manual input
    const codeInput = document.getElementById('attendanceManualCode');
    if (codeInput) {
        codeInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') submitManualAttendanceLog();
        });
    }
}

function setupAttendanceConfirmModals() {
    const btnConfirmStart = document.getElementById('btnConfirmStartSession');
    if (btnConfirmStart) {
        btnConfirmStart.addEventListener('click', () => {
            closeModal('attendanceConfirmModal');
            const pts = parseInt(document.getElementById('attendancePoints').value) || 0;
            attendanceSessionActive = true;
            document.getElementById('sessionPointsDisplay').textContent = pts;
            document.getElementById('attendanceActivePanel').style.display = 'block';
            document.getElementById('attendancePoints').disabled = true;
            document.getElementById('btnStartAttendanceSession').disabled = true;
            renderTodayAttendanceList();
            showToast(`🟢 بدأت جلسة حضور بـ ${pts} نقاط لكل مخدوم.`, 'success');
        });
    }

    const btnConfirmScan = document.getElementById('btnConfirmScanAttendance');
    if (btnConfirmScan) {
        btnConfirmScan.addEventListener('click', async () => {
            closeModal('scanConfirmModal');
            if (pendingAttendanceStudent) {
                await doRecordAttendance(pendingAttendanceStudent);
                pendingAttendanceStudent = null;
            }
        });
    }

    const btnConfirmCross = document.getElementById('btnConfirmCrossClass');
    if (btnConfirmCross) {
        btnConfirmCross.addEventListener('click', async () => {
            closeModal('crossClassModal');
            if (pendingAttendanceStudent) {
                await doRecordAttendance(pendingAttendanceStudent);
                pendingAttendanceStudent = null;
            }
        });
    }
}

async function submitManualAttendanceLog() {
    if (!attendanceSessionActive) {
        showToast('⚠️ يرجى بدء جلسة الحضور أولاً.', 'warning');
        return;
    }
    const codeField = document.getElementById('attendanceManualCode');
    const code = codeField.value.trim();
    if (code.length !== 6 || isNaN(code)) {
        showToast('⚠️ يرجى إدخال كود صحيح مكون من 6 أرقام.', 'warning');
        return;
    }
    await recordAttendance(code);
    codeField.value = '';
}

async function recordAttendance(studentCode) {
    let student = studentProfiles.find(s => getAttendanceCode(s) === studentCode);
    let isCrossClass = false;

    if (!student) {
        showAppLoading(true);
        try {
            const { data: foundStudents } = await supabaseClient.from('profiles').select('*').eq('role', 'مخدوم');
            if (foundStudents) student = foundStudents.find(s => getAttendanceCode(s) === studentCode);
        } finally { showAppLoading(false); }

        if (!student) { showToast('❌ لم يُعثر على مخدوم بهذا الكود.', 'error'); return; }
        isCrossClass = true;
    }

    const activeClassGroup = sessionStorage.getItem('activeClassGroup');
    const targetGrades = classMap[activeClassGroup] || [];
    if (!isCrossClass && !targetGrades.includes(student.class_year)) isCrossClass = true;

    const points = parseInt(document.getElementById('sessionPointsDisplay')?.textContent) ||
        parseInt(document.getElementById('attendancePoints')?.value) || 0;

    pendingAttendanceStudent = student;

    if (isCrossClass) {
        document.getElementById('crossStudentName').textContent = student.full_name;
        document.getElementById('crossStudentGrade').textContent = `الصف: ${student.class_year}`;
        document.getElementById('crossStudentClass').textContent = student.class_year;
        document.getElementById('crossClassModal').classList.add('show');
    } else {
        document.getElementById('scanStudentName').textContent = student.full_name;
        document.getElementById('scanStudentGrade').textContent = `الصف: ${student.class_year}`;
        document.getElementById('scanStudentPoints').textContent = `+${points} 🪙`;
        const avatarEl = document.getElementById('scanStudentAvatar');
        avatarEl.innerHTML = student.avatar_url
            ? `<img src="${student.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
            : `<i class="fas fa-user-graduate"></i>`;
        document.getElementById('scanConfirmModal').classList.add('show');
    }
}

async function doRecordAttendance(student) {
    const points = parseInt(document.getElementById('sessionPointsDisplay')?.textContent) ||
        parseInt(document.getElementById('attendancePoints')?.value) || 0;
    const today = new Date().toISOString().split('T')[0];

    showAppLoading(true);
    try {
        const { error } = await supabaseClient.from('service_attendance').insert({
            user_id: student.id,
            attended_date: today,
            points_earned: points,
            marked_by: currentUser.id
        });

        if (error) {
            if (error.code === '23505') {
                showToast(`⚠️ [${student.full_name}] مسجل حضور بالفعل اليوم!`, 'warning');
                return;
            }
            throw error;
        }

        showToast(`✅ تم تسجيل حضور [${student.full_name}] +${points} نقطة!`, 'success');
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

        attendanceLogs.push({ user_id: student.id, attended_date: today, points_earned: points });
        renderTodayAttendanceList();

    } catch (err) {
        console.error('Attendance registry failed:', err);
        showToast('فشل تسجيل الحضور.', 'error');
    } finally {
        showAppLoading(false);
    }
}

function renderTodayAttendanceList() {
    const list = document.getElementById('attendanceTodayList');
    const countBadge = document.getElementById('todayAttendanceCount');
    if (!list) return;
    list.innerHTML = '';

    const today = new Date().toISOString().split('T')[0];
    const todayAtts = attendanceLogs.filter(a => a.attended_date === today);

    if (countBadge) countBadge.textContent = `${todayAtts.length} مخدوم`;

    if (todayAtts.length === 0) {
        list.innerHTML = '<li class="empty-list">لم يتم تسجيل حضور أي مخدوم اليوم بعد.</li>';
        return;
    }

    todayAtts.forEach(att => {
        const student = [...studentProfiles, ...allWebsiteUsers].find(s => s.id === att.user_id);
        const name = student ? student.full_name : 'مخدوم غير معروف';
        const grade = student?.class_year ? ` (${student.class_year})` : '';
        const li = document.createElement('li');
        li.innerHTML = `
            <span><i class="fas fa-check text-green"></i> ${escHtml(name)}<small class="text-muted">${grade}</small></span>
            <span class="text-gold" style="font-weight:900;">+${att.points_earned} 🪙</span>
        `;
        list.appendChild(li);
    });
}

function toggleQrCameraScanner() {
    if (!attendanceSessionActive) {
        showToast('⚠️ يرجى بدء جلسة الحضور أولاً.', 'warning');
        return;
    }
    const btn = document.getElementById('btnToggleCamera');
    if (isCameraActive) {
        cleanupScanner();
        btn.innerHTML = `<i class="fas fa-camera"></i> تشغيل الكاميرا`;
        isCameraActive = false;
    } else {
        btn.innerHTML = `<i class="fas fa-camera-slash"></i> إيقاف الكاميرا`;
        isCameraActive = true;
        html5QrcodeScanner = new Html5Qrcode("attendanceQrReader");
        html5QrcodeScanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: 220 },
            (qrCodeMessage) => { recordAttendance(qrCodeMessage.trim()); },
            () => { }
        ).catch(err => {
            console.error("Camera failed:", err);
            showToast("فشل تشغيل الكاميرا.", "error");
            cleanupScanner();
            btn.innerHTML = `<i class="fas fa-camera"></i> تشغيل الكاميرا`;
            isCameraActive = false;
        });
    }
}

function cleanupScanner() {
    if (html5QrcodeScanner) {
        try { html5QrcodeScanner.stop().then(() => { html5QrcodeScanner = null; }); }
        catch (e) { html5QrcodeScanner = null; }
    }
    const btn = document.getElementById('btnToggleCamera');
    if (btn) btn.innerHTML = `<i class="fas fa-camera"></i> تشغيل الكاميرا`;
    isCameraActive = false;
}

// =============================================
// UTILS
// =============================================
function getAttendanceCode(student) {
    if (!student.dob) return '000000';
    const parts = student.dob.split('-');
    if (parts.length !== 3) return '000000';
    const month = parts[1].padStart(2, '0');
    const day = parts[2].padStart(2, '0');
    const phoneStr = (student.phone || '').trim();
    const phoneSuffix = phoneStr.slice(-2).padStart(2, '0');
    return day + month + phoneSuffix;
}

function formatMediaSeconds(seconds) {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

window.closeModal = function (modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('show');
};

window.viewStudentQuizAnswers = async function (studentId, lessonId) {
    showAppLoading(true);
    try {
        const student = [...studentProfiles, ...allWebsiteUsers].find(s => s.id === studentId);
        const lesson = studentLessons.find(l => l.id === lessonId);
        const prog = studentProgress.find(p => p.user_id === studentId && p.lesson_id === lessonId);

        if (!prog || !prog.quiz_completed) {
            showToast("⚠️ لم يقم هذا المخدوم بحل الامتحان بعد.", "warning");
            return;
        }

        // Fetch Quiz Questions
        const { data: quiz, error } = await supabaseClient
            .from('service_quizzes')
            .select('*')
            .eq('lesson_id', lessonId)
            .maybeSingle();

        if (error) throw error;

        const body = document.getElementById('quizAnswersReviewModalBody');
        if (!body) {
            console.error("Modal body element not found: quizAnswersReviewModalBody");
            return;
        }
        body.innerHTML = '';

        if (!quiz || !quiz.questions || quiz.questions.length === 0) {
            body.innerHTML = `<div class="empty-state" style="color:var(--danger);text-align:center;padding:30px;">
                <i class="fas fa-exclamation-triangle fa-2x"></i>
                <p style="margin-top:10px;">عذراً، لم يتم العثور على الأسئلة الخاصة بهذا الامتحان في قاعدة البيانات.</p>
            </div>`;
            
            const modal = document.getElementById('quizAnswersReviewModal');
            modal.classList.add('show');
            modal.onclick = function(e) {
                if (e.target === modal) {
                    closeModal('quizAnswersReviewModal');
                }
            };
            return;
        }

        const questions = quiz.questions;
        const studentAnswers = prog.quiz_answers || [];
        const correctCount = prog.quiz_score || 0;
        const totalCount = questions.length;
        const percent = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

        // Render header with stats
        const scoreColor = percent >= 50 ? '#51cf66' : '#ff922b';
        let headerHtml = `
            <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                <div>
                    <h3 style="color:var(--text-gold); font-size:16px; font-weight:900; margin:0 0 5px 0;">امتحان: ${escHtml(lesson.title)}</h3>
                    <span style="font-size:12px; color:var(--text-muted);">المخدوم: <strong>${escHtml(student ? student.full_name : 'غير معروف')}</strong></span>
                </div>
                <div style="text-align:center; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:8px 16px; border-radius:8px;">
                    <div style="font-size:20px; font-weight:900; color:${scoreColor};">${percent}%</div>
                    <div style="font-size:11px; color:var(--text-muted);">${correctCount} / ${totalCount} إجابة صحيحة</div>
                </div>
            </div>
        `;
        
        let questionsHtml = '';
        questions.forEach((q, qIdx) => {
            const chosenAns = studentAnswers[qIdx] !== undefined ? studentAnswers[qIdx] : null;
            const correctAns = q.correct_index;
            
            const optionsHtml = q.options.map((opt, optIdx) => {
                let bgStyle = 'background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05);';
                let statusIcon = '';
                let textColor = 'color: #e0e6ed;';

                if (chosenAns !== null && optIdx === chosenAns) {
                    if (chosenAns === correctAns) {
                        bgStyle = 'background: rgba(81, 207, 102, 0.15); border: 1px solid #51cf66;';
                        textColor = 'color: #51cf66; font-weight: bold;';
                        statusIcon = '<i class="fas fa-check-circle" style="color:#51cf66; margin-right: auto; font-size:16px;"></i>';
                    } else {
                        bgStyle = 'background: rgba(255, 107, 107, 0.15); border: 1px solid #ff6b6b;';
                        textColor = 'color: #ff6b6b; font-weight: bold;';
                        statusIcon = '<i class="fas fa-times-circle" style="color:#ff6b6b; margin-right: auto; font-size:16px;"></i>';
                    }
                } else if (optIdx === correctAns) {
                    bgStyle = 'background: rgba(81, 207, 102, 0.05); border: 1px dashed #51cf66;';
                    textColor = 'color: #51cf66;';
                    statusIcon = '<i class="fas fa-check-circle" style="color:#51cf66; margin-right: auto; font-size:14px; opacity: 0.7;"></i>';
                }

                return `
                    <div style="display:flex; align-items:center; padding:10px 14px; border-radius:8px; margin-bottom:8px; font-size:13px; ${bgStyle} ${textColor}">
                        <span style="direction:rtl; text-align:right;">${opt}</span>
                        ${statusIcon}
                    </div>
                `;
            }).join('');

            questionsHtml += `
                <div style="margin-bottom:20px; padding-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.05);">
                    <div style="font-size: 11px; color: var(--text-gold); font-weight: 700; margin-bottom: 5px;">السؤال ${qIdx + 1}</div>
                    <div style="font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 12px; line-height: 1.4; text-align:right;">${q.question}</div>
                    <div style="display:flex; flex-direction:column; gap:2px;">
                        ${optionsHtml}
                    </div>
                </div>
            `;
        });

        body.innerHTML = headerHtml + questionsHtml;
        
        const modal = document.getElementById('quizAnswersReviewModal');
        modal.classList.add('show');
        modal.onclick = function(e) {
            if (e.target === modal) {
                closeModal('quizAnswersReviewModal');
            }
        };

    } catch (e) {
        console.error("Error viewing quiz answers:", e);
        showToast("حدث خطأ في تحميل إجابات الامتحان.", "error");
    } finally {
        showAppLoading(false);
    }
};

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-alert ${type}`;
    toast.style.cssText = `display:flex;align-items:center;gap:11px;cursor:pointer;`;

    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    toast.innerHTML = `<i class="fas ${icons[type] || 'fa-info-circle'}"></i><span>${message}</span>`;

    container.appendChild(toast);
    const duration = type === 'info' ? 8000 : 3800;
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-20px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duration);
    toast.addEventListener('click', () => toast.remove());
}

function showAppLoading(show) {
    let loader = document.getElementById('appLoader');
    if (show && !loader) {
        loader = document.createElement('div');
        loader.id = 'appLoader';
        loader.style.cssText = `
            position:fixed;inset:0;background:rgba(3,7,15,0.55);
            backdrop-filter:blur(3px);z-index:99999;
            display:flex;align-items:center;justify-content:center;
        `;
        loader.innerHTML = `
            <div style="background:rgba(9,20,36,0.95);border:1px solid rgba(212,160,23,0.3);
                        border-radius:16px;padding:28px 36px;text-align:center;
                        box-shadow:0 20px 50px rgba(0,0,0,0.6);">
                <div style="font-size:28px;margin-bottom:10px;">
                    <i class="fas fa-circle-notch fa-spin" style="color:var(--gold-primary)"></i>
                </div>
                <p style="font-size:13px;color:var(--text-muted);font-weight:700;">جاري المعالجة...</p>
            </div>
        `;
        document.body.appendChild(loader);
    } else if (!show && loader) {
        loader.remove();
    }
}

// =============================================
// COORDINATOR FILTERS SETUP
// =============================================
function setupCoordinatorFilters() {
    const btnMyClassStudents = document.getElementById('btnMyClassStudents');
    const btnMyClass = document.getElementById('btnMyClass');
    const btnAllServants = document.getElementById('btnAllServants');
    const btnAllStudents = document.getElementById('btnAllStudents');

    if (!btnMyClassStudents) return; // Not present

    const buttons = [btnMyClassStudents, btnMyClass, btnAllServants, btnAllStudents];

    function setBtnActive(activeBtn, viewMode) {
        buttons.forEach(btn => {
            if (btn === activeBtn) {
                btn.classList.add('active');
                btn.style.background = 'linear-gradient(135deg, var(--primary-color), #a00000)';
                btn.style.border = '1px solid var(--secondary-color)';
                btn.style.color = 'white';
                btn.style.boxShadow = '0 0 10px rgba(212, 160, 23, 0.2)';
                btn.style.fontWeight = 'bold';
            } else {
                btn.classList.remove('active');
                btn.style.background = 'rgba(237, 221, 189, 0.08)';
                btn.style.border = '1px solid rgba(237, 221, 189, 0.2)';
                btn.style.color = 'var(--light-color)';
                btn.style.boxShadow = 'none';
                btn.style.fontWeight = 'normal';
            }
        });
        coordinatorViewMode = viewMode;
        reloadDashboardData();
    }

    btnMyClassStudents.addEventListener('click', () => setBtnActive(btnMyClassStudents, 'my_class_students'));
    btnMyClass.addEventListener('click', () => setBtnActive(btnMyClass, 'my_class'));
    btnAllServants.addEventListener('click', () => setBtnActive(btnAllServants, 'all_servants'));
    btnAllStudents.addEventListener('click', () => setBtnActive(btnAllStudents, 'all_students'));
}

function formatLastSeen(lastSeenStr, isOnline) {
    if (isOnline) return '<span style="color:#51cf66; font-weight: bold;"><i class="fas fa-circle" style="font-size: 8px;"></i> متصل الآن</span>';
    if (!lastSeenStr) return 'غير نشط مؤخراً';
    
    try {
        const lastSeen = new Date(lastSeenStr);
        const now = new Date();
        const diffMs = now - lastSeen;
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) return 'منذ ثوانٍ';
        if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
        
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `منذ ${diffHours} ساعة`;
        
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays === 1) return 'أمس';
        if (diffDays === 2) return 'منذ يومين';
        if (diffDays < 7) return `منذ ${diffDays} أيام`;
        
        return lastSeen.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return lastSeenStr.split('T')[0];
    }
}

























