---
description: How to deploy Jetlag to Vercel (Production w/ HTTPS)
---

# Deploying Jetlag to Production (Vercel)

We will use **Vercel** for hosting because it is built by the creators of Next.js, offers free SSL (HTTPS) automatically, and is the easiest way to deploy this app.

## Prerequisites
1.  A [Vercel Account](https://vercel.com/signup).
2.  Your project pushed to a Git repository (GitHub, GitLab, or Bitbucket).

## Step 1: Push to GitHub (if not already)
If your code is not on GitHub yet:
1.  Create a new repository on GitHub.
2.  Run these commands in your terminal:
    ```bash
    git init
    git add .
    git commit -m "Ready for deploy"
    git branch -M main
    git remote add origin <YOUR_GITHUB_REPO_URL>
    git push -u origin main
    ```

## Step 2: Import into Vercel
1.  Go to your [Vercel Dashboard](https://vercel.com/dashboard).
2.  Click **"Add New..."** -> **"Project"**.
3.  Select your `Jetlag` repository from the list (Import).

## Step 3: Configure Environment Variables
Vercel needs the secrets stored in your `.env.local` to run the app.
1.  In the "Configure Project" screen, look for **Environment Variables**.
2.  Add the following variables (copy values from your local `.env.local`):
    *   `NEXT_PUBLIC_SUPABASE_URL`
    *   `NEXT_PUBLIC_SUPABASE_ANON_KEY`
    *   `NEXT_PUBLIC_GOOGLE_MAPS_KEY`
    *   `NEXT_PUBLIC_MAPBOX_TOKEN`
3.  **Important:** For production, ensure you are using the correct keys if you have separate prod/dev environments in Supabase (optional, usually same for small apps).

## Step 4: Deploy
1.  Click **Deploy**.
2.  Wait ~1-2 minutes for the build to complete.
3.  Once done, you will get a domain like `jetlag-game.vercel.app`. **This URL has HTTPS enabled automatically.**

## Step 5: Update Supabase Auth Redirects
Now that you have a real URL, tell Supabase about it so login works.
1.  Go to your **Supabase Dashboard** -> **Authentication** -> **URL Configuration**.
2.  In **Site URL**, enter your new Vercel URL (e.g., `https://jetlag-game.vercel.app`).
3.  (Optional) Add it to **Redirect URLs** as well:
    *   `https://jetlag-game.vercel.app/**`

## Step 6: Verify PWA
1.  Open `https://jetlag-game.vercel.app` on your phone.
2.  You should see the "Install" option (or "Add to Home Screen").
3.  The app should load with your new Icon and run in standalone mode.

> [!TIP]
> **Debugging in Prod:**
> If you see errors, go to the Vercel Dashboard -> Deployments -> Click the latest deployment -> **Logs** to see server-side errors.
