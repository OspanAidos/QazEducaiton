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
      const { token } = await req.json();

      if (
        typeof token !== "string" ||
        !/^[A-Za-z0-9_-]{20,64}$/.test(token)
      ) {
        return json({ status: "failed", message: "Invalid login token" }, 400);
      }

      const tokenHash = await sha256Hex(token);
      const supabaseAdmin = getAdminClient();

      const { data, error } = await supabaseAdmin
        .from("telegram_auth_requests")
        .select(
          "status,auth_token_hash,expires_at,failure_message,first_time"
        )
        .eq("token_hash", tokenHash)
        .maybeSingle();

      if (error) {
        console.error("[telegram-auth-status] select:", error);
        return json({ status: "failed", message: "Status lookup failed" }, 500);
      }

      if (!data) {
        return json({ status: "expired" });
      }

      if (new Date(data.expires_at).getTime() <= Date.now()) {
        await supabaseAdmin
          .from("telegram_auth_requests")
          .update({ status: "expired" })
          .eq("token_hash", tokenHash)
          .neq("status", "approved");

        return json({ status: "expired" });
      }

      if (data.status === "approved" && data.auth_token_hash) {
        return json({
          status: "approved",
          token_hash: data.auth_token_hash,
          first_time: Boolean(data.first_time),
        });
      }

      if (data.status === "failed") {
        return json({
          status: "failed",
          message: data.failure_message || "Telegram login failed",
        });
      }

      return json({ status: data.status });
    } catch (error) {
      console.error("[telegram-auth-status]", error);
      return json({ status: "failed", message: "Internal error" }, 500);
    }
  },
};
