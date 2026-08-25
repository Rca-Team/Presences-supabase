
# Presence - Facial Recognition Attendance System

## Project info

An advanced attendance management system powered by facial recognition technology.

## Features

- Real-time attendance tracking with facial recognition
- Gate-mode auto-marking with live camera scanning
- Dashboard with attendance analytics and insights
- User registration and management
- Secure authentication
- Department-based tracking and reporting

## Technologies Used

- React
- TypeScript
- Tailwind CSS
- shadcn/ui components
- Supabase for backend, auth, and database
- Face-api.js for facial recognition
- Vite PWA for offline support

## Getting Started

Follow these steps to get the project running locally:

```sh
# Step 1: Clone the repository
git clone <REPOSITORY_URL>

# Step 2: Navigate to the project directory
cd presence

# Step 3: Install the necessary dependencies
npm i

# Step 4: Create a .env file with your environment variables
# Use .env.example as a template

# Step 5: Start the development server
npm run dev
```

## Deployment on Vercel

This project is configured for Vercel out of the box. The `vercel.json` file specifies:

- Build command: `npm run build`
- Output directory: `dist`
- SPA fallback: all routes serve `index.html`
- Long-term caching for `/models/*` static assets
- Security headers for all routes

### Required Environment Variables

Set these in your Vercel project settings (Settings → Environment Variables):

```
VITE_SUPABASE_URL=https://eiahucigcvsnuvviajqt.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpYWh1Y2lnY3ZzbnV2dmlhanF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MDA5NDEsImV4cCI6MjA5MzQ3Njk0MX0.nPl7U5Sm5Rm2zFnwLO3RzjOnkrIbrzEfFzSgkbLnX_I
```

> The project already has a hardcoded fallback for the Lovable cloud Supabase project, but setting the env vars explicitly in Vercel is recommended for production.

### Deploy to Vercel (GitHub import)

1. Push your code to a GitHub repository.
2. Log in to [Vercel](https://vercel.com) and create a new project.
3. Import your GitHub repository.
4. Framework preset: **Vite** (or leave as “Other” and let `vercel.json` handle it).
5. Add the environment variables above.
6. Click **Deploy**.

Vercel will run `npm run build` and serve the `dist` folder with SPA routing enabled.

### Deploy to Vercel (CLI)

```sh
# Install Vercel CLI if needed
npm i -g vercel

# Login and deploy
vercel login
vercel --prod
```

## Build locally

```sh
npm run build
npm run preview
```

## Made by Gaurav

© 2024 Presence. All rights reserved.
