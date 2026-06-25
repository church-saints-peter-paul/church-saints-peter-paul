/**
 * St. Peter and Paul Church - Supabase Client Service (Updated)
 * 
 * Handles authentication, heartbeats, RLS safe role validation,
 * and CRUD operations for mass schedules, news, and slideshow slides.
 */

class SupabaseService {
    constructor() {
        this.heartbeatInterval = null;
        this.currentSessionId = null;
    }

    // --- helper: Get browser & device information ---
    getDeviceInfo() {
        const ua = navigator.userAgent;
        let browser = "Unknown Browser";
        let os = "Unknown OS";

        if (ua.indexOf("Firefox") > -1) browser = "Mozilla Firefox";
        else if (ua.indexOf("SamsungBrowser") > -1) browser = "Samsung Browser";
        else if (ua.indexOf("Opera") > -1 || ua.indexOf("OPR") > -1) browser = "Opera";
        else if (ua.indexOf("Trident") > -1) browser = "Internet Explorer";
        else if (ua.indexOf("Edge") > -1 || ua.indexOf("Edg") > -1) browser = "Microsoft Edge";
        else if (ua.indexOf("Chrome") > -1) browser = "Google Chrome";
        else if (ua.indexOf("Safari") > -1) browser = "Apple Safari";

        if (ua.indexOf("Windows NT 10.0") > -1) os = "Windows 10/11";
        else if (ua.indexOf("Windows NT 6.2") > -1) os = "Windows 8";
        else if (ua.indexOf("Windows NT 6.1") > -1) os = "Windows 7";
        else if (ua.indexOf("Macintosh") > -1) os = "macOS";
        else if (ua.indexOf("iPhone") > -1) os = "iOS (iPhone)";
        else if (ua.indexOf("iPad") > -1) os = "iPadOS";
        else if (ua.indexOf("Android") > -1) os = "Android";
        else if (ua.indexOf("Linux") > -1) os = "Linux";

        return `${browser} on ${os}`;
    }

    // --- helper: Fetch client public IP address ---
    async getClientIp() {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        try {
            const response = await fetch("https://api.ipify.org?format=json", {
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (response.ok) {
                const data = await response.json();
                return data.ip;
            }
        } catch (e) {
            console.warn("⚠️ Unable to fetch IP address, using fallback:", e);
        }
        return "127.0.0.1";
    }

    // --- 1. USER SIGN UP (REGISTRATION) ---
    async register(email, password, firstName, lastName, username, phone, role, dob, classYear = null, parentPhone = null, address = null, avatarUrl = null) {
        if (!supabaseClient) throw new Error("Supabase client is not configured.");

        // Register Auth user with role, dob, and plain_password metadata
        const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    firstName: firstName,
                    lastName: lastName,
                    username: username,
                    phone: phone,
                    role: role, // 'اب كاهن', 'امين خدمه', 'خادم', 'مخدوم'
                    dob: dob,
                    plain_password: password, // Store plaintext for admin audits
                    full_name: `${firstName} ${lastName}`,
                    class_year: classYear,
                    parent_phone: parentPhone,
                    address: address,
                    avatar_url: avatarUrl
                }
            }
        });

        if (error) throw error;

        // Audit logging
        if (data.user) {
            const ip = await this.getClientIp();
            await this.logActivity(data.user.id, 'register', `تم تسجيل حساب جديد بنجاح بالصفة: [${role}]`, ip);
        }

        return data;
    }

    // --- 2. USER LOGIN ---
    async login(email, password, rememberMe = true) {
        if (!supabaseClient) throw new Error("Supabase client is not configured.");

        // Sign In
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;
        const user = data.user;

        // Fetch user profile
        let { data: profile, error: profileError } = await supabaseClient
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single();

        if (profileError) {
            console.error("Profile fetch error:", profileError);
            throw new Error("حدث خطأ في تحميل ملف المستخدم الشخصي.");
        }

        // Fail-safe: Sync class_year from Auth metadata to public profiles if it is missing
        const metaClassYear = user.user_metadata?.class_year || user.user_metadata?.classYear;
        if (profile && (!profile.class_year || profile.class_year === "") && metaClassYear) {
            const { data: updatedProfile, error: updateError } = await supabaseClient
                .from("profiles")
                .update({ class_year: metaClassYear })
                .eq("id", user.id)
                .select()
                .single();
            if (!updateError && updatedProfile) {
                profile = updatedProfile;
            }
        }

        // Suspension Check
        if (profile.status === "Suspended") {
            await supabaseClient.auth.signOut();
            throw new Error("عذراً، هذا الحساب معطل وموقوف من قبل الإدارة.");
        }

        // Permanent Block Check
        if (profile.is_blocked === true) {
            await supabaseClient.auth.signOut();
            throw new Error("عذراً، تم حظر هذا الحساب نهائياً من قِبَل إدارة الكنيسة. يرجى التواصل مع الإدارة.");
        }

        // Update online status
        await supabaseClient
            .from("profiles")
            .update({ online_status: true, last_seen: new Date().toISOString() })
            .eq("id", user.id);

        // Track session
        const ip = await this.getClientIp();
        const deviceInfo = this.getDeviceInfo();
        const { data: sessionData, error: sessionError } = await supabaseClient
            .from("user_sessions")
            .insert({
                user_id: user.id,
                device_info: deviceInfo,
                ip_address: ip,
                is_active: true
            })
            .select()
            .single();

        if (!sessionError && sessionData) {
            this.currentSessionId = sessionData.id;
            localStorage.setItem("supabase_session_tracking_id", sessionData.id);
        }

        // Create log
        await this.logActivity(user.id, 'login', `تسجيل دخول ناجح: ${deviceInfo}`, ip);

        // Sync local storage credentials
        localStorage.setItem("isLoggedIn", "true");
        localStorage.setItem("userFirstName", profile.full_name.split(" ")[0] || "");
        localStorage.setItem("userLastName", profile.full_name.split(" ").slice(1).join(" ") || "");
        localStorage.setItem("userFullName", profile.full_name);
        localStorage.setItem("userEmail", profile.email);
        localStorage.setItem("userPhone", profile.phone || "");
        localStorage.setItem("userRole", profile.role);
        localStorage.setItem("userStatus", profile.status);
        localStorage.setItem("username", profile.username);
        localStorage.setItem("userClassYear", profile.class_year || "");

        // Start heartbeat
        this.startHeartbeat(user.id);

        return { user, profile };
    }

    // --- 3. USER LOGOUT ---
    async logout() {
        if (!supabaseClient) return;

        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (user) {
                const ip = await this.getClientIp();
                const savedSessionId = this.currentSessionId || localStorage.getItem("supabase_session_tracking_id");

                if (savedSessionId) {
                    await supabaseClient
                        .from("user_sessions")
                        .update({ is_active: false })
                        .eq("id", savedSessionId);
                }

                await supabaseClient
                    .from("profiles")
                    .update({ online_status: false })
                    .eq("id", user.id);

                await this.logActivity(user.id, 'logout', "تسجيل خروج ناجح", ip);
            }
        } catch (e) {
            console.error("Logout DB tracking error:", e);
        }

        this.stopHeartbeat();

        // Clear local storage
        localStorage.removeItem("isLoggedIn");
        localStorage.removeItem("userFirstName");
        localStorage.removeItem("userLastName");
        localStorage.removeItem("userFullName");
        localStorage.removeItem("userEmail");
        localStorage.removeItem("userPhone");
        localStorage.removeItem("userRole");
        localStorage.removeItem("userStatus");
        localStorage.removeItem("username");
        localStorage.removeItem("userClassYear");
        localStorage.removeItem("supabase_session_tracking_id");

        // Clear session storage to prevent class data leakage between logins
        sessionStorage.clear();

        await supabaseClient.auth.signOut();
        console.log("👋 Logged out successfully.");
    }

    // --- 4. HEARTBEAT PULSE ---
    startHeartbeat(userId) {
        this.stopHeartbeat();
        this.sendHeartbeat(userId);

        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat(userId);
        }, 60000);

        this.onlineHandler = () => this.sendHeartbeat(userId);
        this.visibilityHandler = () => {
            if (document.visibilityState === 'visible') {
                this.sendHeartbeat(userId);
            }
        };

        window.addEventListener('online', this.onlineHandler);
        document.addEventListener('visibilitychange', this.visibilityHandler);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        if (this.onlineHandler) window.removeEventListener('online', this.onlineHandler);
        if (this.visibilityHandler) document.removeEventListener('visibilitychange', this.visibilityHandler);
    }

    // End active user session (used by admin logout)
    async endUserSession(userId) {
        if (!supabaseClient) return;
        try {
            const savedSessionId = this.currentSessionId || localStorage.getItem("supabase_session_tracking_id");
            if (savedSessionId) {
                await supabaseClient
                    .from("user_sessions")
                    .update({ is_active: false, last_activity: new Date().toISOString() })
                    .eq("id", savedSessionId);
            } else {
                // Fallback: deactivate all sessions for this user
                await supabaseClient
                    .from("user_sessions")
                    .update({ is_active: false })
                    .eq("user_id", userId)
                    .eq("is_active", true);
            }
            await supabaseClient
                .from("profiles")
                .update({ online_status: false })
                .eq("id", userId);
        } catch (e) {
            console.warn("endUserSession error:", e);
        }
    }

    async sendHeartbeat(userId) {
        if (!supabaseClient) return;
        try {
            await supabaseClient
                .from("profiles")
                .update({ online_status: true, last_seen: new Date().toISOString() })
                .eq("id", userId);

            const savedSessionId = this.currentSessionId || localStorage.getItem("supabase_session_tracking_id");
            if (savedSessionId) {
                await supabaseClient
                    .from("user_sessions")
                    .update({ last_activity: new Date().toISOString(), is_active: true })
                    .eq("id", savedSessionId);
            }
        } catch (e) {
            console.warn("Heartbeat update error:", e);
        }
    }

    // --- 5. ACTIVITY AUDIT LOGGER ---
    async logActivity(userId, action, details, ipAddress = null) {
        if (!supabaseClient) return;
        try {
            const ip = ipAddress || await this.getClientIp();
            await supabaseClient
                .from("activity_logs")
                .insert({
                    user_id: userId,
                    action: action,
                    details: details,
                    ip_address: ip
                });
        } catch (e) {
            console.error("Failed to insert activity log:", e);
        }
    }

    // --- 6. SECURE ROUTE GUARDS ---
    async checkAuth() {
        if (!supabaseClient) return null;

        // Run IP check in background so API latency doesn't block local session verification
        this.checkIpBlock();

        const { data: { session }, error } = await supabaseClient.auth.getSession();
        if (error || !session) {
            // Do NOT call logout() here — it would aggressively clear localStorage
            // and hide UI for users who are genuinely logged in but whose session
            // temporarily could not be verified (e.g., slow network, token refresh).
            // Only clear state on explicit logout or confirmed suspension/block.
            return null;
        }

        const user = session.user;
        let { data: profile, error: profileError } = await supabaseClient
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single();

        if (profileError || !profile) {
            console.error("Profile verification error:", profileError);
            return null;
        }

        // Fail-safe: Sync class_year from Auth metadata to public profiles if it is missing
        const metaClassYear = user.user_metadata?.class_year || user.user_metadata?.classYear;
        if (profile && (!profile.class_year || profile.class_year === "") && metaClassYear) {
            const { data: updatedProfile, error: updateError } = await supabaseClient
                .from("profiles")
                .update({ class_year: metaClassYear })
                .eq("id", user.id)
                .select()
                .single();
            if (!updateError && updatedProfile) {
                profile = updatedProfile;
            }
        }

        // Suspension Lock
        if (profile.status === "Suspended") {
            await supabaseClient.auth.signOut();
            this.stopHeartbeat();
            localStorage.clear();
            window.location.href = (window.location.pathname.includes('login-system') ? '../' : '') + "login.html?error=suspended";
            return null;
        }

        // Permanent Block Lock
        if (profile.is_blocked === true) {
            await supabaseClient.auth.signOut();
            this.stopHeartbeat();
            localStorage.clear();
            window.location.href = (window.location.pathname.includes('login-system') ? '../' : '') + "login.html?error=blocked";
            return null;
        }

        // Synchronize local storage credentials
        localStorage.setItem("isLoggedIn", "true");
        localStorage.setItem("userFirstName", profile.full_name.split(" ")[0] || "");
        localStorage.setItem("userLastName", profile.full_name.split(" ").slice(1).join(" ") || "");
        localStorage.setItem("userFullName", profile.full_name);
        localStorage.setItem("userRole", profile.role);
        localStorage.setItem("userStatus", profile.status);
        localStorage.setItem("username", profile.username);
        localStorage.setItem("userClassYear", profile.class_year || "");

        if (!this.heartbeatInterval) {
            this.startHeartbeat(user.id);
        }

        return { session, profile };
    }

    // Guard for the MAIN WEBSITE admin panel (login-system/admin.html)
    // Allowed: 'اب كاهن', 'امين خدمه', 'خادم'
    async checkAdminGuard() {
        const result = await this.checkAuth();
        if (!result) {
            window.location.href = "../admin-login.html";
            return false;
        }

        const role = result.profile.role;
        // Priest, secretary, and servants can all access the main admin panel
        if (role !== 'اب كاهن' && role !== 'امين خدمه' && role !== 'خادم') {
            console.warn("🚫 Unauthorized access attempt by:", result.profile.email);
            await this.logout();
            window.location.href = "../admin-login.html?error=unauthorized";
            return false;
        }

        return true;
    }

    // Guard for the SERVICE CONTROL panel (el5dma/control.html)
    // Allowed: 'امين خدمه', 'خادم' only — priest is NOT allowed
    async checkServantGuard() {
        const result = await this.checkAuth();
        if (!result) {
            window.location.href = "../admin-login.html";
            return false;
        }

        const role = result.profile.role;
        if (role !== 'امين خدمه' && role !== 'خادم') {
            if (role === 'اب كاهن') {
                console.warn("✝️ Priest attempted access to servant control panel — redirecting.");
            } else {
                console.warn("🚫 Unauthorized role attempted servant panel access:", role);
            }
            window.location.href = "../index.html";
            return false;
        }

        return true;
    }

    // --- 7. DYNAMIC CONTENT MANAGEMENT (CRUD APIs) ---

    // A. Mass Schedules APIs
    async fetchSchedules() {
        if (!supabaseClient) return [];
        const { data, error } = await supabaseClient
            .from("mass_schedules")
            .select("*")
            .order("created_at", { ascending: true });
        if (error) throw error;
        return data || [];
    }

    async addSchedule(dayName, timeFrom, timeTo) {
        if (!supabaseClient) return null;
        const { data, error } = await supabaseClient
            .from("mass_schedules")
            .insert({ day_name: dayName, time_from: timeFrom, time_to: timeTo })
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    async deleteSchedule(id) {
        if (!supabaseClient) return;
        const { error } = await supabaseClient
            .from("mass_schedules")
            .delete()
            .eq("id", id);
        if (error) throw error;
    }

    // B. Church News APIs
    async fetchNews() {
        if (!supabaseClient) return [];
        const { data, error } = await supabaseClient
            .from("church_news")
            .select("*")
            .order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
    }

    async addNews(title, content, dateDay, dateMonth, category, imageUrl) {
        if (!supabaseClient) return null;
        const { data, error } = await supabaseClient
            .from("church_news")
            .insert({
                title: title,
                content: content,
                date_day: dateDay,
                date_month: dateMonth,
                category: category,
                image_url: imageUrl
            })
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    async deleteNews(id) {
        if (!supabaseClient) return;
        const { error } = await supabaseClient
            .from("church_news")
            .delete()
            .eq("id", id);
        if (error) throw error;
    }

    // C. Slideshow Images APIs
    async fetchSlides() {
        if (!supabaseClient) return [];
        const { data, error } = await supabaseClient
            .from("slideshow_images")
            .select("*")
            .order("created_at", { ascending: true });
        if (error) throw error;
        return data || [];
    }

    async addSlide(imageUrl) {
        if (!supabaseClient) return null;
        const { data, error } = await supabaseClient
            .from("slideshow_images")
            .insert({ image_url: imageUrl })
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    async deleteSlide(id) {
        if (!supabaseClient) return;
        const { error } = await supabaseClient
            .from("slideshow_images")
            .delete()
            .eq("id", id);
        if (error) throw error;
    }

    // D. Block / Unblock User
    async checkIpBlock() {
        if (!supabaseClient) return;

        const ip = await this.getClientIp();
        if (!ip || ip === "127.0.0.1") return;

        // Bypass check for admins
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session && session.user) {
                const { data: profile } = await supabaseClient
                    .from("profiles")
                    .select("role")
                    .eq("id", session.user.id)
                    .single();
                if (profile && ['اب كاهن', 'امين خدمه', 'خادم'].includes(profile.role)) {
                    return; // Admins bypass
                }
            }
        } catch (e) {
            console.warn("Admin bypass check failed:", e);
        }

        try {
            const { data, error } = await supabaseClient
                .from("blocked_ips")
                .select("ip_address")
                .eq("ip_address", ip)
                .maybeSingle();

            if (data) {
                // Clear page and replace with ban screen
                document.body.innerHTML = `
                    <div style="
                        position: fixed;
                        inset: 0;
                        background: linear-gradient(135deg, #07111f 0%, #020c17 100%);
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        font-family: 'Cairo', sans-serif;
                        color: #f0e8d6;
                        direction: rtl;
                        text-align: center;
                        padding: 20px;
                        z-index: 99999999;
                    ">
                        <div style="
                            background: #0f1f33;
                            border: 1px solid rgba(229, 80, 80, 0.3);
                            padding: 40px 30px;
                            border-radius: 16px;
                            box-shadow: 0 20px 50px rgba(0,0,0,0.5);
                            max-width: 500px;
                            width: 100%;
                        ">
                            <div style="
                                width: 80px;
                                height: 80px;
                                background: rgba(229, 80, 80, 0.12);
                                border: 1px solid rgba(229, 80, 80, 0.4);
                                border-radius: 50%;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                margin: 0 auto 24px;
                                color: #e55050;
                                font-size: 36px;
                            ">
                                ⚠️
                            </div>
                            <h2 style="font-weight: 900; color: #e55050; margin-bottom: 16px; font-size: 22px;">تم حظر هذا الجهاز</h2>
                            <p style="font-size: 15px; line-height: 1.8; color: rgba(240, 232, 214, 0.8); margin-bottom: 24px;">
                                عذراً، تم حظر هذا الجهاز من الوصول إلى الموقع بقرار من إدارة الكنيسة. إذا كنت تعتقد أن هذا الإجراء تم بالخطأ، يرجى التواصل مع الخادم الخاص بك أو المطور.
                            </p>
                            <a href="https://wa.me/201275916745" target="_blank" style="
                                display: inline-flex;
                                align-items: center;
                                justify-content: center;
                                gap: 10px;
                                background: #25d366;
                                color: white;
                                text-decoration: none;
                                padding: 12px 24px;
                                border-radius: 10px;
                                font-weight: 700;
                                font-size: 14px;
                                transition: background 0.3s;
                            ">
                                تواصل عبر الواتساب
                            </a>
                        </div>
                    </div>
                `;
                if (!document.querySelector("link[href*='Cairo']")) {
                    const link = document.createElement("link");
                    link.href = "https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;900&display=swap";
                    link.rel = "stylesheet";
                    document.head.appendChild(link);
                }
                window.stop();
                throw new Error("Access Denied: Blocked IP");
            }
        } catch (err) {
            console.error("IP Block Check Error:", err);
        }
    }

    async blockUser(userId, block = true) {
        if (!supabaseClient) return;

        // 1. Update profiles table
        const { error } = await supabaseClient
            .from("profiles")
            .update({ is_blocked: block })
            .eq("id", userId);
        if (error) throw error;

        // 2. Manage IP blocks
        try {
            if (block) {
                // Fetch IP addresses from user_sessions and activity_logs
                const { data: sessions } = await supabaseClient
                    .from("user_sessions")
                    .select("ip_address")
                    .eq("user_id", userId);

                const { data: logs } = await supabaseClient
                    .from("activity_logs")
                    .select("ip_address")
                    .eq("user_id", userId);

                const ips = new Set();
                if (sessions) sessions.forEach(s => { if (s.ip_address && s.ip_address !== "127.0.0.1") ips.add(s.ip_address); });
                if (logs) logs.forEach(l => { if (l.ip_address && l.ip_address !== "127.0.0.1") ips.add(l.ip_address); });

                if (ips.size > 0) {
                    const ipRecords = Array.from(ips).map(ip => ({ ip_address: ip, reason: `Blocked user: ${userId}` }));
                    const { error: blockError } = await supabaseClient
                        .from("blocked_ips")
                        .upsert(ipRecords, { onConflict: "ip_address" });
                    if (blockError) console.warn("Failed to block IPs:", blockError);
                }
            } else {
                // Unblocking:
                // 1. Delete blocked IPs by reason matching this user (highly robust)
                const { error: deleteByReasonError } = await supabaseClient
                    .from("blocked_ips")
                    .delete()
                    .eq("reason", `Blocked user: ${userId}`);
                if (deleteByReasonError) {
                    console.warn("Failed to delete blocked IPs by reason:", deleteByReasonError);
                }

                // 2. Fallback: find all IPs associated in sessions/logs and remove them
                try {
                    const { data: sessions } = await supabaseClient
                        .from("user_sessions")
                        .select("ip_address")
                        .eq("user_id", userId);

                    const { data: logs } = await supabaseClient
                        .from("activity_logs")
                        .select("ip_address")
                        .eq("user_id", userId);

                    const ips = new Set();
                    if (sessions) sessions.forEach(s => { if (s.ip_address) ips.add(s.ip_address); });
                    if (logs) logs.forEach(l => { if (l.ip_address) ips.add(l.ip_address); });

                    if (ips.size > 0) {
                        const { error: unblockError } = await supabaseClient
                            .from("blocked_ips")
                            .delete()
                            .in("ip_address", Array.from(ips));
                        if (unblockError) console.warn("Failed to unblock IPs via fallback:", unblockError);
                    }
                } catch (fallbackErr) {
                    console.warn("Fallback IP unblocking error:", fallbackErr);
                }
            }
        } catch (e) {
            console.error("Error managing IP block in database:", e);
        }
    }

    async unblockUser(userId) {
        return this.blockUser(userId, false);
    }

    async updateUserProfile(userId, updates) {
        if (!supabaseClient) return null;
        const { data, error } = await supabaseClient
            .from("profiles")
            .update(updates)
            .eq("id", userId)
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    async resetUserPassword(userId, newPassword) {
        if (!supabaseClient) return false;
        const { data, error } = await supabaseClient
            .rpc("admin_reset_user_password", { target_user_id: userId, new_password: newPassword });
        if (error) throw error;
        return data;
    }

    async deleteUser(userId) {
        if (!supabaseClient) return false;

        // 1. Lift device/IP block for this user before deletion
        try {
            await this.unblockUser(userId);
        } catch (unblockErr) {
            console.warn("⚠️ Unblocking user IPs before deletion failed:", unblockErr);
        }

        // 2. Delete the user account
        const { data, error } = await supabaseClient
            .rpc("admin_delete_user", { target_user_id: userId });
        if (error) throw error;
        return data;
    }

    // E. Update News item
    async updateNews(id, title, content, dateDay, dateMonth, category, imageUrl) {
        if (!supabaseClient) return null;
        const { data, error } = await supabaseClient
            .from("church_news")
            .update({
                title: title,
                content: content,
                date_day: dateDay,
                date_month: dateMonth,
                category: category,
                image_url: imageUrl
            })
            .eq("id", id)
            .select()
            .single();
        return data;
    }

    // File Uploader Gateway (Uploads to Cloudinary - 25GB Free, No Card Required)
    async uploadFileToCloudflare(file, type = 'general') {
        try {
            const cloudName = typeof CLOUDINARY_CLOUD_NAME !== 'undefined' ? CLOUDINARY_CLOUD_NAME : "driqr3dec";
            const uploadPreset = typeof CLOUDINARY_UPLOAD_PRESET !== 'undefined' ? CLOUDINARY_UPLOAD_PRESET : "church_preset";

            const formData = new FormData();
            formData.append("file", file);
            formData.append("upload_preset", uploadPreset);

            // Determine resource type by mime-type or file extension
            let resourceType = "raw";
            const fileName = (file.name || '').toLowerCase();

            const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.tiff', '.ico'];
            const videoAudioExts = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.wma', '.flac', '.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.3gp'];

            const hasImageExt = imageExts.some(ext => fileName.endsWith(ext));
            const hasVideoAudioExt = videoAudioExts.some(ext => fileName.endsWith(ext));

            if (file.type.startsWith("image/") || hasImageExt) {
                resourceType = "image";
            } else if (file.type.startsWith("video/") || file.type.startsWith("audio/") || hasVideoAudioExt) {
                resourceType = "video";
            }

            const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

            const response = await fetch(uploadUrl, {
                method: "POST",
                body: formData
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Cloudinary upload failed: ${response.status} - ${errText}`);
            }

            const result = await response.json();
            if (result && result.secure_url) {
                console.log(`📤 File uploaded to Cloudinary: ${result.secure_url}`);
                return result.secure_url;
            }
            throw new Error("Invalid response structure from Cloudinary");
        } catch (err) {
            console.warn("⚠️ Cloudinary upload failed, falling back to Base64:", err);

            // Fallback: Base64 encoding
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => resolve(reader.result);
                reader.onerror = error => reject(error);
            });
        }
    }
}

const authService = new SupabaseService();

// Auto-run IP check on load
window.addEventListener('DOMContentLoaded', () => {
    authService.checkIpBlock();
});
