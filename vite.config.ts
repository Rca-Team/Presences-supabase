import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Canonical root resolution to handle Windows junctions/symlinks
  const projectRoot = fs.existsSync(process.cwd())
    ? fs.realpathSync(process.cwd())
    : process.cwd();

  // Ensure Vite env vars are always loaded and inlined into the production bundle.
  const env = loadEnv(mode, projectRoot, "VITE_");

  return {
    root: projectRoot,
    server: {
      host: "0.0.0.0",
      port: 5000,
    },
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: [
          "favicon.ico",
          "favicon.png",
          "logo.png",
          "app-icon-192.png",
          "app-icon-512.png",
          "app-icon-maskable.png",
          "apple-touch-icon.png",
          "og-image.png",
          "models/**/*",
        ],
        manifest: {
          name: "Presences - Smart School Automation",
          short_name: "Presences",
          description: "AI-Powered Face Recognition Attendance System",
          theme_color: "#3b82f6",
          background_color: "#0f172a",
          display: "standalone",
          orientation: "portrait-primary",
          scope: "/",
          start_url: "/",
          icons: [
            {
              src: "/app-icon-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/app-icon-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/app-icon-maskable.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
            {
              src: "/logo.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
          ],
          categories: ["education", "productivity"],
          shortcuts: [
            {
              name: "Smart Board Mode",
              short_name: "Smart Board",
              description: "Launch classroom interactive touch smart board display",
              url: "/smartboard",
              icons: [{ src: "/app-icon-192.png", sizes: "192x192" }],
            },
            {
              name: "Android Widgets",
              short_name: "Widgets",
              description: "Classroom glanceable widgets & quick tools",
              url: "/widgets",
              icons: [{ src: "/app-icon-192.png", sizes: "192x192" }],
            },
            {
              name: "Face Attendance",
              short_name: "Attendance",
              description: "AI-Powered live face recognition attendance",
              url: "/attendance",
              icons: [{ src: "/app-icon-192.png", sizes: "192x192" }],
            },
            {
              name: "Gate Scanner",
              short_name: "Gate Pass",
              description: "Scan student security QR gate passes",
              url: "/guard",
              icons: [{ src: "/app-icon-192.png", sizes: "192x192" }],
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024, // 8 MB limit
          navigateFallbackDenylist: [/^\/~oauth/, /^\/assets\/.*/],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          runtimeCaching: [],
        },
      }),
    ].filter(Boolean),
    resolve: {
      alias: [
        {
          find: "@/integrations/supabase/client",
          replacement: path.resolve(projectRoot, "./src/integrations/supabase/safeClient.ts"),
        },
        {
          find: "@",
          replacement: path.resolve(projectRoot, "./src"),
        },
      ],
    },
    build: {
      outDir: path.resolve(projectRoot, "dist"),
      sourcemap: false,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
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
      devSourcemap: false,
    },
  };
});
