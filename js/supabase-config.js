/**
 * St. Peter and Paul Church - Supabase Configuration
 * 
 * Replace the placeholder SUPABASE_URL and SUPABASE_ANON_KEY with your actual project keys.
 */

// Configuration Variables
const SUPABASE_URL = "https://dmfwaurbrcuzrcbvzolv.supabase.co/";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtZndhdXJicmN1enJjYnZ6b2x2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5OTMyNzMsImV4cCI6MjA5NjU2OTI3M30.TPKs32E1eaUGBJpmMgimWCuU5n94hH9KSjZJlAYw5_M";

// Cloudinary Upload Configurations (25GB Free - No credit card required)
const CLOUDINARY_CLOUD_NAME = "driqr3dec";
const CLOUDINARY_UPLOAD_PRESET = "church_preset";

// Initialize Client
let supabaseClient = null;

// Support manual reset via URL parameter (e.g. ?reset_config=true)
if (typeof window !== 'undefined' && window.location.search.includes('reset_config=true')) {
    localStorage.removeItem('SUPABASE_CONFIG_URL');
    localStorage.removeItem('SUPABASE_CONFIG_KEY');
    console.log("🔄 Config reset requested via URL. Cleared local overrides.");
    try {
        const url = new URL(window.location.href);
        url.searchParams.delete('reset_config');
        window.history.replaceState({}, document.title, url.pathname + url.search);
    } catch (e) {
        console.warn("Failed to update URL history:", e);
    }
}

// Fallback to fetch keys from localStorage for easier development config
function configureSupabaseKeys(url, anonKey) {
    if (!url || !anonKey || url.trim() === '' || anonKey.trim() === '') {
        localStorage.removeItem('SUPABASE_CONFIG_URL');
        localStorage.removeItem('SUPABASE_CONFIG_KEY');
        console.log("✅ Cleared custom Supabase keys from local storage.");
    } else {
        localStorage.setItem('SUPABASE_CONFIG_URL', url.trim());
        localStorage.setItem('SUPABASE_CONFIG_KEY', anonKey.trim());
        console.log("✅ Custom Supabase keys stored locally. Reloading page...");
    }
    window.location.reload();
}

function isValidUrl(string) {
    try {
        new URL(string);
        return string.startsWith('http://') || string.startsWith('https://');
    } catch (_) {
        return false;  
    }
}

// Check local storage overrides
const localUrl = localStorage.getItem('SUPABASE_CONFIG_URL');
const localKey = localStorage.getItem('SUPABASE_CONFIG_KEY');
let useDefault = true;

if (localUrl && localKey) {
    const cleanUrl = localUrl.trim();
    const cleanKey = localKey.trim();

    // Check if overrides are valid or corrupted
    if (
        cleanUrl === "" || cleanUrl === "null" || cleanUrl === "undefined" || !isValidUrl(cleanUrl) ||
        cleanKey === "" || cleanKey === "null" || cleanKey === "undefined"
    ) {
        console.warn("⚠️ Corrupted or invalid Supabase overrides found in localStorage. Clearing them.");
        localStorage.removeItem('SUPABASE_CONFIG_URL');
        localStorage.removeItem('SUPABASE_CONFIG_KEY');
    } else if (typeof supabase !== 'undefined') {
        try {
            supabaseClient = supabase.createClient(cleanUrl, cleanKey);
            useDefault = false;
            console.log("⚡ Supabase Client Initialized using locally configured keys.");
        } catch (e) {
            console.error("❌ Failed to initialize Supabase client with local overrides. Falling back to default:", e);
            localStorage.removeItem('SUPABASE_CONFIG_URL');
            localStorage.removeItem('SUPABASE_CONFIG_KEY');
        }
    }
}

if (useDefault) {
    try {
        if (typeof supabase !== 'undefined') {
            supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log("⚡ Supabase Client Initialized Successfully.");
        } else {
            console.warn("⚠️ Supabase CDN SDK is not loaded yet. Make sure to load it before this configuration file.");
        }
    } catch (error) {
        console.error("❌ Error initializing Supabase client:", error);
    }
}

// Log active Supabase project URL for debugging
if (supabaseClient) {
    console.log("⚡ Active Supabase URL:", supabaseClient.supabaseUrl || "Unknown");
}
