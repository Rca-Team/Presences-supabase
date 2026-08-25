import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Ensure Vite env vars are always loaded and inlined into the production bundle.
  // This prevents runtime crashes like "supabaseUrl is required" when a remix/build
  // didn't pick up the .env values.
  const env = loadEnv(mode, process.cwd(), "VITE_");

  return {
    server: {
      host: "0.0.0.0",
      port: 5000,
    },
    // NOTE: We intentionally avoid overriding `import.meta.env.*` via `define` here.
    // Some Vite builds can behave unexpectedly when sub-properties are manually defined.
    // Standard Vite `VITE_` env injection is used instead.

    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.ico", "og-image.png", "models/**/*"],
        manifest: {
          name: "Presence - Face Attendance",
          short_name: "Presence",
          description: "AI-Powered Face Recognition Attendance System",
          theme_color: "#3b82f6",
          background_color: "#0f172a",
          display: "standalone",
          orientation: "portrait-primary",
          scope: "/",
          start_url: "/",
          icons: [
            {
              src: "/favicon.ico",
              sizes: "64x64",
              type: "image/x-icon",
            },
            {
              src: "/og-image.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any maskable",
            },
          ],
          categories: ["education", "productivity"],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024, // 8 MB limit
          navigateFallbackDenylist: [/^\/~oauth/],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
              handler: "NetworkFirst",
              options: {
                cacheName: "supabase-cache",
                expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
              },
            },
          ],
        },
      }),
    ].filter(Boolean),
    resolve: {
      alias: [
        {
          find: "@/integrations/supabase/client",
          replacement: path.resolve(__dirname, "./src/integrations/supabase/safeClient.ts"),
        },
        {
          find: "@",
          replacement: path.resolve(__dirname, "./src"),
        },
      ],
    },
    build: {
      outDir: "dist",
      sourcemap: false,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          // Only bucket the libraries that are genuinely shared across many
          // routes. Everything else is left to Rollup so that heavy, lazily
          // imported deps (onnx, jspdf, xlsx, mediapipe, charts) stay inside
          // the route chunk that actually needs them instead of being pulled
          // into the entry graph through a catch-all "deps" bucket.
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (/[\\/]react[\\/]|react-dom|react-router|scheduler/.test(id)) return "vendor";
            if (id.includes("@supabase")) return "supabase";
            if (id.includes("framer-motion") || id.includes("popmotion")) return "motion";
            if (id.includes("@radix-ui")) return "ui";
            return undefined;
          },

        },
      },
    },
    optimizeDeps: {
      exclude: ["face-api.js"],
    },
    css: {
      devSourcemap: true,
    },
  };
});

