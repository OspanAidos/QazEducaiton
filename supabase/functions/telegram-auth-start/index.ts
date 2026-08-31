import { corsHeaders } from "npm:@supabase/supabase-js@^2/cors";
import { createClient } from "npm:@supabase/supabase-js@^2";

export function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) throw new Error("SUPABASE_URL is missing");

  let key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeysRaw) {
    try {
      const secretKeys = JSON.parse(secretKeysRaw);
      key = secretKeys?.default || key;
    } catch {
      // fallback to legacy service_role
    }
  }

  if (!key) {
    throw new Error("No Supabase server secret key is available");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function randomUrlSafeToken(byteLength = 24) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export function normalizeTelegramPhone(value: unknown) {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");

  if (!digits) return "";

  if (digits.length === 11 && digits.startsWith("8")) {
    return `+7${digits.slice(1)}`;
  }

  if (digits.startsWith("7") && digits.length === 11) {
    return `+${digits}`;
  }

  if (digits.startsWith("998") && digits.length === 12) {
    return `+${digits}`;
  }

  return `+${digits}`;
}

export function isE164(value: string) {
  return /^\+[1-9]\d{7,14}$/.test(value);
}




const LOGIN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomLoginCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let code = "";

  for (const byte of bytes) {
    code += LOGIN_ALPHABET[byte % LOGIN_ALPHABET.length];
  }

  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

const BOT_USERNAME = "QazEducationBot";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
    },
  });
}

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") {
      return json({ ok: true });
    }

    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    try {
      const body = await req.json().catch(() => ({}));
      const lang = body?.lang === "kk" ? "kk" : "ru";

      const token = randomUrlSafeToken(24);
      const tokenHash = await sha256Hex(token);
      const loginCode = randomLoginCode();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      const supabaseAdmin = getAdminClient();

      // лёгкая уборка старых запросов, чтобы таблица не росла бесконечно
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await supabaseAdmin
        .from("telegram_auth_requests")
        .delete()
        .lt("created_at", dayAgo);

      const { error } = await supabaseAdmin
        .from("telegram_auth_requests")
        .insert({
          token_hash: tokenHash,
          login_code: loginCode.replace("-", ""),
          status: "pending",
          lang,
          expires_at: expiresAt,
        });

      if (error) {
        console.error("[telegram-auth-start] insert:", error);
        return json({ error: "Could not create login request" }, 500);
      }

      return json({
        ok: true,
        token,
        login_code: loginCode,
        bot_url: `https://t.me/${BOT_USERNAME}`,
        expires_in: 300,
      });
    } catch (error) {
      console.error("[telegram-auth-start]", error);
      return json({ error: "Internal error" }, 500);
    }
  },
};
