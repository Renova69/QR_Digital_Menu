import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Read backend origin from VITE_API_URL (e.g. http://192.168.0.3:3000/api → http://192.168.0.3:3000)
  const backendOrigin = (
    env.VITE_API_URL || "http://localhost:3000/api"
  ).replace(/\/api\/?$/, "");

  return {
    plugins: [
      react(),
      tsconfigPaths({ root: "." }),
      VitePWA({
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.ts",
        registerType: "autoUpdate",
        injectRegister: "auto",
        manifest: {
          name: "QR Digital Menu",
          short_name: "QR Menu",
          description: "Digital menu — scan, browse, order.",
          theme_color: "#000000",
          background_color: "#ffffff",
          display: "standalone",
          start_url: ".",
          icons: [
            {
              src: "favicon.ico",
              sizes: "64x64 32x32 24x24 16x16",
              type: "image/x-icon"
            },
            {
              src: "logo192.png",
              type: "image/png",
              sizes: "192x192"
            },
            {
              src: "logo512.png",
              type: "image/png",
              sizes: "512x512"
            }
          ]
        },
        devOptions: {
          enabled: true,
          type: "module"
        }
      })
    ],
    server: {
      host: true,
      strictPort: true,
      port: 3001,
      proxy: {
        "/api": {
          target: backendOrigin,
          changeOrigin: true,
        },
        "/socket.io": {
          target: backendOrigin,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    optimizeDeps: {
      include: ["react-qr-code"],
    },
    build: {
      chunkSizeWarningLimit: 1000,
      // Split heavy third-party libs out of the main bundle (#5) so the entry
      // chunk shrinks and vendors cache independently across deploys.
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (
              id.includes("recharts") ||
              id.includes("/d3-") ||
              id.includes("victory")
            )
              return "charts";
            if (id.includes("@stripe")) return "stripe";
            // Match the whole excel packages, NOT their internal `modules/xlsx/`
            // subdir. A bare `id.includes('xlsx')` grabbed only those files and
            // left the rest of each package in `vendor`, splitting one package
            // across two chunks → circular `xlsx -> vendor -> xlsx`. The only
            // importers of these libs are app route chunks (never vendor), so a
            // one-way `xlsx -> vendor` edge for shared deps is fine.
            if (
              id.includes("write-excel-file") ||
              id.includes("read-excel-file")
            )
              return "xlsx";
            if (id.includes("@radix-ui")) return "radix";
            if (id.includes("react-router") || id.includes("@tanstack"))
              return "router-query";
            // React core, react-dom and scheduler stay in `vendor` alongside
            // React-consuming libs (react-i18next, etc.). A dedicated `react`
            // chunk created a circular chunk import: react-i18next (in `vendor`)
            // evaluates `React.createContext()` at module top-level, while the
            // `react` chunk in turn imported shared helpers back from `vendor`.
            // On the cyclic init the vendor chunk ran first, so `React` was
            // still undefined → "Cannot read properties of undefined (reading
            // 'createContext')" and a blank prod page. Dev (unbundled ESM) never
            // hit the cycle. Keeping React in `vendor` makes every other split
            // chunk a one-way leaf importer of React — no cycle possible.
            return "vendor";
          },
        },
      },
    },
    test: {
      globals: true,
      environment: "jsdom",
      reporters: [
        "default",
        [
          "tdd-guard-vitest",
          { projectRoot: "F:/PROGRAMING/QR_Digital_Menu-main" },
        ],
      ],
    },
  };
});
