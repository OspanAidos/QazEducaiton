import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import { Webhook } from "npm:standardwebhooks@^1";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

function hookError(status: number, message: string) {
  return Response.json(
    {
      error: {
        http_code: status,
        message,
      },
    },
    { status },
  );
}

async function sendTelegramOtp(params: {
  gatewayToken: string;
  phone: string;
  otp: string;
  userId: string;
}) {
  const { gatewayToken, phone, otp, userId } = params;

  try {
    console.log("[telegram-send-otp] Starting Telegram Gateway request", {
      phoneTail: phone.slice(-4),
      otpLength: otp.length,
    });

    const telegramResponse = await fetch(
      "https://gatewayapi.telegram.org/sendVerificationMessage",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${gatewayToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone_number: phone,
          code: otp,
          ttl: 300,
          payload: `qazeducation:${userId}`.slice(0, 128),
        }),
        signal: AbortSignal.timeout(15000),
      },
    );

    const raw = await telegramResponse.text();

    let telegramResult: any = null;
    try {
      telegramResult = raw ? JSON.parse(raw) : null;
    } catch {
      telegramResult = { raw };
    }

    if (!telegramResponse.ok || telegramResult?.ok !== true) {
      console.error("[telegram-send-otp] Telegram Gateway rejected request", {
        status: telegramResponse.status,
        result: telegramResult,
        phoneTail: phone.slice(-4),
      });
      return;
    }

    console.log("[telegram-send-otp] Telegram OTP sent successfully", {
      requestId: telegramResult?.result?.request_id ?? null,
      deliveryStatus:
        telegramResult?.result?.delivery_status?.status ?? null,
      phoneTail: phone.slice(-4),
    });
  } catch (error) {
    console.error("[telegram-send-otp] Telegram Gateway background error", {
      message: error instanceof Error ? error.message : String(error),
      phoneTail: phone.slice(-4),
    });
  }
}

export default {
  fetch: withSupabase({ auth: "none" }, async (req) => {
    if (req.method !== "POST") {
      return hookError(405, "Method not allowed");
    }

    const gatewayToken = Deno.env.get("TELEGRAM_GATEWAY_TOKEN");
    const hookSecretRaw = Deno.env.get("SEND_SMS_HOOK_SECRET");

    if (!gatewayToken) {
      console.error("[telegram-send-otp] TELEGRAM_GATEWAY_TOKEN is missing");
      return hookError(500, "Telegram Gateway token is not configured");
    }

    if (!hookSecretRaw) {
      console.error("[telegram-send-otp] SEND_SMS_HOOK_SECRET is missing");
      return hookError(500, "Send SMS hook secret is not configured");
    }

    const rawBody = await req.text();
    const headers = Object.fromEntries(req.headers.entries());

    console.log("[telegram-send-otp] Hook request received", {
      contentType: req.headers.get("content-type"),
      hasWebhookId: Boolean(req.headers.get("webhook-id")),
      hasWebhookTimestamp: Boolean(req.headers.get("webhook-timestamp")),
      hasWebhookSignature: Boolean(req.headers.get("webhook-signature")),
      bodyLength: rawBody.length,
    });

    let event: any;

    try {
      const hookSecret = hookSecretRaw.replace(/^v1,whsec_/, "");
      const wh = new Webhook(hookSecret);
      event = wh.verify(rawBody, headers);
    } catch (error) {
      console.error("[telegram-send-otp] Invalid Supabase webhook signature", {
        message: error instanceof Error ? error.message : String(error),
      });

      return hookError(
        401,
        "Invalid Send SMS hook signature. Check SEND_SMS_HOOK_SECRET.",
      );
    }

    const phone = String(event?.user?.phone ?? "").trim();
    const otp = String(event?.sms?.otp ?? "").trim();
    const userId = String(event?.user?.id ?? "");

    console.log("[telegram-send-otp] Verified hook payload", {
      hasPhone: Boolean(phone),
      phoneTail: phone ? phone.slice(-4) : null,
      otpLength: otp.length,
      userId,
    });

    if (!phone || !otp) {
      return hookError(
        400,
        "Send SMS hook payload does not contain user.phone or sms.otp",
      );
    }

    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      return hookError(400, "Phone number is not in E.164 format");
    }

    if (!/^\d{4,8}$/.test(otp)) {
      return hookError(400, "OTP must contain 4 to 8 digits");
    }

    // Ключевой момент:
    // Supabase HTTP Auth Hooks должны завершаться максимум за 5 секунд.
    // Telegram Gateway вызываем в background task и СРАЗУ отвечаем Auth Hook 200.
    EdgeRuntime.waitUntil(
      sendTelegramOtp({
        gatewayToken,
        phone,
        otp,
        userId,
      }),
    );

    console.log(
      "[telegram-send-otp] Returning HTTP 200 to Supabase; Gateway request continues in background",
      { phoneTail: phone.slice(-4) },
    );

    return new Response(null, { status: 200 });
  }),
};
