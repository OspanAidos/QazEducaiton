import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { createDraftSaveQueue } from "../src/draft-save-queue.js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  normalizeOrigin,
  supabaseProjectRef,
  validateSupabaseBinding,
} from "../src/environment.js";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("preview refuses the production Supabase and verifies its expected project", () => {
  const production = validateSupabaseBinding({
    url: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
    publishableKey: "public-test-key",
    environment: "preview",
    expectedProjectRef: PRODUCTION_SUPABASE_PROJECT_REF,
  });
  assert.equal(production.configured, false);
  assert.match(production.issue, /рабочий Supabase/);

  const previewRef = "previewproject123456";
  assert.deepEqual(
    validateSupabaseBinding({
      url: `https://${previewRef}.supabase.co`,
      publishableKey: "public-test-key",
      environment: "preview",
      expectedProjectRef: previewRef,
    }),
    { configured: true, issue: "", actualProjectRef: previewRef },
  );
  assert.equal(supabaseProjectRef(`https://${previewRef}.supabase.co`), previewRef);
  assert.equal(normalizeOrigin("https://preview.qazeducation.kz/path"), "https://preview.qazeducation.kz");
});

test("draft queue merges rapid field changes into one save", async () => {
  const saves = [];
  const queue = createDraftSaveQueue({
    delay: 5,
    save: async (patch) => {
      saves.push(patch);
      return { ok: true };
    },
  });

  queue.schedule({ birth: "2006-01-02" });
  queue.schedule({ category: "university" });
  await queue.flush();

  assert.deepEqual(saves, [{ birth: "2006-01-02", category: "university" }]);
  assert.equal(queue.hasUnsavedChanges(), false);
  queue.dispose();
});

test("draft queue serializes slow saves and keeps newer values", async () => {
  const saves = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const queue = createDraftSaveQueue({
    delay: 50,
    save: async (patch) => {
      saves.push(patch);
      if (saves.length === 1) await firstGate;
      return { ok: true };
    },
  });

  queue.schedule({ motivation: "первая версия" });
  const flushing = queue.flush();
  await Promise.resolve();
  queue.schedule({ motivation: "итоговая версия", support_type: "grant" });
  releaseFirst();
  await flushing;

  assert.deepEqual(saves, [
    { motivation: "первая версия" },
    { motivation: "итоговая версия", support_type: "grant" },
  ]);
  queue.dispose();
});

test("failed draft save remains pending and can be retried without data loss", async () => {
  const saves = [];
  const queue = createDraftSaveQueue({
    delay: 50,
    save: async (patch) => {
      saves.push(patch);
      return saves.length === 1 ? { ok: false } : { ok: true };
    },
  });

  queue.schedule({ birth: "2005-04-03" });
  assert.equal((await queue.flush()).ok, false);
  assert.equal(queue.hasUnsavedChanges(), true);
  queue.schedule({ category: "college" });
  assert.equal((await queue.flush()).ok, true);
  assert.deepEqual(saves[1], { birth: "2005-04-03", category: "college" });
  queue.dispose();
});

test("preview build guard, noindex metadata and environment-specific Telegram links are present", async () => {
  const [vite, telegram, envExample] = await Promise.all([
    source("vite.config.js"),
    source("supabase/functions/telegram-notify/index.ts"),
    source(".env.preview.example"),
  ]);
  assert.match(vite, /Preview-сборка не может использовать рабочий Supabase/);
  assert.match(vite, /noindex,nofollow,noarchive/);
  assert.match(vite, /User-agent: \*\\nDisallow: \/\\n/);
  assert.match(telegram, /Deno\.env\.get\("SITE_ORIGIN"\)/);
  assert.doesNotMatch(telegram, /https:\/\/qazeducation\.kz\/profile#certificates/);
  for (const name of [
    "VITE_APP_ENV",
    "VITE_SITE_ORIGIN",
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "VITE_EXPECTED_SUPABASE_PROJECT_REF",
  ]) assert.match(envExample, new RegExp(`^${name}=`, "m"));
});

test("public rules consistently allow Kazakhstan and foreign participants aged 14–25", async () => {
  const [pages, legal, resultsSql, hardeningSql] = await Promise.all([
    source("src/pages-content.js"),
    source("src/legal-docs.js"),
    source("supabase/competition-results-v1.sql"),
    source("supabase/qa-hardening-v5.sql"),
  ]);
  assert.match(pages, /граждане Республики Казахстан и иностранные участники/);
  assert.match(pages, /Қазақстан азаматтары мен шетелдік қатысушылар/);
  assert.match(legal, /иностранные участники/);
  assert.match(resultsSql, /allows_foreign_participants boolean not null default true/);
  assert.match(hardeningSql, /set allows_foreign_participants = true/);
});

test("certificate seal, signature and private fonts never enter public assets", async () => {
  const publicFiles = await readdir(new URL("../public/", import.meta.url), { recursive: true });
  const publicNames = publicFiles.map(String).join("\n");
  assert.doesNotMatch(publicNames, /signature-seal|DejaVuSans|DejaVuSerif/i);
  const gitignore = await source(".gitignore");
  assert.match(gitignore, /private-install-assets/);
});

test("QA hardening migration is rerunnable and enforces browser write boundaries", async () => {
  const db = new PGlite();
  const userId = randomUUID();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.competition_cycles(
      id integer primary key,
      allows_foreign_participants boolean not null default false,
      updated_at timestamptz not null default now()
    );
    create table public.profiles(
      id uuid primary key,
      first_name text,
      telegram_user_id bigint,
      updated_at timestamptz not null default now()
    );
    create table public.applications(
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null unique,
      number text unique,
      status text not null default 'draft',
      progress integer not null default 0,
      data jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table public.payments(
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      status text not null default 'pending'
    );
    insert into public.competition_cycles(id) values (2026);
    insert into public.profiles(id, first_name) values ('${userId}', 'Тест');
    alter table public.profiles enable row level security;
    create policy profile_own on public.profiles for all using (auth.uid()=id) with check (auth.uid()=id);
    alter table public.applications enable row level security;
    create policy application_own on public.applications for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
    alter table public.payments enable row level security;
    create policy payment_own on public.payments for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
    grant usage on schema public, auth to authenticated, service_role;
    grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
  `);

  const migration = await source("supabase/qa-hardening-v5.sql");
  await db.exec(migration);
  await db.exec(migration);
  assert.equal(
    (await db.query("select allows_foreign_participants from public.competition_cycles where id=2026")).rows[0].allows_foreign_participants,
    true,
  );

  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
  await db.exec("set role authenticated");
  await assert.rejects(
    () => db.query("insert into public.payments(user_id,status) values($1,'paid')", [userId]),
    /permission denied/,
  );
  await assert.rejects(
    () => db.query("update public.profiles set telegram_user_id=42 where id=$1", [userId]),
    /permission denied/,
  );
  await db.query("insert into public.applications(user_id) values($1)", [userId]);
  const application = (await db.query(
    "select number from public.applications where user_id=$1",
    [userId],
  )).rows[0];
  assert.match(application.number, /^QE-\d{4}-\d{6}$/);
  await assert.rejects(
    () => db.query("update public.applications set status='result' where user_id=$1", [userId]),
    /permission denied/,
  );
  await db.query(
    "select public.save_own_application_draft($1::jsonb)",
    [{ birth: "2004-05-06" }],
  );
  await db.query(
    "select public.save_own_application_draft($1::jsonb)",
    [{ category: "university" }],
  );
  await assert.rejects(
    () => db.query(
      "select public.save_own_application_draft($1::jsonb)",
      [{ status: "result" }],
    ),
    /недопустимые поля/,
  );
  await db.exec("reset role");
  const draft = (await db.query(
    "select data from public.applications where user_id=$1",
    [userId],
  )).rows[0].data;
  assert.deepEqual(draft, { birth: "2004-05-06", category: "university" });
  await db.close();
});
