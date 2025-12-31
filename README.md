# ✈️ Jetlag: The Game (PWA)

A real-time, location-based Hide and Seek game built with **Next.js**, **Supabase**, and **Mapbox**.

![Jetlag Icon](./public/apple-icon.png)

## 🚀 Features

*   **Real-time Multiplayer:** Hider vs. Seekers with live location tracking.
*   **Geolocation Logic:** Fog of war, distance calculation, and interactive maps.
*   **PWA Support:** Installable on iOS and Android with offline capabilities.
*   **Role Swapping:** Automated round management and role rotation.
*   **Curses & Powerups:** Interactive card system to debuff opponents.

## 🛠️ Technology Stack

*   **Framework:** Next.js 16 (App Router + Turbopack)
*   **Database:** Supabase (PostgreSQL + PostGIS)
*   **Maps:** Mapbox GL JS + Turf.js
*   **Styling:** Tailwind CSS
*   **State:** React Server Components + Realtime Subscriptions

## ⚡ Quick Start

### 1. Prerequisites
*   Node.js 18+
*   A Supabase Project
*   A Mapbox Account

### 2. Environment Setup
Create a `.env.local` file in the root directory:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your-mapbox-token
NEXT_PUBLIC_GOOGLE_MAPS_KEY=your-google-places-key (Optional, for Search)
```

### 3. Database Setup
1.  Go to your Supabase Dashboard -> **SQL Editor**.
2.  Open `master_schema.sql` from this repository.
3.  Run the script to initialize tables, enums, policies, and RPC functions.

### 4. Run Locally
```bash
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

---

## 📱 Production Deployment (Vercel)

1.  Push code to GitHub.
2.  Import project into [Vercel](https://vercel.com).
3.  Add the Environment Variables in Vercel settings.
4.  Deploy!
5.  **Critical:** Update your Supabase **Auth Site URL** to your new Vercel domain (e.g., `https://my-jetlag-app.vercel.app`) to fix login redirects.

## 🤝 Contribution
*   **Dev Mode:** `npm run dev` starts the app with Turbopack.
*   **Lint:** `npm run lint` to check for issues.
