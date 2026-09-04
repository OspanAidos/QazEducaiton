import { adminClient, getPayment, syncPayment } from "../_shared/apipay-runtime.ts";
import { verifySignature } from "../_shared/apipay-core.js";
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
export default {
  fetch: async (req:Request)=>{
    if(req.method!=="POST") return json({ok:false},405);
    try {
      const secret=Deno.env.get("APIPAY_WEBHOOK_SECRET");
      if(!secret) return json({ok:false,error:"not_configured"},503);
      const bytes=new Uint8Array(await req.arrayBuffer());
      if(bytes.length>262144) return json({ok:false},413);
      if(!await verifySignature(bytes,req.headers.get("X-Webhook-Signature")||"",secret))
        return json({ok:false,error:"invalid_signature"},401);
      const event=JSON.parse(new TextDecoder().decode(bytes));
      if(event.event==="webhook.test") return json({ok:true,test:true});
      if(!["invoice.status_changed","invoice.qr_scanned","invoice.refunded"].includes(event.event))
        return json({ok:true,ignored:true});
      const evidence=event.invoice;
      const order=evidence?.external_order_id;
      if(typeof order!=="string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(order))
        return json({ok:true,ignored:true});
      const db=adminClient(), payment=await getPayment(db,order);
      // Other/legacy sites can share an organisation. Never attach their invoices to ours.
      if(!payment) return json({ok:true,ignored:true});
      if(evidence.is_sandbox!==false || payment.is_sandbox!==false)
        return json({ok:true,ignored:true,reason:"sandbox_not_accepted"});
      if(payment.provider_payment_id && String(evidence.id)!==payment.provider_payment_id)
        return json({ok:false,error:"invoice_mismatch"},409);
      // Re-read the invoice with our server key; don't trust out-of-order snapshots.
      await syncPayment(db,{...payment,provider_payment_id:String(evidence.id)},evidence);
      return json({ok:true});
    } catch(error: any) {
      console.error("apipay-webhook: processing failed",error?.code || error?.name || "error");
      return json({ok:false,error:"retry_required"},503);
    }
  },
};
