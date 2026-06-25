# Supabase Configuration & Setup Instructions

To integrate the St. Peter and Paul Church website with Supabase, follow these configuration instructions.

## 1. Project Initialization
1. Sign up or log in to [supabase.com](https://supabase.com/).
2. Create a new project named **St. Peter & Paul Church**.
3. Choose a secure database password and set the region to one close to your audience.
4. Retrieve your **Project API Keys** from Project Settings > API:
   - `Project URL` (e.g. `https://your-project-id.supabase.co`)
   - `Anon Public Key` (the standard public API key)

## 2. Running Schema Migrations
To create the tables, indexes, triggers, and Row Level Security (RLS) policies:
1. Navigate to the **SQL Editor** in the Supabase Dashboard.
2. Click **New Query**.
3. Copy the contents of [schema.sql](file:///m:/كنيسه%20القدبسين%20بطرس%20و%20بولس/supabase/migrations/schema.sql) and paste it into the editor.
4. Click **Run** to execute. Verify that all statements execute successfully.

## 3. Enable Database Realtime
We use Supabase Realtime to update the online users count and active sessions instantly on the Admin Dashboard.
1. In the Supabase Dashboard, go to **Database** > **Replication**.
2. Click on the `supabase_realtime` publication to edit it.
3. Enable replication for the following tables:
   - `profiles`
   - `user_sessions`
4. Toggle **Realtime** switch.

## 4. Authentication Configuration
1. Go to **Authentication** > **Providers** > **Email**.
2. Ensure **Enable Email Provider** is toggled ON.
3. (Recommended) Configure **Confirm Email** according to your production preference:
   - If enabled, users must verify their email before logging in.
   - If disabled, users are instantly authenticated upon registering.
4. In **Authentication** > **URL Configuration**, set the Site URL to:
   - `http://localhost:5500` or `http://127.0.0.1:5500` (for local Live Server testing)
   - Your production site URL.
5. In **Redirect URLs**, add redirect endpoints:
   - `**/index.html`
   - `**/login-system/admin.html`
   - `**/admin.html`

## 5. Environment Variables
Add the keys to your project:
- Create a `.env` file inside `church-backend` with:
  ```env
  PORT=5000
  SUPABASE_URL=https://your-project-id.supabase.co
  SUPABASE_ANON_KEY=your-anon-public-key
  NODE_ENV=development
  ```
- Store client-side credentials in `js/supabase-config.js` (refer to instructions in `js/supabase-config.js` to define URL and Anon Key variables).
