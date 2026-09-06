import { createClient } from "npm:@supabase/supabase-js@^2";
import {
  CONTACT_FIELD_DEFINITIONS,
  LEAD_FIELD_DEFINITIONS,
  SITE_STATUSES,
  buildContactPayload,
  buildLeadPayload,
  findExactByApplicationUuid,
  fixedStatusMap,
  isSyncEnabled,
  normalizeBaseUrl,
} from "../_shared/amocrm-domain.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-amocrm-worker-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { ...corsHeaders, "Cache-Control": "no-store" },
  });
}

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  let key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeys) {
    try { key = JSON.parse(secretKeys)?.default || key; } catch { /* legacy fallback */ }
  }
  if (!url || !key) throw new Error("Supabase server credentials are missing");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function amoConfigFromEnv() {
  const baseUrl = normalizeBaseUrl(Deno.env.get("AMO_BASE_URL"));
  const token = String(Deno.env.get("AMO_LONG_LIVED_TOKEN") || "").trim();
  if (!token) throw new Error("AMO_LONG_LIVED_TOKEN is missing");
  return { baseUrl, token };
}

async function amoRequest(path: string, options: RequestInit = {}) {
  const { baseUrl, token } = amoConfigFromEnv();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!response.ok) {
    const error: any = new Error(`amoCRM ${response.status}: ${typeof payload === "string" ? payload : JSON.stringify(payload)}`);
    error.status = response.status;
    error.retryAfter = Number(response.headers.get("Retry-After") || 0);
    throw error;
  }
  return payload;
}

async function currentUser(request: Request, admin: ReturnType<typeof adminClient>) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("authentication_required");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error("authentication_required");
  const { data: adminRow } = await admin
    .from("admin_users")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  return { user: data.user, isAdmin: Boolean(adminRow) };
}

async function isAuthorizedWorker(request: Request, admin: ReturnType<typeof adminClient>) {
  const secret = String(request.headers.get("x-amocrm-worker-secret") || "").trim();
  if (!secret) return false;
  const { data, error } = await admin.rpc("crm_authorize_worker", { p_secret: secret });
  if (error) {
    console.error("amocrm-sync: worker authorization failed", error.message);
    return false;
  }
  return data === true;
}

async function listAll(path: string, embeddedKey: string) {
  const all: any[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const payload = await amoRequest(`${path}${separator}limit=250&page=${page}`);
    const items = payload?._embedded?.[embeddedKey] || [];
    all.push(...items);
    if (items.length < 250) break;
  }
  return all;
}

async function getPipeline(name = "QAZEDUCATION") {
  const pipelines = await listAll("/api/v4/leads/pipelines", "pipelines");
  const pipeline = pipelines.find(
    (item) => String(item.name || "").trim().toLowerCase() === name.trim().toLowerCase()
  );
  if (!pipeline) throw new Error(`Воронка ${name} не найдена в amoCRM`);
  const full = await amoRequest(`/api/v4/leads/pipelines/${pipeline.id}`);
  const statuses = (full?._embedded?.statuses || []).map((item: any) => ({
    id: Number(item.id),
    name: String(item.name || ""),
    sort: Number(item.sort || 0),
    type: Number(item.type || 0),
  }));
  return { id: Number(full.id), name: full.name, statuses };
}

async function ensureFields(entity: "leads" | "contacts", definitions: any[]) {
  let fields = await listAll(`/api/v4/${entity}/custom_fields`, "custom_fields");
  const result: Record<string, number> = {};
  const missing = [];
  for (const [key, name, type] of definitions) {
    const found = fields.find((item) => String(item.name || "").trim() === name);
    if (found) result[key] = Number(found.id);
    else missing.push({ name, type, sort: 500 });
  }
  if (missing.length) {
    await amoRequest(`/api/v4/${entity}/custom_fields`, {
      method: "POST",
      body: JSON.stringify(missing),
    });
    fields = await listAll(`/api/v4/${entity}/custom_fields`, "custom_fields");
    for (const [key, name] of definitions) {
      const found = fields.find((item) => String(item.name || "").trim() === name);
      if (!found) throw new Error(`Не удалось создать поле amoCRM: ${name}`);
      result[key] = Number(found.id);
    }
  }
  return { map: result, fields };
}

async function readRuntimeConfig(admin: ReturnType<typeof adminClient>) {
  const [{ data: setting }, { data: mappings }] = await Promise.all([
    admin.from("crm_settings").select("setting_value").eq("setting_key", "amocrm").maybeSingle(),
    admin.from("crm_status_map").select("site_status,amo_status_id,amo_status_name"),
  ]);
  if (!setting?.setting_value?.pipeline_id) return null;
  return {
    ...setting.setting_value,
    status_map: Object.fromEntries((mappings || []).map((item) => [item.site_status, item.amo_status_id])),
    status_map_rows: mappings || [],
  };
}

async function setupAmo(admin: ReturnType<typeof adminClient>) {
  await amoRequest("/api/v4/account");
  const pipeline = await getPipeline("QAZEDUCATION");
  const lead = await ensureFields("leads", LEAD_FIELD_DEFINITIONS);
  const contact = await ensureFields("contacts", CONTACT_FIELD_DEFINITIONS);
  const phone = contact.fields.find((item) => item.code === "PHONE");
  const email = contact.fields.find((item) => item.code === "EMAIL");
  const defaultStatus = pipeline.statuses
    .filter((item) => ![142, 143].includes(item.id))
    .sort((a, b) => a.sort - b.sort)[0];
  if (!defaultStatus) throw new Error("В воронке QAZEDUCATION нет активных этапов");

  const value = {
    pipeline_id: pipeline.id,
    pipeline_name: pipeline.name,
    default_status_id: defaultStatus.id,
    lead_fields: lead.map,
    contact_fields: contact.map,
    phone_field_id: phone?.id || null,
    email_field_id: email?.id || null,
    site_origin: Deno.env.get("SITE_ORIGIN") || "https://qazeducation.kz",
  };
  const { error: settingError } = await admin
    .from("crm_settings")
    .upsert({ setting_key: "amocrm", setting_value: value, updated_at: new Date().toISOString() });
  if (settingError) throw settingError;

  const fixed = fixedStatusMap(pipeline.statuses);
  if (fixed.missing.length) {
    throw new Error(`В воронке QAZEDUCATION отсутствуют обязательные этапы: ${fixed.missing.join(", ")}`);
  }
  const statusById = new Map(pipeline.statuses.map((item) => [item.id, item.name]));
  const rows = Object.entries(fixed.mapping).map(([siteStatus, amoStatusId]) => ({
    site_status: siteStatus,
    amo_status_id: Number(amoStatusId),
    amo_status_name: statusById.get(Number(amoStatusId)) || String(amoStatusId),
    updated_at: new Date().toISOString(),
  }));
  const { error: clearError } = await admin.from("crm_status_map").delete().neq("site_status", "__never__");
  if (clearError) throw clearError;
  const { error } = await admin.from("crm_status_map").insert(rows);
  if (error) throw error;
  return { pipeline, config: await readRuntimeConfig(admin) };
}

async function loadSnapshot(admin: ReturnType<typeof adminClient>, applicationId: string) {
  const { data: application, error } = await admin
    .from("applications")
    .select("id,user_id,number,status,progress,data,decision,submitted_at,created_at,updated_at")
    .eq("id", applicationId)
    .single();
  if (error || !application) throw error || new Error("application_not_found");
  const [{ data: profile }, { data: payments }, userResult] = await Promise.all([
    admin.from("profiles").select("first_name,last_name,phone,category").eq("id", application.user_id).single(),
    admin.from("payments").select("payment_type,status,amount_tenge,paid_at").eq("user_id", application.user_id),
    admin.auth.admin.getUserById(application.user_id),
  ]);
  if (!profile) throw new Error("profile_not_found");
  return { application, profile, payments: payments || [], email: userResult.data.user?.email || "" };
}

async function searchExact(entity: "leads" | "contacts", embedded: string, applicationId: string, fieldId: number) {
  const payload = await amoRequest(`/api/v4/${entity}?query=${encodeURIComponent(applicationId)}&limit=50`);
  const items = payload?._embedded?.[embedded] || [];
  const exact = findExactByApplicationUuid(items, fieldId, applicationId);
  if (exact.length > 1) {
    throw new Error(`DUPLICATE_AMO_${entity.toUpperCase()}: найдено ${exact.length} карточки с UUID ${applicationId}`);
  }
  return exact[0] || null;
}

function createdEntity(payload: any, key: string) {
  const item = payload?._embedded?.[key]?.[0];
  if (!item?.id) throw new Error(`amoCRM did not return created ${key} id`);
  return item;
}

async function syncOne(admin: ReturnType<typeof adminClient>, applicationId: string) {
  const leaseId = crypto.randomUUID();
  const { data: claim, error: claimError } = await admin.rpc("crm_claim_sync", {
    p_application_id: applicationId,
    p_lease_id: leaseId,
  });
  if (claimError) throw claimError;
  if (!claim?.claimed) return { ok: true, skipped: true, reason: claim?.reason || "not_claimed" };

  try {
    const config = await readRuntimeConfig(admin);
    if (!config) throw new Error("amoCRM не настроена: сначала выполните безопасную настройку в админ-панели");
    const snapshot = await loadSnapshot(admin, applicationId);
    const appUuid = snapshot.application.id;

    let contactId = Number(claim.amo_contact_id || 0) || null;
    if (!contactId) {
      const recovered = await searchExact("contacts", "contacts", appUuid, config.contact_fields.application_uuid);
      contactId = recovered?.id ? Number(recovered.id) : null;
    }
    if (!contactId) {
      const created = await amoRequest("/api/v4/contacts", {
        method: "POST",
        body: JSON.stringify([buildContactPayload(snapshot, config)]),
      });
      contactId = Number(createdEntity(created, "contacts").id);
    } else {
      await amoRequest(`/api/v4/contacts/${contactId}`, {
        method: "PATCH",
        body: JSON.stringify(buildContactPayload(snapshot, config)),
      });
    }

    let leadId = Number(claim.amo_lead_id || 0) || null;
    if (!leadId) {
      const recovered = await searchExact("leads", "leads", appUuid, config.lead_fields.application_uuid);
      leadId = recovered?.id ? Number(recovered.id) : null;
    }

    if (!leadId) {
      const attemptedAt = claim.create_attempted_at ? new Date(claim.create_attempted_at).getTime() : 0;
      if (attemptedAt && Date.now() - attemptedAt < 10 * 60 * 1000) {
        throw new Error("RECOVERY_WAIT: предыдущий запрос создания мог выполниться; повторная проверка без создания через 10 минут");
      }
      const { error } = await admin.rpc("crm_mark_create_attempt", {
        p_application_id: applicationId,
        p_lease_id: leaseId,
      });
      if (error) throw error;
      const body = buildLeadPayload(snapshot, config, null);
      body.request_id = appUuid;
      body._embedded = { contacts: [{ id: contactId }] };
      const created = await amoRequest("/api/v4/leads", { method: "POST", body: JSON.stringify([body]) });
      leadId = Number(createdEntity(created, "leads").id);
    } else {
      const body = buildLeadPayload(snapshot, config, leadId);
      await amoRequest(`/api/v4/leads/${leadId}`, { method: "PATCH", body: JSON.stringify(body) });
    }

    const { error: finishError } = await admin.rpc("crm_finish_sync", {
      p_application_id: applicationId,
      p_lease_id: leaseId,
      p_amo_lead_id: leadId,
      p_amo_contact_id: contactId,
    });
    if (finishError) throw finishError;
    return { ok: true, application_id: applicationId, amo_lead_id: leadId, amo_contact_id: contactId };
  } catch (error: any) {
    const attempts = Math.max(1, Number(claim?.attempts || 1));
    const exponentialRetry = Math.min(3600, 60 * (2 ** Math.min(attempts - 1, 6)));
    const retrySeconds = error?.status === 429
      ? Math.max(exponentialRetry, Number(error.retryAfter || 60))
      : String(error?.message || "").startsWith("RECOVERY_WAIT") ? 600 : exponentialRetry;
    await admin.rpc("crm_fail_sync", {
      p_application_id: applicationId,
      p_lease_id: leaseId,
      p_error: error?.message || String(error),
      p_retry_seconds: retrySeconds,
    });
    throw error;
  }
}

async function listDueJobs(admin: ReturnType<typeof adminClient>, requestedLimit: number) {
  const limit = Math.max(1, Math.min(Number(requestedLimit || 5), 25));
  const now = new Date().toISOString();
  const { data: ready, error: readyError } = await admin
    .from("crm_sync_jobs")
    .select("application_id,updated_at")
    .in("state", ["pending", "failed"])
    .lte("next_attempt_at", now)
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (readyError) throw readyError;

  const remaining = Math.max(0, limit - (ready || []).length);
  let expired: any[] = [];
  if (remaining > 0) {
    const { data, error } = await admin
      .from("crm_sync_jobs")
      .select("application_id,updated_at")
      .eq("state", "processing")
      .lte("lease_expires_at", now)
      .order("updated_at", { ascending: true })
      .limit(remaining);
    if (error) throw error;
    expired = data || [];
  }

  return [...(ready || []), ...expired]
    .sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)))
    .slice(0, limit);
}

async function drainQueue(admin: ReturnType<typeof adminClient>, requestedLimit = 5) {
  const jobs = await listDueJobs(admin, requestedLimit);
  const results = [];
  for (const job of jobs) {
    try { results.push(await syncOne(admin, job.application_id)); }
    catch (error: any) { results.push({ ok: false, application_id: job.application_id, error: error.message }); }
  }
  return { ok: true, processed: results.length, results };
}

async function recordWorkerState(admin: ReturnType<typeof adminClient>, values: Record<string, unknown>) {
  const { error } = await admin
    .from("crm_worker_state")
    .upsert({ singleton: true, ...values, updated_at: new Date().toISOString() }, { onConflict: "singleton" });
  if (error) console.error("amocrm-sync: worker state", error.message);
}

async function runWorker(admin: ReturnType<typeof adminClient>) {
  await recordWorkerState(admin, { last_started_at: new Date().toISOString(), last_status: "running" });
  try {
    const result = await drainQueue(admin, 5);
    const failures = result.results.filter((item: any) => item?.ok === false);
    const finishedAt = new Date().toISOString();
    const workerState: Record<string, unknown> = {
      last_finished_at: finishedAt,
      last_status: failures.length ? "partial" : "ok",
      last_processed: result.processed,
      last_failed: failures.length,
      last_error: failures[0]?.error || null,
    };
    if (!failures.length) workerState.last_success_at = finishedAt;
    await recordWorkerState(admin, workerState);
    return result;
  } catch (error: any) {
    await recordWorkerState(admin, {
      last_finished_at: new Date().toISOString(),
      last_status: "error",
      last_processed: 0,
      last_failed: 1,
      last_error: error?.message || String(error),
    });
    throw error;
  }
}

async function retryFailed(admin: ReturnType<typeof adminClient>, requestedLimit = 10) {
  const limit = Math.max(1, Math.min(Number(requestedLimit || 10), 25));
  const { data: jobs, error } = await admin
    .from("crm_sync_jobs")
    .select("application_id")
    .eq("state", "failed")
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  const results = [];
  for (const job of jobs || []) {
    const { error: enqueueError } = await admin.rpc("crm_enqueue_application", {
      p_application_id: job.application_id,
      p_reason: "admin_retry",
    });
    if (enqueueError) throw enqueueError;
    try { results.push(await syncOne(admin, job.application_id)); }
    catch (syncError: any) { results.push({ ok: false, application_id: job.application_id, error: syncError.message }); }
  }
  return { ok: true, processed: results.length, results };
}

async function connectionInfo(admin: ReturnType<typeof adminClient>) {
  const account = await amoRequest("/api/v4/account");
  const pipeline = await getPipeline("QAZEDUCATION");
  const config = await readRuntimeConfig(admin);
  const [linkedResult, pendingResult, processingResult, failedResult, lastSuccessResult, lastFailureResult, autoSyncResult] = await Promise.all([
    admin.from("crm_sync_jobs").select("application_id", { count: "exact", head: true }).not("amo_lead_id", "is", null),
    admin.from("crm_sync_jobs").select("application_id", { count: "exact", head: true }).eq("state", "pending"),
    admin.from("crm_sync_jobs").select("application_id", { count: "exact", head: true }).eq("state", "processing"),
    admin.from("crm_sync_jobs").select("application_id", { count: "exact", head: true }).eq("state", "failed"),
    admin.from("crm_sync_jobs").select("last_synced_at").not("last_synced_at", "is", null).order("last_synced_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("crm_sync_jobs").select("last_error,updated_at").eq("state", "failed").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    admin.rpc("crm_auto_sync_status"),
  ]);
  const pending = Number(pendingResult.count || 0) + Number(processingResult.count || 0);
  return {
    account: { id: account.id, name: account.name, subdomain: account.subdomain },
    pipeline,
    config,
    enabled: isSyncEnabled(Deno.env.get("AMO_SYNC_ENABLED")),
    auto_sync: autoSyncResult.error ? { installed: false, active: false } : autoSyncResult.data,
    stats: {
      linked: linkedResult.count || 0,
      pending,
      failed: failedResult.count || 0,
      last_synced_at: lastSuccessResult.data?.last_synced_at || null,
      last_error: lastFailureResult.data?.last_error || null,
      last_error_at: lastFailureResult.data?.updated_at || null,
    },
    site_statuses: SITE_STATUSES,
  };
}

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
    try {
      const admin = adminClient();
      const body = await request.json().catch(() => ({}));
      const action = String(body?.action || "sync_self");
      const worker = action === "worker" && await isAuthorizedWorker(request, admin);
      if (action === "worker" && !worker) return json({ ok: false, error: "worker_authentication_required" }, 401);
      const auth = worker ? null : await currentUser(request, admin);

      if (["connection", "setup", "sync_application", "drain", "retry_failed"].includes(action) && !auth?.isAdmin) {
        return json({ ok: false, error: "admin_required" }, 403);
      }

      if (action === "connection") return json({ ok: true, ...(await connectionInfo(admin)) });
      if (action === "setup") return json({ ok: true, ...(await setupAmo(admin)), ...(await connectionInfo(admin)) });
      if (action === "save_mapping") return json({ ok: false, error: "Этапы QazEducation зафиксированы на сервере" }, 403);

      if (!isSyncEnabled(Deno.env.get("AMO_SYNC_ENABLED"))) {
        return json({ ok: true, skipped: true, reason: "AMO_SYNC_ENABLED=false" });
      }

      if (action === "worker") return json(await runWorker(admin));

      if (action === "sync_self") {
        const { data: app } = await admin.from("applications").select("id").eq("user_id", auth!.user.id).single();
        if (!app) return json({ ok: false, error: "application_not_found" }, 404);
        await admin.rpc("crm_enqueue_application", { p_application_id: app.id, p_reason: "sync_self" });
        return json(await syncOne(admin, app.id));
      }

      if (action === "sync_application") {
        const applicationId = String(body?.application_id || "");
        await admin.rpc("crm_enqueue_application", { p_application_id: applicationId, p_reason: "admin_sync" });
        return json(await syncOne(admin, applicationId));
      }

      if (action === "drain") {
        return json(await drainQueue(admin, body?.limit || 1));
      }

      if (action === "retry_failed") return json(await retryFailed(admin, body?.limit || 10));

      return json({ ok: false, error: "unknown_action" }, 400);
    } catch (error: any) {
      console.error("amocrm-sync:", error?.message || error);
      const message = error?.message || String(error);
      const status = message === "authentication_required" ? 401 : 500;
      return json({ ok: false, error: message }, status);
    }
  },
};
