# TailoredPlay — Complete $0 Zero-Credit Hosting & Multiplayer Setup Guide

This guide walks you through hosting **TailoredPlay** online for **$0 (zero credits / no credit card required)** and testing real-time multiplayer games across two physical devices (e.g. PC Host + Mobile Guest).

---

## Architecture at a Glance ($0 Stack)

| Component | Provider & Tier | Cost | What it does |
| :--- | :--- | :--- | :--- |
| **Web Hosting** | **Vercel** (Hobby Tier) | **$0** | Hosts the Next.js 16 app with automatic SSL/HTTPS and instant deployments. |
| **Database & Realtime** | **Supabase** (Free Tier) | **$0** | Postgres database, Anonymous UUID authentication, and cross-device Realtime subscriptions. |
| **Game Storage** | **Bundled in Next.js** (`/public/games/`) | **$0** | `Sands of Time` and `Housemates` are served directly as static files. No Cloudflare R2 bucket or S3 setup needed! |
| **Multiplayer Sync** | **Supabase Realtime** | **$0** | Instant roster join, game start triggers, score submissions, and chat across devices. |
| **Ads & Entitlements** | **Simulated 15s House Ads** | **$0** | Test commercial breaks and Host Pass bypass without requiring third-party ad networks or payment gateways. |

---

## Step 1: Create a Free Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in (or create a free account).
2. Click **New Project** and select your organization.
3. Fill in:
   - **Name**: `tailoredplay-dev` (or any name you like)
   - **Database Password**: Set a strong password (save it somewhere safe)
   - **Region**: Choose the region closest to where you and your players are located (e.g., `South America (São Paulo)` for Argentina/Brazil, `East US` for North America, `Central EU` for Europe) for lowest latency.
   - **Pricing Plan**: **Free** ($0/month).
4. Click **Create new project** and wait 1–2 minutes for the database to provision.

---

## Step 2: Enable Anonymous Authentication

TailoredPlay uses Supabase Anonymous Authentication so guests can join lobbies on their phones without having to create an email/password account:

1. In your Supabase Dashboard, click on **Authentication** (the user icon in the left sidebar).
2. Click on **Providers** in the sub-menu.
3. Scroll down to find **Anonymous Sign-ins**.
4. Toggle **Enable Anonymous sign-ins** to **ON**.
5. Click **Save**.

---

## Step 3: Run the Database Migration Script

1. In your Supabase Dashboard, click on **SQL Editor** (the `>_` terminal icon in the left sidebar).
2. Click **New query** (or the `+` button).
3. Open the file `web/supabase/migrations/001_initial_schema.sql` from this repository, copy its entire text, and paste it into the Supabase SQL Editor.
4. Click **Run** (or press `Ctrl + Enter` / `Cmd + Enter`).
5. You will see `Success. No rows returned`.

> **What this just configured automatically:**
> - Created tables: `profiles`, `monetization_settings`, `games`, `parties`, `party_members`, `scores`, `party_messages`, `entitlement_logs`.
> - Enabled Row-Level Security (RLS) with anti-privilege escalation policies.
> - Enabled `replica identity full` on rooms, members, scores, and chat.
> - Enabled the `supabase_realtime` publication for instant cross-device updates.
> - Seeded `Sands of Time` and `Housemates` into the catalog with their static paths.

---

## Step 4: Copy Your 2 Supabase Keys

1. In your Supabase Dashboard, click on the **Project Settings** (gear icon at the bottom of the left sidebar).
2. Navigate to **API** (under Configuration).
3. Find and copy these two values:
   - **Project URL** (e.g., `https://abcdefghijklm.supabase.co`) → This is `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public** API Key (long JWT starting with `ey...`) → This is `NEXT_PUBLIC_SUPABASE_ANON_KEY`

*(Optional)* If you want full admin dashboard controls, also copy:
- **service_role / secret** API Key → `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 5: (Optional) Test Locally with Real Supabase

To verify on your local machine before pushing online:

1. Inside the `web/` folder, create a file named `.env.local` containing:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```
2. In PowerShell / terminal, run:
   ```powershell
   cd web
   npm.cmd run dev
   ```
3. Open `http://localhost:3000` in your browser.

---

## Step 6: Deploy to Vercel for Free ($0)

### Method A: Deploy via GitHub (Recommended)

1. Push this repository to GitHub (or create a new GitHub repo for `TailoredEngine`).
2. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
3. Click **Add New...** → **Project**.
4. Select your GitHub repository and click **Import**.
5. In the configuration screen:
   - **Framework Preset**: Next.js
   - **Root Directory**: Click *Edit* and select `web` (since the Next.js app lives in the `web` subfolder).
   - Under **Environment Variables**, add the 2 keys from Step 4:
     - `NEXT_PUBLIC_SUPABASE_URL` = `https://your-project-id.supabase.co`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `your-anon-key-here`
6. Click **Deploy**.
7. In ~60 seconds, Vercel will give you a live production URL (e.g. `https://tailoredplay-xyz.vercel.app`) with automatic HTTPS!

---

### Method B: Deploy via Vercel CLI (Direct from Command Line)

If you don't want to use GitHub:
1. In PowerShell inside the `web` directory:
   ```powershell
   cd D:\Github\Misc\TailoredEngine\web
   npx.cmd vercel
   ```
2. Follow the prompt to log in and link your Vercel account.
3. When prompted for environment variables, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Deploy to production:
   ```powershell
   npx.cmd vercel --prod
   ```

---

## Step 7: How to Test Real Multiplayer Across Two Devices

Once your Vercel URL is live (e.g. `https://tailoredplay.vercel.app`):

### 1. Host Device (e.g., Your PC / Laptop):
1. Open `https://your-app.vercel.app`.
2. Notice your corporate anonymous username is automatically assigned (e.g., `AgileCapybara42`).
3. Click **Create Party**.
4. You will be taken to `/party/<INVITE_CODE>` (e.g., `/party/TURBO7`).
5. Select a game from the lobby:
   - **Sands of Time** (Celestial astrolabe balancing) or
   - **Housemates** (Tactile dollhouse decorator).

### 2. Guest Device (e.g., Your Mobile Phone):
1. Open your smartphone browser (Safari / Chrome).
2. Navigate to your app URL and enter the 6-character code, OR open the direct invite link:
   `https://your-app.vercel.app/party/TURBO7`
3. Notice:
   - **Instant Roster Sync**: The phone immediately appears in the Host's party roster on the PC screen via Supabase Realtime!
   - **Real-Time Chat**: Open the chat drawer on your phone and type `"Hello from mobile!"` → It appears on the PC screen instantly.

### 3. Playing the Game:
1. On the PC (Host), click **Start Game**.
2. Both the PC and Phone will **simultaneously transition into the game screen**!
3. The game loads directly from `/games/<slug>/index.html` inside the canvas.
4. Play the minigame on both devices.
5. At the end of the round, both players submit scores → The **Live Party Podium & Leaderboard** updates in real time on both screens!

---

## Summary Checklist

- [x] Pre-compiled games (`Sands of Time` & `Housemates`) bundled in `/public/games/`
- [x] Cross-device Supabase Realtime wired (`postgres_changes` + `broadcast`)
- [x] Zero-credit free hosting stack verified (Vercel Hobby + Supabase Free)
- [x] SQL migration schema hardened and seeded with initial catalog
- [x] Production build passes cleanly with zero TypeScript errors
