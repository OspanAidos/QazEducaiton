// Runs solely inside an ephemeral PGlite database. Never uses a Supabase URL/key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { snapshotKey } from '../supabase/functions/_shared/apipay-core.js';

const { PGlite } = await import(process.env.QZ_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const read = name => readFile(new URL('../supabase/' + name, import.meta.url), 'utf8');
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
const row = async (table, id) => (await db.query(`select * from public.${table} where id=$1`, [id])).rows[0];
const call = (name, args = [], casts = []) => scalar(`select public.${name}(${args.map((_, i) => '$' + (i + 1) + (casts[i] ? '::' + casts[i] : '')).join(',')}) as value`, args);
const sqlFunction = (text, name) => {
  const start = text.indexOf('create or replace function public.' + name + '(');
  assert.ok(start >= 0, 'fixture function exists: ' + name);
  return text.slice(start, text.indexOf('$$;', start) + 3);
};
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create function public.is_admin() returns boolean language sql stable as $$ select coalesce(current_setting('qz.test_admin',true),'false')='true' $$;
  grant usage on schema auth,public to anon,authenticated,service_role;
`);
await db.exec(await read('schema.sql'));
await db.exec(await read('applications.sql'));
await db.exec((await read('application-wizard.sql')).split('-- 4. Storage')[0]);
await db.exec(`
  alter table public.applications add column resubmitted_at timestamptz, add column terms_accepted_at timestamptz,
    add column terms_version text, add column admin_status_comment text, add column admin_action_type text,
    add column admin_action_at timestamptz, add column revision_requested_at timestamptz,
    add column rejected_at timestamptz, add column decision text;
  alter table public.applications drop constraint applications_status_check;
  create table public.competition_cycles(id integer primary key,status text default 'open',
    payment_available boolean default true, allows_foreign_participants boolean default false,
    applications_open_at timestamptz,applications_close_at timestamptz);
  insert into public.competition_cycles values(2026,'open',true,false,now()-interval '1 day',now()+interval '1 day');
  create table public.application_document_reviews(document_id uuid primary key,status text);
  grant select,insert,update,delete on all tables in schema public to authenticated,service_role;
  grant usage on all sequences in schema public to authenticated,service_role;
`);
await db.exec(await read('payments.sql'));
await db.exec(await read('telegram-notifications.sql'));
await db.exec(sqlFunction(await read('admin-workspace-v1.sql'), 'admin_transition_application'));
await db.exec(sqlFunction(await read('competition-results-v1.sql'), 'guard_competition_submission'));
await db.exec('create trigger guard_submission before update on public.applications for each row execute function public.guard_competition_submission()');
await db.exec('grant select,insert,update,delete on public.payments to authenticated,service_role');
const migration = await read('qr-payments-v2.sql');
const catalogMigration = await read('catalog-qr-v3.sql');
await db.exec(migration);
await db.exec(catalogMigration);

let providerId = 1000;
async function participant({ complete = true, age = 20 } = {}) {
  const u = randomUUID();
  await db.query('insert into auth.users(id) values($1)', [u]);
  await db.query("update public.profiles set first_name='Тест',last_name='Участник',terms_accepted_at=now(),privacy_accepted_at=now() where id=$1", [u]);
  const a = (await db.query('select * from public.applications where user_id=$1', [u])).rows[0];
  const birth = new Date(); birth.setUTCFullYear(birth.getUTCFullYear() - age); birth.setUTCDate(birth.getUTCDate() - 1);
  const data = { birth: birth.toISOString().slice(0, 10), category: 'university', participant_scope: 'kz_citizen', support_type: 'scholarship', motivation: 'Синтетическое тестовое письмо', consent_data: true, consent_terms: true, consent_version: 'test-v1' };
  if (complete) {
    await db.query('update public.applications set data=$1 where id=$2', [data, a.id]);
    for (const kind of age < 18 ? ['birth_certificate', 'guardian_identity', 'guardian_consent', 'performance'] : ['identity', 'performance']) {
      const d = (await db.query('insert into public.application_documents(application_id,user_id,kind,storage_path) values($1,$2,$3,$4) returning id', [a.id, u, kind, 'test/' + u + '/' + kind])).rows[0];
      await db.query("insert into public.application_document_reviews values($1,'accepted')", [d.id]);
    }
  }
  return { u, a: a.id, data };
}
const reserve = (u, type = 'competition_fee') => call('qz_reserve_apipay_payment', [u, type, false]);
async function apply(p, change = {}, key = null) {
  const invoice = { id: p.provider_payment_id ? Number(p.provider_payment_id) : ++providerId,
    external_order_id: p.id, amount: String(p.amount_tenge), status: 'paid', is_sandbox: false,
    total_refunded: '0.00', ...change };
  return call('qz_apply_apipay_snapshot', [p.id, invoice, key || await snapshotKey(invoice), false], ['uuid','jsonb','text','boolean']);
}
async function asUser(u, action) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [u]);
  await db.exec('set role authenticated');
  try { return await action(); }
  finally { await db.exec('reset role'); await db.exec("select set_config('request.jwt.claim.sub','',false)"); }
}

await test('10,000 payment submits a complete application automatically and grants both services', async () => {
  const { u, a } = await participant();
  const r = await reserve(u);
  assert.equal(r.payment.amount_tenge, 10000);
  const result = await apply(r.payment);
  assert.equal(result.submission.submitted, true);
  assert.equal((await row('applications', a)).status, 'submitted');
  assert.equal(await call('qz_has_competition_access', [u]), true);
  const access = await asUser(u, () => call('get_own_payment_access'));
  assert.deepEqual(access, { competition_paid: true, match_paid: true, competition_amount_due: 0 });
  assert.equal((await reserve(u)).already_paid, true);
  assert.equal((await reserve(u, 'university_match')).already_paid, true);
});
await test('3,000 grants only matching; 7,000 top-up is blocked without a catalogue item', async () => {
  const { u, a } = await participant();
  const credit = (await reserve(u, 'university_match')).payment;
  assert.equal(credit.amount_tenge, 3000);
  await apply(credit);
  assert.equal((await row('applications', a)).status, 'draft');
  assert.equal(await call('qz_has_competition_access', [u]), false);
  const access = await asUser(u, () => call('get_own_payment_access'));
  assert.deepEqual(access, { competition_paid: false, match_paid: true, competition_amount_due: 7000 });
  await assert.rejects(() => reserve(u), /Доплата 7 000 ₸ временно недоступна/);
  assert.equal((await row('applications', a)).status, 'draft');
  assert.equal(await scalar('select count(*)::int as value from public.payments where user_id=$1', [u]), 1);
});
await test('repeat create requests and cross-package requests reuse one unresolved reservation', async () => {
  const { u } = await participant();
  const first = await reserve(u);
  const repeat = await reserve(u);
  const other = await reserve(u, 'university_match');
  assert.equal(first.created, true);
  assert.equal(repeat.created, false);
  assert.equal(repeat.payment.id, first.payment.id);
  assert.equal(other.other_package, true);
  assert.equal(await scalar('select count(*)::int as value from public.payments where user_id=$1', [u]), 1);
});
await test('scanned and scan expiry do not count as payment or unlock a new reservation', async () => {
  const { u, a } = await participant();
  const p = (await reserve(u)).payment;
  await apply(p, { status: 'pending', qr_substate: 'scanned', qr_expires_at: '2020-01-01T00:00:00Z' });
  assert.equal((await row('payments', p.id)).status, 'pending');
  assert.equal((await row('applications', a)).status, 'awaiting_payment');
  assert.equal((await reserve(u)).created, false);
});
await test('late paid after cancellation is accepted; stale pending cannot undo paid; duplicates do not resubmit', async () => {
  const { u, a } = await participant();
  const p = (await reserve(u)).payment;
  await apply(p, { status: 'expired' });
  let current = await row('payments', p.id);
  assert.equal(current.status, 'cancelled');
  const invoice = { id: Number(current.provider_payment_id), external_order_id: p.id, amount: '10000', status: 'paid', is_sandbox: false, total_refunded: '0.00' };
  await apply(current, invoice);
  const submittedAt = (await row('applications', a)).submitted_at;
  assert.equal((await apply(current, invoice)).duplicate, true);
  await apply(current, { status: 'pending' });
  assert.equal((await row('payments', p.id)).status, 'paid');
  assert.deepEqual((await row('applications', a)).submitted_at, submittedAt);
  assert.equal(await scalar("select count(*)::int as value from public.notifications where application_id=$1 and event_type='application_submitted'", [a]), 1);
});
await test('wrong amount, order, environment, currency and invoice ID are rejected without poisoning dedup', async () => {
  const { u } = await participant(); const p = (await reserve(u)).payment;
  for (const change of [{ amount: '1' }, { external_order_id: randomUUID() }, { is_sandbox: true }, { currency: 'USD' }, { status: 'unexpected' }, { total_refunded: '10001' }]) {
    await assert.rejects(() => apply(p, change, 'same-test-key'));
    assert.equal((await row('payments', p.id)).status, 'pending');
  }
  await apply(p, {}, 'same-test-key');
  const current = await row('payments', p.id);
  await assert.rejects(() => apply(current, { id: Number(current.provider_payment_id) + 999 }, 'bad-invoice'));
  assert.equal(current.status, 'paid');
});
await test('confirmed money remains recorded if application is incomplete', async () => {
  const { u, a, data } = await participant();
  const p = (await reserve(u)).payment;
  await db.query("update public.applications set data='{}' where id=$1", [a]);
  const result = await apply(p);
  assert.equal(result.status, 'paid');
  assert.equal(result.submission.submitted, false);
  assert.match(result.submission.reason, /дату рождения/);
  assert.equal((await row('applications', a)).status, 'awaiting_payment');
  await db.query('update public.applications set data=$1 where id=$2', [data, a]);
  assert.equal((await call('qz_try_submit_paid_application', [u])).submitted, true);
});
await test('age, minority documents, registration consents, support and closed cycle gates are preserved', async () => {
  for (const age of [13,26]) {
    const { u, a } = await participant({ age });
    await assert.rejects(() => reserve(u), /Возраст участника/);
    assert.equal((await row('applications', a)).status, 'draft');
  }
  const minor = await participant({ age: 16 });
  const minorPayment = (await reserve(minor.u)).payment;
  await db.query("delete from public.application_documents where application_id=$1 and kind='guardian_consent'", [minor.a]);
  assert.match((await apply(minorPayment)).submission.reason, /согласие законного/);
  const noConsent = await participant();
  await db.query('update public.profiles set terms_accepted_at=null where id=$1', [noConsent.u]);
  await assert.rejects(() => reserve(noConsent.u), /подтвердите согласия/);
  const medicine = await participant();
  await db.query('update public.applications set data=$1 where id=$2', [{...medicine.data,support_type:'grant',university:'Тест',specialty:'Медицина'},medicine.a]);
  await assert.rejects(() => reserve(medicine.u), /Медицинские/);
  const close = await participant(); const p = (await reserve(close.u)).payment;
  await db.exec("update public.competition_cycles set status='applications_closed' where id=2026");
  assert.equal((await apply(p)).submission.submitted, false);
  assert.equal((await row('payments',p.id)).status,'paid');
  const fresh = await participant();
  await assert.rejects(() => reserve(fresh.u), /Приём заявок закрыт/);
  await db.exec("update public.competition_cycles set status='open' where id=2026");
});
await test('needs_fixes is not resubmitted by a delayed payment callback; explicit completed revision costs nothing', async () => {
  const { u, a } = await participant(); const p = (await reserve(u)).payment; await apply(p);
  await db.query("update public.applications set status='needs_fixes' where id=$1", [a]);
  assert.equal((await call('qz_try_submit_paid_application', [u])).submitted, false);
  assert.equal((await asUser(u, () => call('submit_own_application_v2'))).submitted, true);
  assert.equal(await scalar('select count(*)::int as value from public.payments where user_id=$1',[u]),1);
});
await test('authenticated callers cannot forge payments/status or call privileged server functions', async () => {
  const { u, a } = await participant(); const p = (await reserve(u)).payment;
  await asUser(u, async () => {
    assert.equal((await call('submit_own_application')).payment_required, true);
    await assert.rejects(() => db.query("update public.payments set status='paid' where id=$1",[p.id]), /permission denied/);
    await assert.rejects(() => db.query("update public.applications set status='submitted' where id=$1",[a]), /permission denied/);
    await assert.rejects(() => call('qz_try_submit_paid_application',[u]), /permission denied/);
    await assert.rejects(() => reserve(u), /permission denied/);
    await assert.rejects(() => apply(p), /permission denied/);
    await db.query('update public.applications set progress=25 where id=$1',[a]);
  });
  assert.equal(await scalar("select has_function_privilege('service_role','public.apply_apipay_payment_event(text,text,text,text,timestamp with time zone,jsonb)','execute') as value"), false);
});
await test('refund facts revoke access without deleting the application or initiating any refund', async () => {
  const { u, a } = await participant(); const p = (await reserve(u)).payment; await apply(p);
  let current=await row('payments',p.id);
  await apply(current,{status:'partially_refunded',total_refunded:'1000.00'});
  assert.equal((await row('payments',p.id)).status,'partially_refunded');
  assert.equal(await call('qz_has_competition_access',[u]),false);
  await apply(current,{status:'paid',total_refunded:'10000.00',is_fully_refunded:true});
  await apply(current,{status:'paid',total_refunded:'0',updated_at:'2020-01-01T00:00:00Z'});
  assert.equal((await row('payments',p.id)).status,'refunded');
  assert.equal((await row('applications',a)).status,'submitted');
});
await test('migration is rerunnable and preserves all existing payments/applications', async () => {
  const counts = await scalar("select jsonb_build_array((select count(*) from public.payments),(select count(*) from public.applications)) as value");
  await db.exec(migration);
  await db.exec(catalogMigration);
  assert.deepEqual(await scalar("select jsonb_build_array((select count(*) from public.payments),(select count(*) from public.applications)) as value"), counts);
});
await test('minimal QR creation response attaches imagery without granting paid access', async () => {
  const {u,a}=await participant(); const p=(await reserve(u)).payment;
  const qr={id:++providerId,amount:'10000.00',qr_token_url:'https://qr.kaspi.kz/test',qr_image_url:'data:image/png;base64,YWJj',qr_expires_at:'2026-09-03T12:05:00Z'};
  await call('qz_attach_apipay_qr',[p.id,qr],['uuid','jsonb']);
  let current=await row('payments',p.id);
  assert.equal(current.status,'pending');
  assert.equal(current.metadata.creation_state,'awaiting_verification');
  assert.equal((await row('applications',a)).status,'awaiting_payment');
  await apply(current);
  await call('qz_attach_apipay_qr',[p.id,qr],['uuid','jsonb']);
  current=await row('payments',p.id);
  assert.equal(current.status,'paid');
  assert.equal(current.metadata.creation_state,'resolved');
  assert.equal(current.metadata.qr_token_url,qr.qr_token_url);
  await asUser(u,()=>assert.rejects(()=>call('qz_attach_apipay_qr',[p.id,qr],['uuid','jsonb']),/permission denied/));
});
await db.close();
