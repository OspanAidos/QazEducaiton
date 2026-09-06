import { supabase } from "./supabase.js";
import { syncOwnApplication } from "./amocrm-sync.js";

/**
 * API заявки поверх Supabase.
 * Редактирование разрешается только пока заявка находится в редактируемом
 * статусе. Финальная/повторная отправка идёт через защищённую RPC-функцию.
 */

/** Загрузить заявку пользователя вместе со служебным комментарием. */
export async function loadDraft(userId) {
  const { data, error } = await supabase
    .from("applications")
    .select(
      "id,status,data,submitted_at,resubmitted_at,admin_status_comment,admin_action_type,admin_action_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("loadDraft error:", error);
    return null;
  }

  return data;
}

/** Сохранить поля редактируемой заявки (merge в data). */
export async function saveDraft(userId, patch) {
  const current = await loadDraft(userId);
  const nextData = { ...(current?.data || {}), ...patch };

  const { error } = await supabase
    .from("applications")
    .update({ data: nextData })
    .eq("user_id", userId);

  if (error) {
    console.error("saveDraft error:", error);
    return { ok: false, error };
  }

  void syncOwnApplication("draft_saved");

  return { ok: true, data: nextData };
}

/**
 * Подать заявку впервые или повторно после доработки.
 * Валидация обязательных полей и документов выполняется в Supabase RPC.
 */
export async function submitApplication() {
  const { data, error } = await supabase.rpc("submit_own_application_v2");

  if (error) {
    console.error("submitApplication error:", error);
    return { ok: false, error };
  }

  // Сервер может сохранить полностью заполненную заявку в очереди оплаты,
  // но это ещё не считается подачей и не должно создавать уведомление админу.
  if (data?.submitted === false || data?.status === "awaiting_payment") {
    return {
      ok: false,
      code: "PAYMENT_REQUIRED",
      data,
      error: {
        message:
          "Оплата участия ещё не подтверждена. Заявка сохранена, но не отправлена на рассмотрение.",
      },
    };
  }

  // Уведомление Telegram не должно блокировать саму отправку заявки.
  // Если Telegram временно недоступен, запись остаётся в очереди notifications
  // и администратор сможет повторить отправку позже.
  if (data?.application_id) {
    const { data: notifyData, error: notifyError } =
      await supabase.functions.invoke("telegram-notify", {
        body: { application_id: data.application_id },
      });

    if (notifyError || notifyData?.ok === false) {
      console.warn(
        "telegram-notify after submit:",
        notifyError || notifyData
      );
    }
  }

  if (!error) {
    void syncOwnApplication("application_submitted");
  }

  return { ok: true, data };
}

/** Проверить подтверждённую оплату организационного платежа. */
export async function hasPaidCompetitionFee(userId) {
  if (!userId) return false;
  const { data, error } = await supabase.rpc("get_own_payment_access");

  if (error) {
    console.error("hasPaidCompetitionFee error:", error);
    return false;
  }

  return data?.competition_paid === true;
}

/** Список документов пользователя. */
export async function listDocuments(userId) {
  const { data, error } = await supabase
    .from("application_documents")
    .select("id, kind, storage_path, file_name, file_size, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("listDocuments error:", error);
    return [];
  }

  return data || [];
}

/** Загрузить файл в Storage и записать в таблицу. */
export async function uploadDocument(userId, applicationId, kind, file) {
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${userId}/${kind}/${Date.now()}_${safeName}`;

  const { error: upErr } = await supabase.storage
    .from("application-docs")
    .upload(path, file, { upsert: false });

  if (upErr) {
    console.error("uploadDocument storage error:", upErr);
    return { ok: false, error: upErr };
  }

  const { data, error: dbErr } = await supabase
    .from("application_documents")
    .insert({
      application_id: applicationId,
      user_id: userId,
      kind,
      storage_path: path,
      file_name: file.name,
      file_size: file.size,
    })
    .select("id, kind, storage_path, file_name, file_size, created_at")
    .maybeSingle();

  if (dbErr) {
    console.error("uploadDocument db error:", dbErr);
    await supabase.storage.from("application-docs").remove([path]);
    return { ok: false, error: dbErr };
  }

  return { ok: true, doc: data };
}

/** Удалить документ (из Storage и таблицы). */
export async function deleteDocument(doc) {
  const { error: storageError } = await supabase.storage
    .from("application-docs")
    .remove([doc.storage_path]);

  if (storageError) {
    console.error("deleteDocument storage error:", storageError);
    return { ok: false, error: storageError };
  }

  const { error } = await supabase
    .from("application_documents")
    .delete()
    .eq("id", doc.id);

  if (error) {
    console.error("deleteDocument error:", error);
    return { ok: false, error };
  }

  return { ok: true };
}

/** Ссылка для скачивания/просмотра файла (подписанная, приватный бакет). */
export async function signedUrl(storagePath) {
  const { data, error } = await supabase.storage
    .from("application-docs")
    .createSignedUrl(storagePath, 60 * 10);

  if (error) {
    console.error("signedUrl error:", error);
    return null;
  }

  return data.signedUrl;
}
