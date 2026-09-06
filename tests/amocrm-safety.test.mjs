import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("../supabase/amocrm-integration-v2.sql", import.meta.url), "utf8");
const autoSql = await readFile(new URL("../supabase/amocrm-auto-sync-v3.sql", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/amocrm-sync/index.ts", import.meta.url), "utf8");
const config = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");
const panel = await readFile(new URL("../src/components/AmoCrmPanel.jsx", import.meta.url), "utf8");

test("database allows one CRM job per application and one stored amo lead id", () => {
  assert.match(sql, /application_id uuid primary key/i);
  assert.match(sql, /unique index[\s\S]*amo_lead_id/i);
  assert.match(sql, /on conflict \(application_id\) do update/i);
});

test("parallel creation is protected by a lease", () => {
  assert.match(sql, /for update/i);
  assert.match(sql, /already_processing/i);
  assert.match(edge, /crm_claim_sync/);
});

test("external recovery searches exact UUID before POSTing a lead", () => {
  const searchAt = edge.indexOf('searchExact("leads"');
  const createAt = edge.indexOf('amoRequest("\/api\/v4\/leads"');
  assert.ok(searchAt > 0 && createAt > searchAt);
  assert.match(edge, /crm_mark_create_attempt/);
  assert.match(edge, /RECOVERY_WAIT/);
});

test("edge function requires JWT and does not use no-verify-jwt", () => {
  assert.match(config, /\[functions\.amocrm-sync\]\s+verify_jwt = true/);
  assert.match(edge, /admin_required/);
  assert.match(edge, /auth\.getUser/);
});

test("long-lived token is gated by AMO_SYNC_ENABLED", () => {
  assert.match(edge, /AMO_LONG_LIVED_TOKEN/);
  assert.match(edge, /AMO_SYNC_ENABLED/);
  assert.doesNotMatch(edge, /AMO_CLIENT_SECRET|refresh_token|authorization_code/);
});

test("pipeline mapping is fixed on the server and hidden from admin UI", () => {
  assert.match(edge, /Этапы QazEducation зафиксированы на сервере/);
  assert.doesNotMatch(panel, /<select|save_mapping|Сохранить этапы/);
  assert.doesNotMatch(panel, /Сопоставление этапов/);
});

test("automatic worker is authenticated, scheduled every minute, and keeps JWT verification", () => {
  assert.match(autoSql, /cron\.schedule/);
  assert.match(autoSql, /'\* \* \* \* \*'/);
  assert.match(autoSql, /qazeducation_amocrm_worker_secret/);
  assert.match(autoSql, /cron\.unschedule\(job_id\)/);
  assert.match(autoSql, /vault\.decrypted_secrets/);
  assert.match(edge, /crm_authorize_worker/);
  assert.match(edge, /action === "worker"/);
  assert.match(edge, /runWorker\(admin\)/);
  assert.match(config, /\[functions\.amocrm-sync\]\s+verify_jwt = true/);
  assert.doesNotMatch(autoSql, /AMO_LONG_LIVED_TOKEN\s*=/);
});

test("expired leases and failed jobs are retried without parallel creation", () => {
  assert.match(edge, /\.eq\("state", "processing"\)/);
  assert.match(edge, /\.lte\("lease_expires_at", now\)/);
  assert.match(edge, /exponentialRetry/);
  assert.match(edge, /retry_failed/);
});

test("admin UI is operational while setup stays in technical details", () => {
  assert.match(panel, /run\("drain", \{ limit: 1 \}/);
  assert.match(panel, /Техническая информация/);
  assert.match(panel, /Повторить ошибки/);
  assert.match(panel, /Автоматическая синхронизация работает/);
  assert.doesNotMatch(panel, /Повторить эту же заявку/);
  assert.doesNotMatch(panel, /limit: 25/);
});
