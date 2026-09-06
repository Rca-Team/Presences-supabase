# Presences Studios (`smartboard-app`)

The next-generation, high-performance Classroom Operating System engineered specifically for **Samsung Android Interactive Displays** (Samsung WAC & Flip Series).

## 🚀 Key Highlights

- **Isolated Deployment:** Operates on its own deployment / domain (e.g. `board.presences.ai`), completely eliminating memory pressure or crash risks on the main Presences attendance and parent portals.
- **Ultra-Lightweight Footprint:** ~124 kB gzipped bundle with 0 heavy face biometric models, delivering sub-second boot times on Android IFPD browsers.
- **4K Dual-Stylus Whiteboard:** Inking suite (pen, brush, highlighter, 2s lecture laser pointer, palm/fist erase detection, dynamic shapes, and math grids).
- **Curriculum Preloader Hub:** Classes 6–12 syllabus preloaded with topic outlines, formulas, and learning objectives.
- **Auto-Adjusting Split-Slide Workspace:** 1-Click auto-formatting into **Student Zone** (with solve stopwatch & checkpoints) and **Teacher Zone** (with progressive step-by-step reveal).
- **AI Calculation Performer:** Step-by-step arithmetic, quadratic roots, trigonometry, calculus, and chemical equation balancing with 1-tap board stamp.
- **Topic-Specific YouTube Animations:** Curated, distraction-free educational 3D animation clips from Khan Academy, 3Blue1Brown, Veritasium, and PhET.
- **Instant Student QR Download:** Students scan a live on-screen QR code to download the day's notes without creating accounts.
- **One-Click Parent Portal Sync:** Summarizes classroom outcomes and pushes directly to the shared Presences Supabase backend.

---

## 💻 Local Development

```bash
cd "Presences Studio"
npm install
npm run dev
```

The app will run at `http://localhost:5174`.

---

## 🌐 Deploying to Vercel (Dedicated Domain)

1. Open your [Vercel Dashboard](https://vercel.com) and click **Add New Project**.
2. Select your repository: `Presences-AI`.
3. In **Project Settings**:
   - **Framework Preset:** Vite
   - **Root Directory:** `Presences Studio` *(Important)*
4. Under **Environment Variables**, add:
   - `VITE_SUPABASE_URL`: `https://your-project.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: `your-supabase-publishable-key`
   - `VITE_GEMINI_API_KEY`: `your-gemini-api-key` *(Optional - app includes offline fallback engines)*
5. Click **Deploy**.
6. Set your custom domain (e.g. `board.presences.ai`).

---

## 📱 Running on Samsung Interactive Display (Android)

1. Open the built-in Chromium browser on the Samsung display.
2. Navigate to your deployed URL (e.g. `https://board.presences.ai`).
3. Tap the browser menu and select **"Add to Home screen"** or enable **Kiosk / Fullscreen Mode**.
4. The display will launch in native fullscreen with palm rejection and dual-stylus tracking enabled!
