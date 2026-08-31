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



type TgUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

type TgMessage = {
  message_id: number;
  chat: { id: number; type: string };
  from?: TgUser;
  text?: string;
  contact?: {
    phone_number: string;
    first_name?: string;
    last_name?: string;
    user_id?: number;
  };
};

const BOT_API = "https://api.telegram.org";

function plain(status = 200) {
  return new Response("OK", {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function syntheticEmail(telegramUserId: number) {
  return `tg_${telegramUserId}@auth.qazeducation.kz`;
}

async function telegramApi(
  botToken: string,
  method: string,
  payload: Record<string, unknown>,
) {
  const response = await fetch(`${BOT_API}/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const result = await response.json();

  if (!response.ok || result?.ok !== true) {
    console.error(`[telegram-bot] ${method} failed`, result);
    throw new Error(`Telegram Bot API ${method} failed`);
  }

  return result.result;
}

async function sendText(
  botToken: string,
  chatId: number,
  text: string,
  extra: Record<string, unknown> = {},
) {
  return telegramApi(botToken, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...extra,
  });
}

async function markFailed(
  supabaseAdmin: ReturnType<typeof getAdminClient>,
  requestId: string,
  message: string,
) {
  await supabaseAdmin
    .from("telegram_auth_requests")
    .update({
      status: "failed",
      failure_message: message,
    })
    .eq("id", requestId);
}

async function isStaffAccount(
  supabaseAdmin: ReturnType<typeof getAdminClient>,
  userId: string,
) {
  const [adminRes, commissionRes] = await Promise.all([
    supabaseAdmin
      .from("admin_users")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("commission_members")
      .select("user_id")
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle(),
  ]);

  return Boolean(adminRes.data || commissionRes.data);
}

async function ensureLoginLink(params: {
  supabaseAdmin: ReturnType<typeof getAdminClient>;
  request: any;
  telegramUser: TgUser;
  chatId: number;
  phone?: string;
  existingAuthUserId?: string | null;
  firstTime: boolean;
}) {
  const {
    supabaseAdmin,
    request,
    telegramUser,
    chatId,
    phone,
    existingAuthUserId,
    firstTime,
  } = params;

  let authUserId = existingAuthUserId || "";
  let authEmail = "";
  let authUser: any = null;

  if (authUserId) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(authUserId);

    if (error || !data?.user) {
      console.error("[telegram-bot] mapped auth user missing", error);
      authUserId = "";
    } else {
      authUser = data.user;
      authEmail = authUser.email || "";
    }
  }

  const metadata = {
    ...(authUser?.user_metadata || {}),
    // Telegram-профиль не является источником настоящего ФИО участника.
    // Имя и фамилия сохраняются отдельной серверной RPC после ввода на сайте.
    first_name: authUser?.user_metadata?.first_name || "",
    last_name: authUser?.user_metadata?.last_name || "",
    telegram_first_name: telegramUser.first_name || "",
    telegram_last_name: telegramUser.last_name || "",
    phone: phone || authUser?.phone || authUser?.user_metadata?.phone || "",
    lang:
      request.lang ||
      authUser?.user_metadata?.lang ||
      (telegramUser.language_code === "kk" ? "kk" : "ru"),
    telegram_user_id: String(telegramUser.id),
    telegram_chat_id: String(chatId),
    telegram_username: telegramUser.username || "",
    auth_channel: "telegram_bot",
  };

  // Существующий phone-auth пользователь: добавляем внутренний email,
  // только если email у него отсутствовал. Реальный email не перезаписываем.
  if (authUserId && !authEmail) {
    authEmail = syntheticEmail(telegramUser.id);

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      authUserId,
      {
        email: authEmail,
        email_confirm: true,
        user_metadata: metadata,
      },
    );

    if (error) throw error;
    authUser = data.user;
  } else if (authUserId) {
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      authUserId,
      { user_metadata: metadata },
    );

    if (error) throw error;
    authUser = data.user;
  }

  // Новый пользователь: создаём один Supabase Auth user на один Telegram ID.
  if (!authUserId) {
    authEmail = syntheticEmail(telegramUser.id);

    const createPayload: Record<string, unknown> = {
      email: authEmail,
      email_confirm: true,
      user_metadata: metadata,
    };

    if (phone && isE164(phone)) {
      createPayload.phone = phone;
      createPayload.phone_confirm = true;
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser(
      createPayload as any,
    );

    if (error) {
      // Если предыдущая попытка успела создать user, но не записала mapping,
      // пробуем получить его через magic link по стабильному внутреннему email.
      console.warn("[telegram-bot] createUser failed; fallback to generateLink", error.message);

      const fallback = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: authEmail,
      });

      if (fallback.error || !fallback.data?.user) {
        throw error;
      }

      authUser = fallback.data.user;
      authUserId = fallback.data.user.id;
    } else {
      authUser = data.user;
      authUserId = data.user.id;
    }
  }

  if (!authEmail) {
    authEmail = authUser?.email || syntheticEmail(telegramUser.id);
  }

  // Никогда не связываем Telegram участника со служебным аккаунтом.
  if (await isStaffAccount(supabaseAdmin, authUserId)) {
    throw new Error("STAFF_ACCOUNT_NOT_ALLOWED");
  }

  // Профиль + стабильная связь Telegram -> user UUID.
  const { error: accountError } = await supabaseAdmin
    .from("telegram_accounts")
    .upsert(
      {
        telegram_user_id: telegramUser.id,
        auth_user_id: authUserId,
        telegram_chat_id: chatId,
        username: telegramUser.username || null,
        first_name: telegramUser.first_name || null,
        last_name: telegramUser.last_name || null,
        phone: phone || authUser?.phone || null,
        last_login_at: new Date().toISOString(),
      },
      { onConflict: "telegram_user_id" },
    );

  if (accountError) throw accountError;

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .upsert(
      {
        id: authUserId,
        phone: phone || authUser?.phone || null,
        lang: request.lang || "ru",
        telegram_user_id: telegramUser.id,
        telegram_chat_id: chatId,
        telegram_username: telegramUser.username || null,
        telegram_connected_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

  if (profileError) throw profileError;

  // Supabase создаёт одноразовый token hash, но никакое письмо не отправляется.
  const { data: linkData, error: linkError } =
    await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: authEmail,
    });

  if (linkError || !linkData?.properties?.hashed_token) {
    console.error("[telegram-bot] generateLink:", linkError);
    throw linkError || new Error("MAGIC_LINK_TOKEN_MISSING");
  }

  const { error: requestError } = await supabaseAdmin
    .from("telegram_auth_requests")
    .update({
      status: "approved",
      telegram_user_id: telegramUser.id,
      telegram_chat_id: chatId,
      auth_user_id: authUserId,
      phone: phone || authUser?.phone || null,
      auth_token_hash: linkData.properties.hashed_token,
      first_time: firstTime,
      approved_at: new Date().toISOString(),
      failure_message: null,
    })
    .eq("id", request.id);

  if (requestError) throw requestError;

  return { authUserId };
}

async function continueLoginRequest(
  botToken: string,
  supabaseAdmin: ReturnType<typeof getAdminClient>,
  message: TgMessage,
  request: any,
) {
  const from = message.from;
  if (!from || from.is_bot || message.chat.type !== "private") return;

  if (new Date(request.expires_at).getTime() <= Date.now()) {
    await supabaseAdmin
      .from("telegram_auth_requests")
      .update({ status: "expired" })
      .eq("id", request.id);

    await sendText(
      botToken,
      message.chat.id,
      "Срок действия кода истёк. Вернитесь на сайт QazEducation и создайте новый код входа.",
    );
    return;
  }

  if (request.status === "approved") {
    await sendText(
      botToken,
      message.chat.id,
      "Вход уже подтверждён. Вернитесь на сайт QazEducation.",
    );
    return;
  }

  const { data: account } = await supabaseAdmin
    .from("telegram_accounts")
    .select("auth_user_id,phone")
    .eq("telegram_user_id", from.id)
    .maybeSingle();

  if (account?.auth_user_id) {
    try {
      await ensureLoginLink({
        supabaseAdmin,
        request,
        telegramUser: from,
        chatId: message.chat.id,
        phone: account.phone || undefined,
        existingAuthUserId: account.auth_user_id,
        firstTime: false,
      });

      await sendText(
        botToken,
        message.chat.id,
        "✅ <b>Вход подтверждён.</b>\n\nВернитесь на сайт QazEducation — личный кабинет откроется автоматически.",
        { reply_markup: { remove_keyboard: true } },
      );
    } catch (error) {
      console.error("[telegram-bot] mapped login:", error);
      await markFailed(supabaseAdmin, request.id, "Не удалось подтвердить вход");
      await sendText(
        botToken,
        message.chat.id,
        "Не удалось подтвердить вход. Вернитесь на сайт и попробуйте снова.",
      );
    }
    return;
  }

  await supabaseAdmin
    .from("telegram_auth_requests")
    .update({
      status: "awaiting_contact",
      telegram_user_id: from.id,
      telegram_chat_id: message.chat.id,
    })
    .eq("id", request.id);

  await sendText(
    botToken,
    message.chat.id,
    "Код принят.\n\nДля первой привязки QazEducation нужно один раз подтвердить ваш номер телефона. Нажмите кнопку <b>«Поделиться номером»</b> ниже.",
    {
      reply_markup: {
        keyboard: [
          [
            {
              text: "📱 Поделиться номером",
              request_contact: true,
            },
          ],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    },
  );
}

async function handleStart(
  botToken: string,
  supabaseAdmin: ReturnType<typeof getAdminClient>,
  message: TgMessage,
) {
  const from = message.from;
  if (!from || from.is_bot || message.chat.type !== "private") return;

  // Поддержка старых deep-link ссылок, если они ещё где-то открыты.
  const deepLinkMatch = String(message.text || "").match(
    /^\/start(?:@\w+)?\s+login_([A-Za-z0-9_-]{20,64})$/,
  );

  if (deepLinkMatch) {
    const tokenHash = await sha256Hex(deepLinkMatch[1]);

    const { data: request } = await supabaseAdmin
      .from("telegram_auth_requests")
      .select("*")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (request) {
      await continueLoginRequest(botToken, supabaseAdmin, message, request);
      return;
    }
  }

  await sendText(
    botToken,
    message.chat.id,
    "Здравствуйте! Это официальный бот <b>QazEducation</b>.\n\nНа сайте QazEducation нажмите «Получить код для Telegram», затем отправьте сюда полученный код, например:\n\n<b>ABCD-EFGH</b>",
  );
}

async function handleLoginCode(
  botToken: string,
  supabaseAdmin: ReturnType<typeof getAdminClient>,
  message: TgMessage,
) {
  const from = message.from;
  if (!from || from.is_bot || message.chat.type !== "private") return false;

  const normalized = String(message.text || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(normalized)) {
    return false;
  }

  const { data: request, error } = await supabaseAdmin
    .from("telegram_auth_requests")
    .select("*")
    .eq("login_code", normalized)
    .in("status", ["pending", "awaiting_contact"])
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !request) {
    await sendText(
      botToken,
      message.chat.id,
      "Код не найден или срок его действия истёк. Вернитесь на сайт QazEducation и создайте новый код.",
    );
    return true;
  }

  // Нельзя перехватить уже начатую первым Telegram-пользователем привязку.
  if (
    request.telegram_user_id &&
    Number(request.telegram_user_id) !== Number(from.id)
  ) {
    await sendText(
      botToken,
      message.chat.id,
      "Этот код уже используется для другого входа. Создайте новый код на сайте.",
    );
    return true;
  }

  await continueLoginRequest(botToken, supabaseAdmin, message, request);
  return true;
}

async function handleContact(
  botToken: string,
  supabaseAdmin: ReturnType<typeof getAdminClient>,
  message: TgMessage,
) {
  const from = message.from;
  const contact = message.contact;

  if (!from || !contact || from.is_bot || message.chat.type !== "private") {
    return;
  }

  // request_contact для своего номера должен вернуть user_id владельца.
  if (!contact.user_id || Number(contact.user_id) !== Number(from.id)) {
    await sendText(
      botToken,
      message.chat.id,
      "Пожалуйста, отправьте именно свой номер через кнопку «Поделиться номером». Чужой контакт использовать нельзя.",
    );
    return;
  }

  const phone = normalizeTelegramPhone(contact.phone_number);

  if (!isE164(phone)) {
    await sendText(
      botToken,
      message.chat.id,
      "Не удалось распознать номер телефона. Вернитесь на сайт и попробуйте привязку ещё раз.",
    );
    return;
  }

  const { data: request, error } = await supabaseAdmin
    .from("telegram_auth_requests")
    .select("*")
    .eq("telegram_user_id", from.id)
    .eq("status", "awaiting_contact")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !request) {
    await sendText(
      botToken,
      message.chat.id,
      "Активная заявка на вход не найдена. Вернитесь на сайт QazEducation и начните вход заново.",
      { reply_markup: { remove_keyboard: true } },
    );
    return;
  }

  try {
    // Если этот номер уже использовался в старом Phone Auth,
    // берём тот же auth.users UUID и сохраняем все заявки/данные.
    const { data: existingUserId, error: lookupError } =
      await supabaseAdmin.rpc("find_auth_user_by_phone", {
        p_phone: phone,
      });

    if (lookupError) {
      console.error("[telegram-bot] phone lookup:", lookupError);
    }

    await ensureLoginLink({
      supabaseAdmin,
      request,
      telegramUser: from,
      chatId: message.chat.id,
      phone,
      existingAuthUserId: existingUserId || null,
      firstTime: true,
    });

    await sendText(
      botToken,
      message.chat.id,
      "✅ <b>Telegram успешно привязан к QazEducation.</b>\n\nВернитесь на сайт — личный кабинет откроется автоматически. В дальнейшем номер повторно отправлять не нужно.",
      {
        reply_markup: { remove_keyboard: true },
      },
    );
  } catch (error) {
    console.error("[telegram-bot] contact login:", error);

    const safeMessage =
      error instanceof Error && error.message === "STAFF_ACCOUNT_NOT_ALLOWED"
        ? "Этот номер относится к служебному аккаунту и не может быть привязан как аккаунт участника."
        : "Не удалось завершить привязку Telegram.";

    await markFailed(supabaseAdmin, request.id, safeMessage);

    await sendText(
      botToken,
      message.chat.id,
      `${safeMessage}\n\nВернитесь на сайт и попробуйте снова.`,
      { reply_markup: { remove_keyboard: true } },
    );
  }
}

export default {
  fetch: async (req: Request) => {
    if (req.method !== "POST") return plain(405);

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");

    if (!botToken || !webhookSecret) {
      console.error("[telegram-bot] secrets missing");
      return plain(500);
    }

    const suppliedSecret = req.headers.get(
      "x-telegram-bot-api-secret-token",
    );

    if (suppliedSecret !== webhookSecret) {
      console.warn("[telegram-bot] invalid webhook secret");
      return plain(401);
    }

    try {
      const update = await req.json();
      const message: TgMessage | undefined = update?.message;

      if (!message) return plain(200);

      const supabaseAdmin = getAdminClient();

      if (message.contact) {
        await handleContact(botToken, supabaseAdmin, message);
        return plain(200);
      }

      if (typeof message.text === "string" && message.text.startsWith("/start")) {
        await handleStart(botToken, supabaseAdmin, message);
        return plain(200);
      }

      if (typeof message.text === "string") {
        const handled = await handleLoginCode(
          botToken,
          supabaseAdmin,
          message,
        );

        if (handled) return plain(200);
      }

      return plain(200);
    } catch (error) {
      console.error("[telegram-bot-webhook]", error);
      // 500 позволит Telegram повторить update при временном сбое.
      return plain(500);
    }
  },
};
