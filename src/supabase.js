/**
 * Клиент Supabase. Ключи берутся из переменных окружения Vite:
 *   VITE_SUPABASE_URL              — URL проекта Supabase
 *   VITE_SUPABASE_PUBLISHABLE_KEY  — публичный ключ (publishable / anon)
 *
 * Реальные значения кладутся в файл .env (в репозиторий не коммитится).
 * Шаблон — в .env.example. Anon-ключ публичный по своей природе:
 * доступ к данным ограничивается политиками RLS на стороне Supabase.
 *
 * Если ключи не заданы (сборка превью, SSR-проверка, забытый .env),
 * настоящий клиент не создаётся — вместо него безопасная заглушка,
 * которая не роняет приложение, а на любые действия отвечает понятной
 * ошибкой. Так публичные страницы работают даже без Supabase.
 */
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && publishableKey);

const createConfigurationError = () => {
  const error = new Error(
    "Supabase не настроен: заполните VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY в .env.local"
  );
  error.code = "SUPABASE_NOT_CONFIGURED";
  return error;
};

const notConfigured = () => ({
  data: { session: null, user: null },
  error: createConfigurationError(),
});

/** Заглушка на случай отсутствия ключей: приложение не падает. */
const stub = {
  auth: {
    async getSession() {
      return { data: { session: null }, error: null };
    },
    onAuthStateChange() {
      return { data: { subscription: { unsubscribe() {} } } };
    },
    async signUp() {
      return notConfigured();
    },
    async signInWithPassword() {
      return notConfigured();
    },
    async signInWithOtp() {
      return notConfigured();
    },
    async verifyOtp() {
      return notConfigured();
    },
    async signOut() {
      return { error: null };
    },
    async resetPasswordForEmail() {
      return notConfigured();
    },
    async updateUser() {
      return notConfigured();
    },
  },
  functions: {
    async invoke() {
      return { data: null, error: createConfigurationError() };
    },
  },
  from() {
    return {
      select() {
        return {
          eq() {
            return { maybeSingle: async () => ({ data: null, error: null }) };
          },
        };
      },
    };
  },
};

if (!isSupabaseConfigured) {
  console.warn(
    "Supabase не настроен: восстановите .env.local, заполните VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY, затем перезапустите сайт"
  );
}

export const supabase = isSupabaseConfigured
  ? createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : stub;
