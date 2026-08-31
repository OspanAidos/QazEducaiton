import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Tailwind v4 ставится плагином Vite, а не через postcss.config.js
export default defineConfig({
  plugins: [react(), tailwindcss()],

  // Сканируем только настоящие точки входа. Без этого Vite пытается
  // разобрать собранный preview-qazeducation-v2.html и ругается на
  // зависимости, которые уже вшиты внутрь этого файла.
  optimizeDeps: {
    entries: ["index.html"],
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          motion: ["motion/react"],
          supabase: ["@supabase/supabase-js"],
          icons: ["@phosphor-icons/react"],
        },
      },
    },
  },
});
