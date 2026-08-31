import { createClient } from "npm:@supabase/supabase-js@^2";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
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

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function verifySignature(rawBody: Uint8Array, signature: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, rawBody);
  const expected = `sha256=${bytesToHex(new Uint8Array(digest))}`;
  return safeEqual(expected, signature);
}

export default {
  fetch: async (req: Request) => {
    if (req.method !== "POST") return json({ ok: false }, 405);

    try {
      const secret = Deno.env.get("APIPAY_WEBHOOK_SECRET") || "";
      if (!secret) throw new Error("APIPAY_WEBHOOK_SECRET is missing");

      const signature = req.headers.get("X-Webhook-Signature") || "";
      const rawBody = new Uint8Array(await req.arrayBuffer());
      if (!(await verifySignature(rawBody, signature, secret))) {
        return json({ ok: false, error: "invalid_signature" }, 401);
      }

      const payload = JSON.parse(new TextDecoder().decode(rawBody));
      const event = String(payload?.event || "");

      if (event === "webhook.test") {
        return json({ ok: true, test: true });
      }

      const invoice = payload?.invoice;
      if (!invoice?.id || !invoice?.status) {
        return json({ ok: true, ignored: true });
      }

      const eventKey = [
        event || "invoice.event",
        invoice.id,
        invoice.status,
        payload?.timestamp || invoice?.paid_at || "current",
      ].join(":");

      const admin = getAdminClient();
      const { data, error } = await admin.rpc("apply_apipay_payment_event", {
        p_event_key: eventKey,
        p_provider_payment_id: String(invoice.id),
        p_external_order_id: String(invoice.external_order_id || ""),
        p_provider_status: String(invoice.status),
        p_paid_at: invoice.paid_at || null,
        p_payload: payload,
      });

      if (error) throw error;
      return json({ ok: true, duplicate: data?.duplicate === true });
    } catch (error) {
      console.error(
        "apipay-webhook:",
        error instanceof Error ? error.message : String(error)
      );
      return json({ ok: false, error: "webhook_processing_failed" }, 500);
    }
  },
};
