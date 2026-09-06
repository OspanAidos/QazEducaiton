import { supabase } from "./supabase.js";

async function invoke(body) {
  const { data, error } = await supabase.functions.invoke("amocrm-sync", { body });
  if (error || data?.ok === false) {
    throw new Error(data?.error || error?.message || "Не удалось синхронизировать amoCRM");
  }
  return data;
}

/** Ошибка CRM не должна отменять уже сохранённое действие пользователя. */
export async function syncOwnApplication(reason = "client_event") {
  try {
    return await invoke({ action: "sync_self", reason });
  } catch (error) {
    console.warn("amoCRM sync queued:", error);
    return { ok: false, queued: true, error };
  }
}

export async function syncApplicationAsAdmin(applicationId) {
  return invoke({ action: "sync_application", application_id: applicationId });
}

export async function amoAdminAction(action, payload = {}) {
  return invoke({ action, ...payload });
}
