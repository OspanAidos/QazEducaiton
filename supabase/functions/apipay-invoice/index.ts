import { createClient } from "npm:@supabase/supabase-js@^2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APIPAY_BASE_URL =
  Deno.env.get("APIPAY_BASE_URL") || "https://api.apipay.kz/api/v1";
const COMPETITION_FEE = 10_000;
const UNIVERSITY_MATCH_FEE = 3_000;

type PaymentRow = {
  id: string;
  user_id: string;
  payment_type: "competition_fee" | "university_match";
  amount_tenge: number;
  status: string;
  provider: string | null;
  provider_payment_id: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { ...corsHeaders, "Cache-Control": "no-store" },
  });
}

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) throw new Error("SUPABASE_URL is missing");

  let key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeysRaw) {
    try {
      key = JSON.parse(secretKeysRaw)?.default || key;
    } catch {
      // fallback to legacy service_role
    }
  }

  if (!key) throw new Error("No Supabase server secret key is available");

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function publicPayment(payment: PaymentRow | null) {
  if (!payment) return { status: "none" };
  const metadata = payment.metadata || {};
  return {
    payment_id: payment.id,
    invoice_id: payment.provider_payment_id,
    status: payment.status,
    amount: payment.amount_tenge,
    created_at: payment.created_at,
    payment_mode: metadata.payment_mode || "qr",
    provider_status: metadata.apipay_status || payment.status,
    qr_image_url: metadata.qr_image_url || undefined,
    qr_token_url: metadata.qr_token_url || undefined,
    qr_expires_at: metadata.qr_expires_at || undefined,
    qr_substate: metadata.qr_substate || undefined,
  };
}

function qrExpired(payment: PaymentRow | null) {
  const value = payment?.metadata?.qr_expires_at;
  if (!value) return false;
  const expiresAt = new Date(String(value)).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

async function latestPayment(
  admin: ReturnType<typeof getAdminClient>,
  userId: string,
  paymentType: "competition_fee" | "university_match"
) {
  const { data: paid, error: paidError } = await admin
    .from("payments")
    .select("id,user_id,payment_type,amount_tenge,status,provider,provider_payment_id,created_at,metadata")
    .eq("user_id", userId)
    .eq("payment_type", paymentType)
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (paidError) throw paidError;
  if (paid) return paid as PaymentRow;

  const { data, error } = await admin
    .from("payments")
    .select("id,user_id,payment_type,amount_tenge,status,provider,provider_payment_id,created_at,metadata")
    .eq("user_id", userId)
    .eq("payment_type", paymentType)
    .eq("provider", "apipay")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as PaymentRow | null;
}

async function apiRequest(path: string, init?: RequestInit) {
  const apiKey = Deno.env.get("APIPAY_API_KEY");
  if (!apiKey) throw new Error("APIPAY_API_KEY is missing");

  const headers = new Headers(init?.headers);
  headers.set("X-API-Key", apiKey);
  headers.set("Content-Type", "application/json");

  return fetch(`${APIPAY_BASE_URL}${path}`, {
    ...init,
    headers,
  });
}

async function syncInvoice(
  admin: ReturnType<typeof getAdminClient>,
  payment: PaymentRow
) {
  const invoiceId = String(payment.provider_payment_id || "");
  if (!invoiceId) return payment;

  const response = await apiRequest(`/invoices/${encodeURIComponent(invoiceId)}`);
  if (!response.ok) return payment;

  const invoice = await response.json();
  const eventKey = [
    "poll",
    invoice.id,
    invoice.status,
    invoice.updated_at || invoice.paid_at || "current",
  ].join(":");

  const { data, error } = await admin.rpc("apply_apipay_payment_event", {
    p_event_key: eventKey,
    p_provider_payment_id: String(invoice.id),
    p_external_order_id: String(invoice.external_order_id || payment.id || ""),
    p_provider_status: String(invoice.status || "pending"),
    p_paid_at: invoice.paid_at || null,
    p_payload: invoice,
  });

  if (error) throw error;

  const metadata = {
    ...(payment.metadata || {}),
    apipay_status: invoice.status || "pending",
    qr_image_url: invoice.qr_image_url || payment.metadata?.qr_image_url || null,
    qr_token_url: invoice.qr_token_url || payment.metadata?.qr_token_url || null,
    qr_expires_at: invoice.qr_expires_at || payment.metadata?.qr_expires_at || null,
    qr_substate: invoice.qr_substate || payment.metadata?.qr_substate || null,
  };

  await admin
    .from("payments")
    .update({ metadata })
    .eq("id", payment.id);

  return {
    ...payment,
    status: data?.status || payment.status,
    provider_payment_id: String(invoice.id),
    metadata,
  };
}

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") return json({ ok: true });
    if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

    try {
      const authorization = req.headers.get("Authorization") || "";
      const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
      if (!accessToken) return json({ ok: false, error: "unauthorized" }, 401);

      const admin = getAdminClient();
      const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
      const user = userData?.user;
      if (userError || !user) return json({ ok: false, error: "unauthorized" }, 401);

      const body = await req.json().catch(() => ({}));
      const action = body?.action === "status" ? "status" : "create";
      const paymentType = body?.payment_type === "university_match"
        ? "university_match"
        : "competition_fee";
      const amount = paymentType === "university_match"
        ? UNIVERSITY_MATCH_FEE
        : COMPETITION_FEE;

      let payment = await latestPayment(admin, user.id, paymentType);
      if (payment?.status === "pending" && payment.provider_payment_id) {
        payment = await syncInvoice(admin, payment);
      }

      if (payment?.status === "pending" && qrExpired(payment)) {
        const expiredMetadata = {
          ...(payment.metadata || {}),
          apipay_status: "expired",
          status_reason: "qr_expired",
        };
        const { data: expiredPayment, error: expireError } = await admin
          .from("payments")
          .update({ status: "cancelled", metadata: expiredMetadata })
          .eq("id", payment.id)
          .eq("status", "pending")
          .select("id,user_id,payment_type,amount_tenge,status,provider,provider_payment_id,created_at,metadata")
          .maybeSingle();

        if (expireError) throw expireError;
        if (expiredPayment) payment = expiredPayment as PaymentRow;
      }

      if (action === "status") {
        return json({ ok: true, ...publicPayment(payment) });
      }

      if (
        payment?.status === "paid" ||
        (payment?.status === "pending" && payment.provider_payment_id)
      ) {
        return json({ ok: true, ...publicPayment(payment) });
      }

      const { data: application, error: appError } = await admin
        .from("applications")
        .select("id,number,status")
        .eq("user_id", user.id)
        .maybeSingle();

      if (appError) throw appError;
      if (paymentType === "competition_fee" && !application) {
        return json({ ok: false, error: "application_not_found" }, 404);
      }

      let createdPayment = payment?.status === "pending" && !payment.provider_payment_id
        ? payment
        : null;

      if (!createdPayment) {
        const { data, error: insertError } = await admin
          .from("payments")
          .insert({
            user_id: user.id,
            payment_type: paymentType,
            amount_tenge: amount,
            status: "pending",
            provider: "apipay",
            metadata: {
              application_id: application?.id || null,
              application_number: application?.number || null,
              payment_mode: "qr",
              qr_creation_started_at: new Date().toISOString(),
            },
          })
          .select("id,user_id,payment_type,amount_tenge,status,provider,provider_payment_id,created_at,metadata")
          .single();

        if (insertError) throw insertError;
        createdPayment = data as PaymentRow;
      }

      const apiResponse = await apiRequest("/invoices/qr", {
        method: "POST",
        body: JSON.stringify({
          amount,
          description: paymentType === "university_match"
            ? "QazEducation — подбор вуза"
            : `QazEducation — заявка ${application?.number || "участника"}`,
          external_order_id: createdPayment.id,
        }),
      });

      const apiBody = await apiResponse.json().catch(() => ({}));

      if (!apiResponse.ok || !apiBody?.id || !apiBody?.qr_image_url) {
        await admin
          .from("payments")
          .update({
            status: "cancelled",
            metadata: {
              ...(createdPayment.metadata || {}),
              apipay_error: apiBody,
              apipay_http_status: apiResponse.status,
            },
          })
          .eq("id", createdPayment.id);

        return json(
          {
            ok: false,
            error: apiBody?.error || apiBody?.code || "invoice_create_failed",
            message: apiBody?.message || "ApiPay не создал Kaspi QR. Попробуйте ещё раз.",
          },
          apiResponse.status >= 400 && apiResponse.status < 500 ? apiResponse.status : 502
        );
      }

      const { data: updatedPayment, error: updateError } = await admin
        .from("payments")
        .update({
          provider_payment_id: String(apiBody.id),
          metadata: {
            ...(createdPayment.metadata || {}),
            apipay_status: apiBody.status || "processing",
            payment_mode: "qr",
            qr_image_url: apiBody.qr_image_url,
            qr_token_url: apiBody.qr_token_url || null,
            qr_expires_at: apiBody.qr_expires_at || null,
            qr_substate: apiBody.qr_substate || null,
          },
        })
        .eq("id", createdPayment.id)
        .select("id,user_id,payment_type,amount_tenge,status,provider,provider_payment_id,created_at,metadata")
        .single();

      if (updateError) throw updateError;

      if (paymentType === "competition_fee" && application?.id) {
        await admin
          .from("applications")
          .update({ status: "awaiting_payment" })
          .eq("id", application.id)
          .in("status", ["draft", "awaiting_payment", "ready_to_submit"]);
      }

      return json({ ok: true, ...publicPayment(updatedPayment) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const configurationError = message.includes("APIPAY_API_KEY");
      console.error("apipay-invoice:", message);
      return json(
        {
          ok: false,
          error: configurationError ? "apipay_not_configured" : "internal_error",
          message: configurationError
            ? "Онлайн-оплата пока настраивается. Попробуйте позже."
            : "Не удалось обработать платёж. Попробуйте позже.",
        },
        configurationError ? 503 : 500
      );
    }
  },
};
