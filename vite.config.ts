/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// base "./" deixa o app funcionar em qualquer pasta: no computador (npm run preview)
// e no GitHub Pages em /claude-skills/financeiro/.
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Finanças",
        short_name: "Finanças",
        description: "Seu dinheiro organizado em envelopes, com o negócio NFC, cartão e metas.",
        lang: "pt-BR",
        start_url: "./",
        scope: "./",
        // Identidade do app no Android. Mudou de "./" para "financas-app" porque uma instalação
        // antiga ficou pela metade no celular ("app já instalado" / "não foi possível encontrar o app").
        id: "financas-app",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0f1217",
        theme_color: "#0f1217",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: { globPatterns: ["**/*.{js,css,html,svg,png,woff2}"], navigateFallback: "index.html" },
    }),
  ],
  build: { outDir: "docs", emptyOutDir: true, chunkSizeWarningLimit: 900 },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
