// Shared, dependency-free checks. Never accept payment facts from the browser.
export function money(value) {
  const text = String(value ?? "");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(text)) throw new Error("invalid_amount");
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function validateInvoice(invoice, payment, sandbox = false) {
  if (!invoice || !/^[1-9][0-9]*$/.test(String(invoice.id)) || !Number.isSafeInteger(Number(invoice.id)))
    throw new Error("invalid_invoice");
  if (String(invoice.external_order_id) !== payment.id) throw new Error("order_mismatch");
  if (payment.provider_payment_id && String(invoice.id) !== payment.provider_payment_id)
    throw new Error("invoice_mismatch");
  if (invoice.is_sandbox !== sandbox || payment.is_sandbox !== sandbox)
    throw new Error("payment_environment_mismatch");
  if (money(invoice.amount) !== payment.amount_tenge * 100) throw new Error("amount_mismatch");
  if (invoice.currency != null && invoice.currency !== "KZT") throw new Error("currency_mismatch");
  if (!["processing", "pending", "paid", "cancelled", "expired", "error", "partially_refunded"].includes(invoice.status))
    throw new Error("unknown_invoice_status");
  const refunded = money(invoice.total_refunded ?? 0);
  if (refunded > money(invoice.amount)) throw new Error("invalid_refund_total");
  if (invoice.is_fully_refunded === true && refunded !== money(invoice.amount))
    throw new Error("inconsistent_refund_total");
  if (invoice.status === "partially_refunded" && refunded <= 0)
    throw new Error("missing_refund_total");
  return invoice;
}

export async function hexDigest(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function snapshotKey(invoice) {
  return "snapshot:" + await hexDigest(new TextEncoder().encode(JSON.stringify([
    invoice.id, invoice.status, invoice.amount, invoice.is_sandbox,
    invoice.total_refunded ?? 0, invoice.is_fully_refunded ?? false,
    invoice.qr_substate ?? null, invoice.paid_at ?? null, invoice.updated_at ?? null,
    invoice.qr_image_url ?? null, invoice.qr_token_url ?? null, invoice.qr_expires_at ?? null,
  ])));
}

export async function verifySignature(rawBody, signature, secret) {
  if (!secret || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, rawBody));
  const expected = "sha256=" + Array.from(digest).map(b => b.toString(16).padStart(2, "0")).join("");
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return difference === 0;
}

export function safePaymentLink(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    // ApiPay supplies a Kaspi HTTPS link; never render javascript/data as a link.
    return url.protocol === "https:" && (url.hostname === "kaspi.kz" || url.hostname.endsWith(".kaspi.kz"))
      ? value : null;
  } catch { return null; }
}

export function safeQrImage(value) {
  if (typeof value !== "string") return null;
  if (/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value)) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["apipay.kz", "kaspi.kz"].some(host =>
      url.hostname === host || url.hostname.endsWith("." + host)) ? value : null;
  } catch { return null; }
}
