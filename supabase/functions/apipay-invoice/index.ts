import { adminClient, api, rpc, getPayment, syncPayment, publicPayment } from "../_shared/apipay-runtime.ts";
import { money, safeQrImage, safePaymentLink } from "../_shared/apipay-core.js";

const cors = { "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS" };
const json = (body: unknown, status=200) => Response.json(body, {
  status, headers: { ...cors, "Cache-Control": "no-store" } });
const unavailable = "Не удалось проверить платёж. Оплата не потеряна: попробуйте проверить статус позже.";
const catalogItems: Record<string, number> = {
  university_match: 626307,
  competition_fee: 626309,
};
const catalogPrices: Record<string, number> = {
  university_match: 3000,
  competition_fee: 10000,
};

async function summary(db: any, userId: string, type: string, checked = true) {
  const { data: rows, error } = await db.from("payments").select("*")
    .eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw error;
  const eligible = (p: any) => p.status === "paid" && !p.is_sandbox && Number(p.refunded_tenge) === 0;
  const match = rows.find((p: any) => eligible(p) && p.payment_type === "university_match" && p.amount_tenge === 3000);
  const competition = rows.find((p: any) => eligible(p) && p.payment_type === "competition_fee" &&
    (p.amount_tenge === 10000 || (p.amount_tenge === 7000 && rows.some((c: any) =>
      eligible(c) && c.id === p.credit_payment_id && c.user_id === userId &&
      c.payment_type === "university_match" && c.amount_tenge === 3000))));
  const paid = type === "competition_fee" ? competition : competition || match;
  const topupUnavailable = type === "competition_fee" && !competition && !!match;
  const current = rows.find((p: any) => p.provider === "apipay" && p.payment_type === type);
  const pending = rows.find((p: any) => p.provider === "apipay" && p.status === "pending");
  let submission;
  if (competition) submission = await rpc(db,"qz_try_submit_paid_application",{p_user_id:userId});
  return {
    ok:true, ...publicPayment(paid || current), status:paid ? "paid" :
      current?.status === "paid" ? "review_required" : current?.status || "none",
    amount_due: paid ? 0 : type === "university_match" ? 3000 : match ? 7000 : 10000,
    credit_amount: type === "competition_fee" && match ? 3000 : 0,
    package_amount: type === "competition_fee" ? 10000 : 3000,
    submission, status_checked:checked,
    other_pending: !!pending && pending.payment_type !== type,
    other_pending_type: pending?.payment_type || null,
    topup_unavailable:topupUnavailable,
    checkout_enabled:!topupUnavailable && Deno.env.get("APIPAY_PAYMENTS_ENABLED") === "true" &&
      (!(Deno.env.get("APIPAY_CHECKOUT_USER_IDS") || "").trim() ||
        (Deno.env.get("APIPAY_CHECKOUT_USER_IDS") || "").split(",").map(s=>s.trim()).includes(userId)),
  };
}
async function reconcile(db: any, userId: string) {
  // Recover missed callbacks, including a late paid after expired/cancelled.
  const { data: rows, error } = await db.from("payments").select("*")
    .eq("user_id",userId).eq("provider","apipay")
    .order("created_at",{ascending:false}).limit(10);
  if (error) throw error;
  let checked = true;
  // At most three independent invoice lookups at once.
  for (let i = 0; i < (rows || []).length; i += 3) {
    await Promise.all(rows.slice(i, i + 3).map(async (p: any) => {
    const interval = p.status === "pending" ? 5 : 60;
    const claimed = await rpc(db,"qz_claim_payment_poll",{p_payment_id:p.id,p_interval_seconds:interval});
    if (!claimed) return;
    try { await syncPayment(db,p); } catch { checked = false; }
    }));
  }
  return checked;
}
export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") return json({ok:true});
    if (req.method !== "POST") return json({ok:false},405);
    try {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i,"").trim();
      if (!token) return json({ok:false,error:"unauthorized"},401);
      const db = adminClient();
      const { data, error } = await db.auth.getUser(token);
      if (error || !data.user) return json({ok:false,error:"unauthorized"},401);
      const body = await req.json();
      if (!["status","create"].includes(body.action) ||
          !["competition_fee","university_match"].includes(body.payment_type))
        return json({ok:false,message:"Некорректный запрос оплаты"},400);
      const userId=data.user.id, type=body.payment_type;
      const checked = await reconcile(db,userId);
      if (body.action === "status") return json(await summary(db,userId,type,checked));
      if (!checked) return json({ok:false,error:"payment_check_unavailable",message:unavailable},503);
      const allowlist = (Deno.env.get("APIPAY_CHECKOUT_USER_IDS") || "").split(",").map(s=>s.trim()).filter(Boolean);
      if (Deno.env.get("APIPAY_PAYMENTS_ENABLED") !== "true" ||
          (allowlist.length > 0 && !allowlist.includes(userId)))
        return json({ok:false,error:"checkout_disabled",message:"Приём новых платежей пока настраивается."},503);
      const availability=await summary(db,userId,type,checked);
      if (availability.topup_unavailable) return json({
        ...availability,ok:false,error:"topup_unavailable",
        message:"Доплата 7 000 ₸ временно недоступна: для неё ещё не подключена отдельная позиция каталога. Не оплачивайте повторно; обратитесь в поддержку.",
      },409);
      const reservation=await rpc(db,"qz_reserve_apipay_payment",{
        p_user_id:userId,p_payment_type:type,p_sandbox:false,
      });
      if (reservation.already_paid) return json(await summary(db,userId,type,checked));
      if (reservation.other_package) return json({
        ok:false,error:"another_payment_pending",
        message:"У вас уже есть незавершённый платёж другого пакета. Сначала проверьте его статус.",
      },409);
      const payment=reservation.payment;
      if (!reservation.created) return json(await summary(db,userId,type,checked));
      if (payment.amount_tenge !== catalogPrices[type])
        throw new Error("unsupported_catalog_payment");
      // No retries here: a network error may mean Kaspi created the invoice.
      let response;
      try {
        response=await api("/invoices/qr", {
          cart_items:[{catalog_item_id:catalogItems[type],count:1}],
          description:type === "university_match" ? "QazEducation: подбор вуза" :
            "QazEducation: участие в конкурсе и подбор вуза",
          external_order_id:payment.id,
        });
      } catch { return json(await summary(db,userId,type,false)); }
      const invoice=await response.json().catch(()=>null);
      if (!response.ok) {
        // Only definite validation/auth/rate-limit rejections release this attempt.
        if ([400,401,403,404,422,429].includes(response.status)) {
          const {error:writeError}=await db.from("payments").update({
            status:"cancelled",metadata:{...payment.metadata,creation_state:"rejected",
              provider_error:invoice?.error_code || invoice?.error || "invoice_rejected",
              provider_http_status:response.status},
          }).eq("id",payment.id).is("provider_payment_id",null).eq("status","pending");
          if(writeError) throw writeError;
          return json({ok:false,error:"invoice_rejected",
            message:response.status===429 ? "Достигнут лимит ApiPay. Попробуйте позже или обратитесь в поддержку." :
              "ApiPay не создал QR. Обратитесь в поддержку; повторно оплачивать ничего не нужно."},response.status);
        }
        return json(await summary(db,userId,type,false));
      }
      // QrInvoiceCreated omits external_order_id/is_sandbox. It is not a paid proof.
      if (!invoice || !/^[1-9][0-9]*$/.test(String(invoice.id)) ||
          !Number.isSafeInteger(Number(invoice.id)) || money(invoice.amount) !== payment.amount_tenge * 100)
        throw new Error("invalid_qr_creation_response");
      await rpc(db,"qz_attach_apipay_qr",{p_payment_id:payment.id,p_qr:{
        id:invoice.id,amount:invoice.amount,qr_image_url:safeQrImage(invoice.qr_image_url),
        qr_token_url:safePaymentLink(invoice.qr_token_url),qr_expires_at:invoice.qr_expires_at || null,
      }});
      // A concurrently delivered webhook may already have confirmed this payment.
      const fresh=await getPayment(db,payment.id);
      try { await syncPayment(db,fresh); }
      catch { return json(await summary(db,userId,type,false)); }
      return json(await summary(db,userId,type,true));
    } catch (error: any) {
      // Never log provider payloads, tokens, request bodies or user documents.
      console.error("apipay-invoice: request failed",error?.code || error?.name || "error");
      // Our SQL routines use P0001 only for participant-facing validation messages.
      if (error?.code === "P0001" && typeof error.message === "string" && error.message.length <= 240)
        return json({ok:false,error:"checkout_not_allowed",message:error.message},409);
      return json({ok:false,error:"payment_check_failed",message:unavailable},503);
    }
  },
};
