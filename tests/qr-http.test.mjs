// Edge handler contract tests. BOTH ApiPay and Supabase are mocked; no live HTTP.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { validateInvoice } from '../supabase/functions/_shared/apipay-core.js';

const originals = { fetch: globalThis.fetch, Deno: globalThis.Deno };
const settings = new Map();
globalThis.Deno = { env: { get: name => settings.get(name) } };
async function handler(name) {
  const bundle = await build({
    entryPoints: [new URL('../supabase/functions/' + name + '/index.ts', import.meta.url).pathname],
    bundle: true, write: false, platform: 'node', format: 'cjs', target: 'node22',
    plugins: [{ name: 'offline-supabase', setup(builder) {
      builder.onResolve({ filter: /^npm:@supabase/ }, () => ({ path: 'mock-db', namespace: 'offline' }));
      builder.onLoad({ filter: /.*/, namespace: 'offline' }, () => ({ contents: 'export const createClient = () => globalThis.__qzMockDb;', loader: 'js' }));
    } }],
  });
  const mod = { exports: {} };
  new Function('module', 'exports', bundle.outputFiles[0].text)(mod, mod.exports);
  return mod.exports.default;
}
const invoiceHandler = await handler('apipay-invoice');
const webhookHandler = await handler('apipay-webhook');
const user = '22222222-2222-4222-8222-222222222222';
const secret = 'local-synthetic-webhook-secret';
const catalogPrices = new Map([[626307, 3000], [626309, 10000]]);

function harness() {
  settings.clear();
  for (const [key, value] of Object.entries({ SUPABASE_URL: 'https://offline.invalid', SUPABASE_SERVICE_ROLE_KEY: 'local-synthetic-service-key', APIPAY_API_KEY: 'local-synthetic-api-key', APIPAY_WEBHOOK_SECRET: secret, APIPAY_PAYMENTS_ENABLED: 'true' })) settings.set(key, value);
  const state = { payments: [], invoices: [], requests: [], applied: [], postMode: 'ok', readFails: false, dbFails: false };
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.maximum = Infinity; this.single = false; }
    select() { return this; }
    eq(key, value) { this.filters.push(row => row[key] === value); return this; }
    is(key, value) { this.filters.push(row => (row[key] ?? null) === value); return this; }
    order() { return this; }
    limit(n) { this.maximum = n; return this; }
    maybeSingle() { this.single = true; return this; }
    update(value) { this.patch = value; return this; }
    then(resolve, reject) {
      try {
        assert.equal(this.table, 'payments');
        const rows = state.payments.filter(row => this.filters.every(fn => fn(row))).slice(0, this.maximum);
        if (this.patch) for (const row of rows) Object.assign(row, this.patch);
        return Promise.resolve({ data: structuredClone(this.single ? rows[0] || null : rows), error: null }).then(resolve, reject);
      } catch (error) { return Promise.reject(error).then(resolve, reject); }
    }
  }
  const db = {
    auth: { getUser: async token => ({ data: { user: token === 'local-user-token' ? { id: user } : null }, error: null }) },
    from: table => new Query(table),
    rpc: async (name, args) => {
      if (state.dbFails) return { error: { code: 'local_db_failure' } };
      const paid = p => p.status === 'paid' && !p.is_sandbox && !Number(p.refunded_tenge);
      let data;
      if (name === 'qz_claim_payment_poll') data = true;
      else if (name === 'qz_try_submit_paid_application') data = { submitted: true, status: 'submitted' };
      else if (name === 'qz_reserve_apipay_payment') {
        assert.equal(args.p_user_id, user);
        const credit = state.payments.find(p => p.user_id === user && p.payment_type === 'university_match' && paid(p));
        const existing = state.payments.find(p => p.user_id === user && p.status === 'pending');
        if (existing) data = { created: false, payment: existing, other_package: existing.payment_type !== args.p_payment_type };
        else {
          const payment = { id: randomUUID(), user_id: user, payment_type: args.p_payment_type, amount_tenge: args.p_payment_type === 'university_match' ? 3000 : credit ? 7000 : 10000,
            credit_payment_id: credit?.id || null, provider: 'apipay', provider_payment_id: null, status: 'pending', metadata: { creation_state: 'creating' }, is_sandbox: false, refunded_tenge: 0 };
          state.payments.unshift(payment);
          data = { created: true, payment };
        }
      } else if (name === 'qz_attach_apipay_qr') {
        const p = state.payments.find(p => p.id === args.p_payment_id);
        assert.equal(Number(args.p_qr.amount),p.amount_tenge);
        Object.assign(p,{ provider_payment_id:String(args.p_qr.id),metadata:{ ...p.metadata,...args.p_qr,creation_state:'awaiting_verification' } });
        data = null;
      } else if (name === 'qz_apply_apipay_snapshot') {
        const p = state.payments.find(p => p.id === args.p_payment_id);
        validateInvoice(args.p_invoice, p, false);
        state.applied.push(args);
        Object.assign(p, { status: args.p_invoice.status, provider_payment_id: String(args.p_invoice.id), metadata: { ...p.metadata, ...args.p_invoice, creation_state:'resolved' } });
        data = { ok: true };
      } else throw new Error('Unexpected offline RPC: ' + name);
      return { data: structuredClone(data), error: null };
    },
  };
  globalThis.__qzMockDb = db;
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://api.apipay.kz');
    assert.equal(options.headers['X-API-Key'], 'local-synthetic-api-key');
    assert.equal(options.redirect, 'error');
    state.requests.push({ url: String(url), method: options.method, body: options.body ? JSON.parse(options.body) : null });
    if (options.method === 'POST') {
      assert.equal(parsed.pathname, '/api/v1/invoices/qr');
      if (state.postMode === 'reject') return Response.json({ error: 'tariff_limit_reached' }, { status: 429 });
      if (state.postMode === 'lost-no-invoice') throw new Error('offline-timeout');
      const body = JSON.parse(options.body);
      assert.equal(body.cart_items?.length, 1);
      assert.equal(body.cart_items[0].count, 1);
      const catalogAmount = catalogPrices.get(body.cart_items[0].catalog_item_id);
      assert.ok(catalogAmount, 'known ApiPay catalogue item');
      const invoice = { id: 100 + state.invoices.length, external_order_id: body.external_order_id,
        amount: String(catalogAmount), status: 'pending', is_sandbox: false, total_refunded: '0.00',
        qr_image_url: 'data:image/png;base64,YWJj', qr_token_url: 'https://pay.kaspi.kz/pay/TEST', qr_expires_at: '2026-09-03T12:05:00Z' };
      state.invoices.push(invoice);
      if (state.postMode === 'lost') throw new Error('offline-timeout-after-create');
      // Exact documented POST shape: order ID and environment are only in GET.
      const { external_order_id, is_sandbox, total_refunded, ...qrResponse } = invoice;
      return Response.json(qrResponse, { status: 201 });
    }
    if (state.readFails) return Response.json({ error: 'offline-provider-error' }, { status: 503 });
    if (parsed.pathname === '/api/v1/invoices') return Response.json({ data: state.invoices.filter(i => i.external_order_id === parsed.searchParams.get('search')) });
    const id = parsed.pathname.split('/').at(-1);
    const found = state.invoices.find(i => String(i.id) === id);
    return found ? Response.json(found) : Response.json({}, { status: 404 });
  };
  return state;
}
const request = (body = {}, token = 'local-user-token') => invoiceHandler.fetch(new Request('https://offline.invalid/apipay-invoice', {
  method: 'POST', headers: token ? { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } : {},
  body: JSON.stringify({ action: 'create', payment_type: 'competition_fee', ...body }),
}));
const eventRequest = async (event, signatureOverride) => {
  const raw = JSON.stringify(event);
  const signature = signatureOverride ?? 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
  return webhookHandler.fetch(new Request('https://offline.invalid/apipay-webhook', { method: 'POST', headers: { 'X-Webhook-Signature': signature }, body: raw }));
};

await test('checkout requires valid authentication and is disabled by default/allowlist', async () => {
  const s = harness();
  assert.equal((await request({}, '')).status, 401);
  assert.equal((await request({}, 'invalid')).status, 401);
  settings.delete('APIPAY_PAYMENTS_ENABLED');
  assert.equal((await request()).status, 503);
  settings.set('APIPAY_PAYMENTS_ENABLED', 'true'); settings.set('APIPAY_CHECKOUT_USER_IDS', randomUUID());
  assert.equal((await request()).status, 503);
  assert.equal(s.requests.length, 0);
});
await test('client-supplied prices, identity, invoice IDs and paid status are ignored', async () => {
  const s = harness();
  const response = await request({ amount: 1, user_id: randomUUID(), external_order_id: 'attacker', status: 'paid', is_sandbox: true });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status, 'pending');
  assert.deepEqual(s.requests[0].body.cart_items, [{ catalog_item_id: 626309, count: 1 }]);
  assert.equal('amount' in s.requests[0].body, false);
  assert.equal(s.requests[0].body.external_order_id, s.payments[0].id);
  assert.equal(s.payments[0].user_id, user);
  assert.equal(Object.keys(s.requests[0].body).sort().join(','), 'cart_items,description,external_order_id');
});
await test('university matching uses only the approved 3,000 catalogue item', async () => {
  const s = harness();
  const response = await request({ payment_type: 'university_match' });
  assert.equal(response.status, 200);
  assert.deepEqual(s.requests[0].body.cart_items, [{ catalog_item_id: 626307, count: 1 }]);
  assert.equal(s.payments[0].amount_tenge, 3000);
});
await test('7,000 top-up is blocked until an approved catalogue item exists', async () => {
  const s = harness();
  s.payments.push({ id: randomUUID(), user_id: user, payment_type: 'university_match', amount_tenge: 3000, status: 'paid', is_sandbox: false, refunded_tenge: 0, provider: 'verified-legacy' });
  const status = await (await request({ action: 'status' })).json();
  assert.equal(status.topup_unavailable, true);
  assert.equal(status.checkout_enabled, false);
  const response = await request();
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, 'topup_unavailable');
  const posts = s.requests.filter(r => r.method === 'POST');
  assert.equal(posts.length, 0);
});
await test('ambiguous POST timeout reconciles the same invoice instead of retrying creation', async () => {
  const s = harness(); s.postMode = 'lost';
  assert.equal((await (await request()).json()).creation_pending, true);
  const recovered = await (await request()).json();
  assert.equal(recovered.invoice_id, '100');
  assert.equal(s.requests.filter(r => r.method === 'POST').length, 1);
});
await test('an unlocated timed-out POST stays unresolved and cannot trigger duplicate payment', async () => {
  const s = harness(); s.postMode = 'lost-no-invoice';
  await request(); await request();
  assert.equal(s.requests.filter(r => r.method === 'POST').length, 1);
  assert.equal(s.payments[0].status, 'pending');
});
await test('definite provider rejection is shown without pretending payment succeeded', async () => {
  const s = harness(); s.postMode = 'reject';
  const result = await request();
  assert.equal(result.status, 429);
  assert.equal(s.payments[0].status, 'cancelled');
  assert.equal(s.applied.length, 0);
});
await test('webhook.test and invalid signatures never change payment data', async () => {
  const s = harness();
  assert.equal((await eventRequest({ event: 'webhook.test' })).status, 200);
  assert.equal((await eventRequest({ event: 'webhook.test' }, 'sha256=wrong')).status, 401);
  assert.equal(s.requests.length, 0);
  assert.equal(s.applied.length, 0);
});
await test('webhook rereads the canonical invoice before recording paid', async () => {
  const s = harness(); await request(); s.applied.length = 0;
  assert.equal((await eventRequest({ event:'invoice.qr_scanned',invoice:{...s.invoices[0],qr_substate:'scanned'} })).status,200);
  assert.equal(s.payments[0].status,'pending');
  assert.equal(s.payments[0].metadata.qr_substate,'scanned');
  s.applied.length=0;
  s.invoices[0].status = 'paid';
  const response = await eventRequest({ event: 'invoice.status_changed', invoice: { ...s.invoices[0] } });
  assert.equal(response.status, 200);
  assert.equal(s.applied.length, 1);
  assert.equal(s.payments[0].status, 'paid');
  assert.equal((await (await request({ action: 'status' })).json()).submission.submitted, true);
});
await test('provider/DB failures receive retryable errors, not a false acknowledgement', async () => {
  const s = harness(); await request(); s.applied.length = 0; s.readFails = true;
  const event = { event: 'invoice.status_changed', invoice: { ...s.invoices[0], status: 'paid' } };
  assert.equal((await eventRequest(event)).status, 503);
  assert.equal(s.applied.length, 0);
  s.readFails = false; s.dbFails = true; s.invoices[0].status = 'paid';
  assert.equal((await eventRequest(event)).status, 503);
  assert.equal(s.payments[0].status, 'pending');
});
await test('foreign orders, test invoices and mismatched IDs do not grant access', async () => {
  const s = harness(); await request(); s.applied.length = 0;
  const event = { event: 'invoice.status_changed', invoice: { ...s.invoices[0], status: 'paid' } };
  assert.equal((await eventRequest({ ...event, invoice: { ...event.invoice, external_order_id: randomUUID() } })).status, 200);
  assert.equal((await eventRequest({ ...event, invoice: { ...event.invoice, is_sandbox: true } })).status, 200);
  assert.equal((await eventRequest({ ...event, invoice: { ...event.invoice, id: 999 } })).status, 409);
  assert.equal(s.applied.length, 0);
});
globalThis.fetch = originals.fetch;
globalThis.Deno = originals.Deno;
delete globalThis.__qzMockDb;
