const viteEnv = import.meta.env || {};

export const PRODUCTION_SUPABASE_PROJECT_REF = "fdoduxdwkgnldrzzxovu";

export function normalizeOrigin(value, fallback = "https://qazeducation.kz") {
  try {
    const url = new URL(String(value || fallback));
    return `${url.protocol}//${url.host}`;
  } catch {
    return fallback;
  }
}

export function supabaseProjectRef(value) {
  try {
    const hostname = new URL(String(value || "")).hostname.toLowerCase();
    return hostname.endsWith(".supabase.co")
      ? hostname.slice(0, -".supabase.co".length)
      : "";
  } catch {
    return "";
  }
}

export function validateSupabaseBinding({
  url,
  publishableKey,
  environment = "production",
  expectedProjectRef = "",
} = {}) {
  const normalizedEnvironment = environment === "preview" ? "preview" : "production";
  const cleanUrl = String(url || "").trim();
  const cleanKey = String(publishableKey || "").trim();
  const actualProjectRef = supabaseProjectRef(cleanUrl);
  const expected = String(expectedProjectRef || "").trim();

  if (!cleanUrl && !cleanKey) {
    return { configured: false, issue: "", actualProjectRef };
  }

  if (!cleanUrl || !cleanKey) {
    return {
      configured: false,
      issue: "Укажите одновременно URL и публичный ключ Supabase.",
      actualProjectRef,
    };
  }

  if (
    normalizedEnvironment === "preview" &&
    actualProjectRef === PRODUCTION_SUPABASE_PROJECT_REF
  ) {
    return {
      configured: false,
      issue: "Preview-сборка заблокирована: она не может использовать рабочий Supabase.",
      actualProjectRef,
    };
  }

  if (expected && actualProjectRef !== expected) {
    return {
      configured: false,
      issue: "Supabase не соответствует ожидаемому проекту этой среды.",
      actualProjectRef,
    };
  }

  return { configured: true, issue: "", actualProjectRef };
}

export const appEnvironment =
  viteEnv.VITE_APP_ENV === "preview" ? "preview" : "production";
export const isPreviewEnvironment = appEnvironment === "preview";
export const siteOrigin = normalizeOrigin(
  viteEnv.VITE_SITE_ORIGIN,
  isPreviewEnvironment && typeof window !== "undefined"
    ? window.location.origin
    : "https://qazeducation.kz"
);

