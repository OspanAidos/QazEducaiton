import { createClient } from "npm:@supabase/supabase-js@^2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
    },
  });
}

function getServerKey() {
  let key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeysRaw) {
    try {
      const secretKeys = JSON.parse(secretKeysRaw);
      key = secretKeys?.default || key;
    } catch {
      // fallback to legacy service_role
    }
  }

  if (!key) {
    throw new Error("No Supabase server secret key is available");
  }

  return key;
}

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) throw new Error("SUPABASE_URL is missing");

  const key = getServerKey();

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function applicationNumber(payload: Record<string, unknown>) {
  const value = String(payload?.application_number ?? "").trim();
  return value ? escapeHtml(value) : "—";
}

function buildMessage(params: {
  eventType: string;
  payload: Record<string, unknown>;
  lang: string;
  firstName?: string | null;
}) {
  const { eventType, payload, firstName } = params;
  const lang = params.lang === "kk" ? "kk" : "ru";
  const number = applicationNumber(payload);
  const comment = escapeHtml(payload?.admin_comment);
  const decision = String(payload?.decision ?? "");
  const status = String(payload?.status ?? "");
  const certificateNumber = escapeHtml(payload?.certificate_number);
  const certificateType = String(payload?.certificate_type ?? "");
  const safeName = escapeHtml(firstName || "");
  const hello = safeName
    ? lang === "kk"
      ? `Сәлеметсіз бе, ${safeName}!\n\n`
      : `Здравствуйте, ${safeName}!\n\n`
    : "";

  if (lang === "kk") {
    switch (eventType) {
      case "application_submitted":
        return `${hello}✅ <b>Өтінім қабылданды</b>\n\n№ <b>${number}</b> өтініміңіз QazEducation жүйесіне сәтті жіберілді. Өтінім мәртебесі өзгерген кезде сізге хабарлаймыз.`;

      case "application_resubmitted":
        return `${hello}✅ <b>Өтінім қайта жіберілді</b>\n\n№ <b>${number}</b> өтініміңіз толықтырудан кейін қайта қабылданды.`;

      case "application_revision":
        return `${hello}📝 <b>Өтінімді толықтыру қажет</b>\n\n№ <b>${number}</b> өтінімі бойынша түзету қажет.${comment ? `\n\n<b>Хатшылықтың түсіндірмесі:</b>\n${comment}` : ""}\n\nТолықтыру үшін QazEducation жеке кабинетіне кіріңіз.`;

      case "application_sent_to_commission":
        return `${hello}✅ <b>Өтінім комиссияға жіберілді</b>\n\n№ <b>${number}</b> өтініміңіз әкімшілік тексеруден өтіп, конкурстық комиссияның бағалауына берілді. Қазіргі уақытта қосымша әрекет қажет емес.`;

      case "application_rejected":
        return `${hello}❌ <b>Өтінім қабылданбады</b>\n\n№ <b>${number}</b> өтінімінің конкурстағы әрі қарайғы қатысуы тоқтатылды.${comment ? `\n\n<b>Себебі:</b>\n${comment}` : ""}`;

      case "competition_final_rejected":
        return `${hello}<b>QazEducation конкурсы аяқталды</b>\n\n№ <b>${number}</b> өтініміңіз бұған дейін қабылданбаған. Конкурс қорытындысы жарияланды, өтініміңіздің мәртебесі өзгеріссіз қалады. Қатысқаныңыз үшін рақмет.`;

      case "competition_result":
        if (decision === "grant") {
          return `${hello}🏆 <b>Құттықтаймыз!</b>\n\nQazEducation конкурсының қорытындысы бойынша сіз білім беру грантының жеңімпазы атандыңыз.\n\nКелесі рәсімдеу қадамдары бойынша QazEducation өкілдерімен байланысыңыз.`;
        }
        if (decision === "scholarship") {
          return `${hello}🎓 <b>Құттықтаймыз!</b>\n\nQazEducation конкурсының қорытындысы бойынша сізге айына <b>50 000 ₸</b> мөлшерінде стипендия тағайындалды.\n\nКелесі рәсімдеу қадамдары бойынша QazEducation өкілдерімен байланысыңыз.`;
        }
        if (decision === "top30") {
          return `${hello}⭐ <b>Конкурс қорытындысы</b>\n\nQazEducation конкурсының қорытындысы бойынша сіз <b>Top-30 резервтік тізіміне</b> ендіңіз. Бос орын пайда болған жағдайда ұйымдастырушылар сізбен қосымша байланысады.`;
        }
        if (decision === "reserve") {
          return `${hello}📋 <b>Конкурс қорытындысы</b>\n\nСіз QazEducation резервтік тізіміне енгізілдіңіз.`;
        }
        if (decision === "not_selected") {
          return `${hello}<b>QazEducation конкурсының қорытындысы</b>\n\nОсы іріктеу нәтижесінде сіз білім беру грантын немесе стипендияны алушылар тізіміне енбедіңіз. Қатысқаныңыз үшін рақмет.`;
        }
        return `${hello}<b>QazEducation конкурсының қорытындысы жарияланды.</b>\n\n№ <b>${number}</b> өтінімінің нәтижесін жеке кабинеттен қараңыз.`;

      case "certificate_issued": {
        const label = certificateType === "participant"
          ? "қатысушы сертификаты"
          : certificateType === "grant"
            ? "білім беру гранты жеңімпазының сертификаты"
            : certificateType === "scholarship"
              ? "стипендиат сертификаты"
              : "Top-30 финалист сертификаты";
        return `${hello}📜 <b>Сертификат дайын</b>\n\nСізге ${label} берілді.${certificateNumber ? `\nСертификат № <b>${certificateNumber}</b>` : ""}\n\nЖүктеу және QR арқылы тексеру: https://qazeducation.kz/profile#certificates`;
      }

      default:
        return `${hello}<b>QazEducation өтінімінің мәртебесі жаңартылды.</b>\n\nӨтінім № <b>${number}</b>${status ? `\nМәртебе: <b>${escapeHtml(status)}</b>` : ""}`;
    }
  }

  switch (eventType) {
    case "application_submitted":
      return `${hello}✅ <b>Заявка принята</b>\n\nВаша заявка № <b>${number}</b> успешно отправлена в QazEducation. Мы уведомим вас, когда её статус изменится.`;

    case "application_resubmitted":
      return `${hello}✅ <b>Заявка повторно отправлена</b>\n\nЗаявка № <b>${number}</b> принята после доработки.`;

    case "application_revision":
      return `${hello}📝 <b>Требуется доработка заявки</b>\n\nПо заявке № <b>${number}</b> необходимо внести исправления.${comment ? `\n\n<b>Комментарий секретариата:</b>\n${comment}` : ""}\n\nВойдите в личный кабинет QazEducation и внесите необходимые изменения.`;

    case "application_sent_to_commission":
      return `${hello}✅ <b>Заявка передана комиссии</b>\n\nЗаявка № <b>${number}</b> прошла административную проверку и передана конкурсной комиссии для независимой оценки. Дополнительных действий сейчас не требуется.`;

    case "application_rejected":
      return `${hello}❌ <b>Заявка отклонена</b>\n\nДальнейшее участие заявки № <b>${number}</b> в конкурсе прекращено.${comment ? `\n\n<b>Причина:</b>\n${comment}` : ""}`;

    case "competition_final_rejected":
      return `${hello}<b>Конкурс QazEducation завершён</b>\n\nВаша заявка № <b>${number}</b> была отклонена ранее. Итоги конкурса опубликованы, статус заявки остаётся без изменений. Благодарим за участие.`;

    case "competition_result":
      if (decision === "grant") {
        return `${hello}🏆 <b>Поздравляем!</b>\n\nПо результатам конкурса QazEducation вы стали победителем и получили образовательный грант.\n\nСвяжитесь с представителями QazEducation для дальнейшего оформления.`;
      }
      if (decision === "scholarship") {
        return `${hello}🎓 <b>Поздравляем!</b>\n\nПо результатам конкурса QazEducation вам назначена стипендия в размере <b>50 000 ₸ в месяц</b>.\n\nСвяжитесь с представителями QazEducation для дальнейшего оформления.`;
      }
      if (decision === "top30") {
        return `${hello}⭐ <b>Результаты конкурса</b>\n\nПо результатам конкурса QazEducation вы включены в <b>Top-30 резервного списка</b>. В случае освобождения места организаторы свяжутся с вами дополнительно.`;
      }
      if (decision === "reserve") {
        return `${hello}📋 <b>Результаты конкурса</b>\n\nВы включены в резервный список QazEducation.`;
      }
      if (decision === "not_selected") {
        return `${hello}<b>Результаты конкурса QazEducation</b>\n\nПо итогам текущего отбора вы не вошли в число получателей образовательного гранта или стипендии. Благодарим за участие.`;
      }
      return `${hello}<b>Опубликованы результаты конкурса QazEducation.</b>\n\nРезультат по заявке № <b>${number}</b> доступен в личном кабинете.`;

    case "certificate_issued": {
      const label = certificateType === "participant"
        ? "сертификат участника"
        : certificateType === "grant"
          ? "сертификат победителя образовательного гранта"
          : certificateType === "scholarship"
            ? "сертификат стипендиата"
            : "сертификат финалиста Top-30";
      return `${hello}📜 <b>Сертификат готов</b>\n\nВам выдан ${label}.${certificateNumber ? `\nСертификат № <b>${certificateNumber}</b>` : ""}\n\nСкачать документ и проверить QR: https://qazeducation.kz/profile#certificates`;
    }

    default:
      return `${hello}<b>Статус заявки QazEducation обновлён.</b>\n\nЗаявка № <b>${number}</b>${status ? `\nСтатус: <b>${escapeHtml(status)}</b>` : ""}`;
  }
}

async function sendTelegram(botToken: string, chatId: string | number, text: string) {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    },
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result?.ok !== true) {
    const description = String(result?.description || `HTTP ${response.status}`);
    throw new Error(description);
  }

  return result.result;
}

type QueueItem = {
  id: number;
  user_id: string;
  application_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  created_at: string;
};

async function processQueue(params: {
  supabaseAdmin: ReturnType<typeof getAdminClient>;
  botToken: string;
  queue: QueueItem[];
  callerId: string;
  isAdmin: boolean;
}) {
  const { supabaseAdmin, botToken, queue, callerId, isAdmin } = params;

  if (!queue.length) {
    return { sent: 0, failed: 0, skipped: 0, results: [] };
  }

  const userIds = [...new Set(queue.map((item) => item.user_id).filter(Boolean))];

  const [{ data: profiles }, { data: telegramAccounts }] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id,first_name,lang,telegram_chat_id")
      .in("id", userIds),
    supabaseAdmin
      .from("telegram_accounts")
      .select("auth_user_id,telegram_chat_id")
      .in("auth_user_id", userIds),
  ]);

  const profileByUser = new Map<string, any>((profiles || []).map((row: any) => [row.id, row]));
  const telegramByUser = new Map<string, any>(
    (telegramAccounts || []).map((row: any) => [row.auth_user_id, row]),
  );

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const item of queue) {
    if (!isAdmin && item.user_id !== callerId) {
      skipped += 1;
      continue;
    }

    const attemptNumber = Number(item.attempts || 0) + 1;
    const attemptAt = new Date().toISOString();

    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("notifications")
      .update({
        status: "processing",
        attempts: attemptNumber,
        last_attempt_at: attemptAt,
        error_text: null,
      })
      .eq("id", item.id)
      .eq("status", item.status)
      .select("id")
      .maybeSingle();

    if (claimError) {
      console.error("[telegram-notify] claim:", claimError);
      failed += 1;
      results.push({ id: item.id, status: "failed", error: claimError.message });
      continue;
    }

    if (!claimed) {
      skipped += 1;
      continue;
    }

    try {
      const profile = profileByUser.get(item.user_id) || null;
      const telegramAccount = telegramByUser.get(item.user_id) || null;
      const chatId =
        telegramAccount?.telegram_chat_id || profile?.telegram_chat_id || null;

      if (!chatId) {
        throw new Error("У участника не подключён Telegram chat_id");
      }

      const text = buildMessage({
        eventType: item.event_type,
        payload: item.payload || {},
        lang: profile?.lang || "ru",
        firstName: profile?.first_name || null,
      });

      const message = await sendTelegram(botToken, chatId, text);

      await supabaseAdmin
        .from("notifications")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_message_id: message?.message_id || null,
          error_text: null,
        })
        .eq("id", item.id);

      sent += 1;
      results.push({ id: item.id, status: "sent" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error || "Unknown error");

      console.error("[telegram-notify] send:", item.id, message);

      await supabaseAdmin
        .from("notifications")
        .update({
          status: "failed",
          error_text: message.slice(0, 1000),
        })
        .eq("id", item.id);

      failed += 1;
      results.push({ id: item.id, status: "failed", error: message });
    }
  }

  return { sent, failed, skipped, results };
}

async function competitionDeliveryCounts(
  supabaseAdmin: ReturnType<typeof getAdminClient>,
) {
  const eventTypes = [
    "competition_result",
    "competition_final_rejected",
    "certificate_issued",
  ];

  const [pendingRes, failedRes, sentRes] = await Promise.all([
    supabaseAdmin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("channel", "telegram")
      .in("event_type", eventTypes)
      .eq("status", "pending"),
    supabaseAdmin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("channel", "telegram")
      .in("event_type", eventTypes)
      .eq("status", "failed"),
    supabaseAdmin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("channel", "telegram")
      .in("event_type", eventTypes)
      .eq("status", "sent"),
  ]);

  return {
    pending: Number(pendingRes.count || 0),
    failed: Number(failedRes.count || 0),
    sent: Number(sentRes.count || 0),
  };
}

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") {
      return json({ ok: true });
    }

    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    try {
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length).trim()
        : "";

      if (!token) {
        return json({ error: "Unauthorized" }, 401);
      }

      const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
      if (!botToken) {
        throw new Error("TELEGRAM_BOT_TOKEN is missing");
      }

      const body = await req.json().catch(() => ({}));
      const bulkCompetitionResults = body?.competition_results === true;
      const retryFailed = body?.retry_failed === true;
      const requestedLimit = Number(body?.limit || 15);
      const batchLimit = Math.min(Math.max(requestedLimit, 1), 20);
      const applicationId = String(body?.application_id || "").trim();

      const supabaseAdmin = getAdminClient();
      const internalServerCall = token === getServerKey();
      let callerId = "";
      let isAdmin = internalServerCall;

      if (!internalServerCall) {
        const { data: userData, error: userError } =
          await supabaseAdmin.auth.getUser(token);

        if (userError || !userData?.user) {
          return json({ error: "Unauthorized" }, 401);
        }

        callerId = userData.user.id;
        const { data: adminRow } = await supabaseAdmin
          .from("admin_users")
          .select("user_id")
          .eq("user_id", callerId)
          .maybeSingle();

        isAdmin = Boolean(adminRow);
      }

      if (bulkCompetitionResults) {
        if (!isAdmin) {
          return json({ error: "Forbidden" }, 403);
        }

        const targetStatus = retryFailed ? "failed" : "pending";
        const eventTypes = [
          "competition_result",
          "competition_final_rejected",
          "certificate_issued",
        ];

        const { data: queue, error: queueError } = await supabaseAdmin
          .from("notifications")
          .select(
            "id,user_id,application_id,event_type,payload,status,attempts,created_at",
          )
          .eq("channel", "telegram")
          .in("event_type", eventTypes)
          .eq("status", targetStatus)
          .order("created_at", { ascending: true })
          .limit(batchLimit);

        if (queueError) throw queueError;

        const batch = await processQueue({
          supabaseAdmin,
          botToken,
          queue: (queue || []) as QueueItem[],
          callerId,
          isAdmin,
        });

        const delivery = await competitionDeliveryCounts(supabaseAdmin);

        return json({
          ok: batch.failed === 0,
          mode: retryFailed ? "retry_failed_results" : "competition_results",
          batch_sent: batch.sent,
          batch_failed: batch.failed,
          batch_skipped: batch.skipped,
          results: batch.results,
          pending: delivery.pending,
          failed: delivery.failed,
          sent: delivery.sent,
        });
      }

      if (!applicationId) {
        return json({ error: "application_id is required" }, 400);
      }

      const { data: application, error: applicationError } = await supabaseAdmin
        .from("applications")
        .select("id,user_id,number,status")
        .eq("id", applicationId)
        .maybeSingle();

      if (applicationError || !application) {
        return json({ error: "Application not found" }, 404);
      }

      const isOwner = application.user_id === callerId;
      if (!isAdmin && !isOwner) {
        return json({ error: "Forbidden" }, 403);
      }

      const { data: queue, error: queueError } = await supabaseAdmin
        .from("notifications")
        .select(
          "id,user_id,application_id,event_type,payload,status,attempts,created_at",
        )
        .eq("application_id", applicationId)
        .eq("channel", "telegram")
        .in("status", ["pending", "failed"])
        .order("created_at", { ascending: true });

      if (queueError) throw queueError;

      const batch = await processQueue({
        supabaseAdmin,
        botToken,
        queue: (queue || []) as QueueItem[],
        callerId,
        isAdmin,
      });

      return json({
        ok: batch.failed === 0,
        ...batch,
      });
    } catch (error) {
      console.error("[telegram-notify]", error);
      const message = error instanceof Error ? error.message : "Internal error";
      return json({ error: message }, 500);
    }
  },
};
