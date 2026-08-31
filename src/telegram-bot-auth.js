import { isSupabaseConfigured, supabase } from "./supabase.js";

const START_FUNCTION = "telegram-auth-start";
const STATUS_FUNCTION = "telegram-auth-status";

export async function startTelegramBotAuth(lang = "ru") {
  if (!isSupabaseConfigured) {
    return {
      ok: false,
      errorCode: "SUPABASE_NOT_CONFIGURED",
      error: new Error("SUPABASE_NOT_CONFIGURED"),
    };
  }

  const { data, error } = await supabase.functions.invoke(START_FUNCTION, {
    body: { lang },
  });

  if (error) {
    console.error("startTelegramBotAuth:", error);
    const status = Number(error?.context?.status || 0);
    return {
      ok: false,
      error,
      errorCode:
        status === 404
          ? "AUTH_FUNCTION_NOT_DEPLOYED"
          : status === 401
            ? "AUTH_FUNCTION_UNAUTHORIZED"
            : "AUTH_FUNCTION_UNAVAILABLE",
    };
  }

  if (!data?.token || !data?.bot_url) {
    return {
      ok: false,
      errorCode: "AUTH_FUNCTION_INVALID_RESPONSE",
      error: new Error("TELEGRAM_AUTH_START_INVALID_RESPONSE"),
    };
  }

  return {
    ok: true,
    token: data.token,
    loginCode: data.login_code,
    botUrl: data.bot_url,
    expiresIn: Number(data.expires_in ?? 300),
  };
}

export async function getTelegramBotAuthStatus(token) {
  const { data, error } = await supabase.functions.invoke(STATUS_FUNCTION, {
    body: { token },
  });

  if (error) {
    console.error("getTelegramBotAuthStatus:", error);
    return { ok: false, error };
  }

  return { ok: true, ...data };
}

export async function finishTelegramBotAuth(tokenHash) {
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });

  if (error) {
    console.error("finishTelegramBotAuth:", error);
    return { ok: false, error };
  }

  return { ok: true, data };
}
