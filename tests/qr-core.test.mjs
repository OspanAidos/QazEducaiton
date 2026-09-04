import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { money, validateInvoice, snapshotKey, verifySignature, safePaymentLink, safeQrImage } from '../supabase/functions/_shared/apipay-core.js';
import { isCompetitionPaid, paymentLabel } from '../src/admin-domain.js';

const p = { id: '11111111-1111-4111-8111-111111111111', amount_tenge: 10000, is_sandbox: false, provider_payment_id: '42' };
const invoice = { id: 42, external_order_id: p.id, amount: '10000.00', status: 'paid', is_sandbox: false, total_refunded: '0.00' };
test('amounts are exact, not rounded or parsed permissively', () => {
  assert.equal(money('10000.00'), 1000000);
  assert.equal(money('0.01'), 1);
  for (const bad of ['1e4', '-10000', '10000abc', '10,000', '10000.001', null]) assert.throws(() => money(bad));
});
test('invoice facts must match the server reservation', () => {
  assert.equal(validateInvoice(invoice, p), invoice);
  for (const change of [{ id: 43 }, { id: '4e1' }, { external_order_id: 'someone-else' }, { amount: 1 }, { is_sandbox: true }, { currency: 'USD' }, { status: 'refunded' }, { total_refunded: '10001' }, { is_fully_refunded: true }, { status: 'partially_refunded' }]) {
    assert.throws(() => validateInvoice({ ...invoice, ...change }, p));
  }
  assert.doesNotThrow(() => validateInvoice({ ...invoice, status: 'partially_refunded', total_refunded: '500.00' }, p));
  assert.doesNotThrow(() => validateInvoice({ ...invoice, total_refunded: '10000.00', is_fully_refunded: true }, p));
});
test('signature verifies exact raw bytes and rejects forged/changed payload', async () => {
  const raw = new TextEncoder().encode('{ "event": "webhook.test" }');
  const signature = 'sha256=' + createHmac('sha256', 'synthetic-test-secret').update(raw).digest('hex');
  assert.equal(await verifySignature(raw, signature, 'synthetic-test-secret'), true);
  assert.equal(await verifySignature(raw, signature, 'wrong-secret'), false);
  assert.equal(await verifySignature(new TextEncoder().encode('{"event":"webhook.test"}'), signature, 'synthetic-test-secret'), false);
  assert.equal(await verifySignature(raw, 'sha256=123', 'synthetic-test-secret'), false);
});
test('canonical event identity is stable, but changed QR metadata is not lost', async () => {
  assert.equal(await snapshotKey(invoice), await snapshotKey({ ...invoice, ignored: 'unused' }));
  assert.notEqual(await snapshotKey(invoice), await snapshotKey({ ...invoice, qr_image_url: 'https://api.apipay.kz/example.png' }));
  assert.notEqual(await snapshotKey(invoice), await snapshotKey({ ...invoice, total_refunded: '1.00' }));
});
test('QR links cannot execute script or point at an unrelated domain', () => {
  assert.equal(safePaymentLink('https://pay.kaspi.kz/pay/ABC'), 'https://pay.kaspi.kz/pay/ABC');
  for (const value of ['javascript:alert(1)', 'data:text/html,hi', 'https://kaspi.kz.evil.test', 'http://kaspi.kz', '//kaspi.kz']) assert.equal(safePaymentLink(value), null);
  assert.equal(safeQrImage('data:image/png;base64,YWJj'), 'data:image/png;base64,YWJj');
  assert.equal(safeQrImage('data:image/svg+xml,evil'), null);
});
test('admin eligibility and labels understand 3000+7000 without accepting standalone 7000', () => {
  const credit = { id: 'credit', user_id: 'u1', payment_type: 'university_match', amount_tenge: 3000, status: 'paid', refunded_tenge: 0, is_sandbox: false };
  const topup = { id: 'topup', user_id: 'u1', payment_type: 'competition_fee', amount_tenge: 7000, status: 'paid', credit_payment_id: 'credit', refunded_tenge: 0, is_sandbox: false };
  const row = { payments: [credit, topup] };
  assert.equal(isCompetitionPaid(row), true);
  assert.match(paymentLabel(row), /3 000 ₸ зачтено/);
  assert.equal(isCompetitionPaid({ payments: [topup] }), false);
  assert.equal(isCompetitionPaid({ payments: [{ ...credit, user_id: 'someone-else' }, topup] }), false);
  assert.equal(isCompetitionPaid({ payments: [{ ...credit, refunded_tenge: 1 }, topup] }), false);
  assert.equal(isCompetitionPaid({ payments: [{ ...topup, amount_tenge: 10000, credit_payment_id: null }] }), true);
  assert.equal(isCompetitionPaid({ payments: [{ ...topup, amount_tenge: 10000, is_sandbox: true }] }), false);
});
