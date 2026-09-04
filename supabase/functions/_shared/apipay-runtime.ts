import { createClient } from "npm:@supabase/supabase-js@^2";
import { snapshotKey, validateInvoice, safePaymentLink, safeQrImage } from "./apipay-core.js";

export function adminClient() {
  let key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) key = JSON.parse(secretKeys).default || key;
  if (!key || !Deno.env.get("SUPABASE_URL")) throw new Error("server_configuration_missing");
  return createClient(Deno.env.get("SUPABASE_URL")!, key,
    { auth: { autoRefreshToken: false, persistSession: false } });
}
export async function rpc(db: any, name: string, args: any = {}) {
  const result = await db.rpc(name, args);
  if (result.error) throw result.error;
  return result.data;
}
export async function api(path: string, body?: any) {
  const key = Deno.env.get("APIPAY_API_KEY");
  if (!key) throw new Error("apipay_not_configured");
  // Fixed production API host: do not send keys to an arbitrary URL.
  return fetch("https://api.apipay.kz/api/v1" + path, {
    method: body === undefined ? "GET" : "POST",
    redirect: "error",
    headers: { "X-API-Key": key, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(body === undefined ? 3000 : 12000),
  });
}
export async function getPayment(db: any, id: string) {
  const result = await db.from("payments").select("*").eq("id", id).eq("provider", "apipay").maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}
export async function syncPayment(db: any, payment: any, evidence?: any) {
  let invoice;
  if (payment.provider_payment_id) {
    const response = await api("/invoices/" + encodeURIComponent(payment.provider_payment_id));
    if (!response.ok) throw new Error("apipay_status_unavailable");
    invoice = await response.json();
  } else {
    // A POST timeout is ambiguous. Find the SAME external order; never repeat POST blindly.
    const response = await api("/invoices?search=" + encodeURIComponent(payment.id) + "&per_page=100");
    if (!response.ok) throw new Error("apipay_status_unavailable");
    const result = await response.json();
    const matches = (result.data || []).filter((item: any) => item.external_order_id === payment.id);
    if (matches.length === 0) return payment;
    if (matches.length !== 1) throw new Error("duplicate_provider_invoice");
    const detail = await api("/invoices/" + encodeURIComponent(matches[0].id));
    if (!detail.ok) throw new Error("apipay_status_unavailable");
    invoice = await detail.json();
  }
  validateInvoice(invoice, payment, false);
  if (evidence?.status === "paid" && !["paid","partially_refunded"].includes(invoice.status))
    throw new Error("provider_snapshot_not_updated");
  if (Number(evidence?.total_refunded || 0) > Number(invoice.total_refunded || 0))
    throw new Error("provider_snapshot_not_updated");
  // Some GET responses omit the QR substate. A verified signed scan event is
  // safe to retain for presentation; it never changes financial status.
  if (evidence?.qr_substate === "scanned") invoice.qr_substate = "scanned";
  await rpc(db, "qz_apply_apipay_snapshot", {
    p_payment_id: payment.id, p_invoice: invoice,
    p_event_key: await snapshotKey(invoice), p_expected_sandbox: false,
  });
  return await getPayment(db, payment.id);
}
export function publicPayment(p: any) {
  if (!p) return {};
  const verifying = p.metadata?.creation_state === "awaiting_verification";
  return {
    payment_id: p.id, invoice_id: p.provider_payment_id, amount: p.amount_tenge,
    status: p.status, payment_type: p.payment_type,
    qr_image_url: verifying ? null : safeQrImage(p.metadata?.qr_image_url),
    qr_token_url: verifying ? null : safePaymentLink(p.metadata?.qr_token_url),
    qr_expires_at: p.metadata?.qr_expires_at || null,
    qr_substate: p.metadata?.qr_substate || null,
    creation_pending: p.status === "pending" && (!p.provider_payment_id || verifying),
  };
}
