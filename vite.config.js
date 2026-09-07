import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Tailwind v4 ставится плагином Vite, а не через postcss.config.js
const PRODUCTION_SUPABASE_PROJECT_REF = "fdoduxdwkgnldrzzxovu";

function projectRef(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname.endsWith(".supabase.co")
      ? hostname.slice(0, -".supabase.co".length)
      : "";
  } catch {
    return "";
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const isPreview = mode === "preview" || env.VITE_APP_ENV === "preview";

  if (isPreview) {
    const actualRef = projectRef(env.VITE_SUPABASE_URL);
    const expectedRef = String(env.VITE_EXPECTED_SUPABASE_PROJECT_REF || "").trim();
    const siteOrigin = String(env.VITE_SITE_ORIGIN || "").trim();

    if (env.VITE_APP_ENV !== "preview") {
      throw new Error("Preview-сборка требует VITE_APP_ENV=preview.");
    }
    if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY) {
      throw new Error("Preview-сборка требует отдельные URL и публичный ключ Supabase.");
    }
    if (!expectedRef || actualRef !== expectedRef) {
      throw new Error("Preview Supabase не совпадает с VITE_EXPECTED_SUPABASE_PROJECT_REF.");
    }
    if (actualRef === PRODUCTION_SUPABASE_PROJECT_REF) {
      throw new Error("Preview-сборка не может использовать рабочий Supabase.");
    }
    if (!/^https:\/\//i.test(siteOrigin)) {
      throw new Error("Preview-сборка требует HTTPS-адрес VITE_SITE_ORIGIN.");
    }
  }

  return {
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "qazeducation-preview-metadata",
      transformIndexHtml(html) {
        if (!isPreview) return html;
        const origin = String(env.VITE_SITE_ORIGIN).replace(/\/$/, "");
        return html
          .replaceAll("https://qazeducation.kz", origin)
          .replace("</head>", '    <meta name="robots" content="noindex,nofollow,noarchive" />\n  </head>');
      },
      closeBundle() {
        if (!isPreview) return;
        writeFileSync(
          resolve(process.cwd(), "dist/robots.txt"),
          "User-agent: *\nDisallow: /\n",
          "utf8",
        );
      },
    },
  ],

  // Совместимо с локальной проверкой и закрытым preview-контуром.
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
  },

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
  };
});
