import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle } from "@phosphor-icons/react";
import { useAuth } from "../auth-context.jsx";
import { useLang } from "../lang-context.jsx";
import {
  wizard,
  CATEGORY_OPTIONS,
  PARTICIPANT_SCOPE_OPTIONS,
  GRADUATE_CATEGORIES,
} from "../wizard-content.js";
import {
  hasPaidCompetitionFee,
  loadDraft,
  saveDraft,
  listDocuments,
  submitApplication,
} from "../application-api.js";
import { PageHead, Section } from "../components/page-blocks.jsx";
import { Button } from "../components/ui.jsx";
import { Checkbox } from "../components/form.jsx";
import DocUploader from "../components/DocUploader.jsx";
import { grantSpecialtyOptions, grantUniversityOptions } from "../grant-catalog.js";
import { legalDocs } from "../legal-docs.js";
import { isSupabaseConfigured, supabase } from "../supabase.js";
import { createDraftSaveQueue } from "../draft-save-queue.js";


const SUPPORT_COPY = {
  ru: {
    title: "На какую поддержку вы подаёте заявку?",
    hint: "Выберите один основной вид поддержки для этой заявки.",
    grant: "Образовательный грант",
    grantHint: "Покрытие стоимости обучения по итогам конкурсного отбора.",
    scholarship: "Стипендия",
    scholarshipHint: "Ежемесячная финансовая поддержка по итогам конкурсного отбора.",
    universityLabel: "Выберите университет",
    universityPlaceholder: "Выберите университет",
    specialtyLabel: "Выберите специальность",
    specialtyPlaceholder: "Сначала выберите университет",
    specialtyChoose: "Выберите специальность",
    specialtyHint: "Показываются специальности выбранного университета. Медицинские и ветеринарные программы исключены условиями грантового трека.",
    grantRequired: "Для заявки на грант обязательно выберите университет и специальность.",
    supportRequired: "Выберите: образовательный грант или стипендия.",
    reviewTitle: "Выбранный вид поддержки",
    university: "Университет",
    specialty: "Специальность",
  },
  kk: {
    title: "Қай қолдау түріне өтінім бересіз?",
    hint: "Осы өтінім үшін бір негізгі қолдау түрін таңдаңыз.",
    grant: "Білім беру гранты",
    grantHint: "Конкурстық іріктеу қорытындысы бойынша оқу ақысын өтеу.",
    scholarship: "Стипендия",
    scholarshipHint: "Конкурстық іріктеу қорытындысы бойынша ай сайынғы қаржылық қолдау.",
    universityLabel: "Университетті таңдаңыз",
    universityPlaceholder: "Университетті таңдаңыз",
    specialtyLabel: "Мамандықты таңдаңыз",
    specialtyPlaceholder: "Алдымен университетті таңдаңыз",
    specialtyChoose: "Мамандықты таңдаңыз",
    specialtyHint: "Таңдалған университеттің мамандықтары ғана көрсетіледі. Медициналық және ветеринариялық бағдарламалар грант шарттарынан шығарылған.",
    grantRequired: "Грантқа өтінім беру үшін университет пен мамандықты міндетті түрде таңдаңыз.",
    supportRequired: "Білім беру грантын немесе стипендияны таңдаңыз.",
    reviewTitle: "Таңдалған қолдау түрі",
    university: "Университет",
    specialty: "Мамандық",
  },
};

const GRANT_UNIVERSITIES = grantUniversityOptions();

// Возраст по дате рождения.
function ageFrom(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

function normalizeCategory(value) {
  const legacy = {
    "Выпускник 9 класса": "grade_9",
    "9-сынып түлегі": "grade_9",
    "Выпускник 11 класса": "grade_11",
    "11-сынып түлегі": "grade_11",
    "Учащийся колледжа": "college",
    "Колледж студенті": "college",
    "Студент бакалавриата": "university",
    "Бакалавриат студенті": "university",
    "Студент университета": "university",
    "Университет студенті": "university",
    bachelor: "university",
  };

  return legacy[value] || value || "";
}

export default function Application() {
  const lang = useLang();
  const navigate = useNavigate();
  const t = wizard[lang];
  const supportCopy = SUPPORT_COPY[lang] || SUPPORT_COPY.ru;
  const categoryOptions = CATEGORY_OPTIONS[lang] || CATEGORY_OPTIONS.ru;
  const participantScopeOptions =
    PARTICIPANT_SCOPE_OPTIONS[lang] || PARTICIPANT_SCOPE_OPTIONS.ru;
  const { user, application, refreshApplication } = useAuth();

  const [step, setStep] = useState(0);
  const [appId, setAppId] = useState(null);
  const [birth, setBirth] = useState("");
  const [category, setCategory] = useState("");
  const [participantScope, setParticipantScope] = useState("kz_citizen");
  const [citizenshipCountry, setCitizenshipCountry] = useState("");
  const [supportType, setSupportType] = useState("");
  const [selectedUniversity, setSelectedUniversity] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState("");
  const [motivation, setMotivation] = useState("");
  const [consentData, setConsentData] = useState(false);
  const [consentTerms, setConsentTerms] = useState(false);
  const [docs, setDocs] = useState([]);
  const [saveState, setSaveState] = useState("");
  const [currentStatus, setCurrentStatus] = useState(application?.status || "draft");
  const [adminComment, setAdminComment] = useState(application?.admin_status_comment || "");
  const [loadingDraft, setLoadingDraft] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [allowsForeign, setAllowsForeign] = useState(false);
  const [cycleSubmissionOpen, setCycleSubmissionOpen] = useState(true);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const saveQueue = useRef(null);

  // Первичная загрузка черновика и документов.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const draft = await loadDraft(user.id);
      if (draft) {
        setAppId(draft.id);
        const d = draft.data || {};
        setBirth(d.birth || "");
        setCategory(normalizeCategory(d.category));
        setParticipantScope(d.participant_scope || "kz_citizen");
        setCitizenshipCountry(d.citizenship_country || "");
        setSupportType(d.support_type || "");
        setSelectedUniversity(d.university || "");
        setSelectedSpecialty(d.specialty || "");
        setMotivation(d.motivation || "");
        setConsentData(d.consent_data === true);
        setConsentTerms(d.consent_terms === true);
        setCurrentStatus(draft.status || "draft");
        setAdminComment(draft.admin_status_comment || "");
      }
      const list = await listDocuments(user.id);
      setDocs(list);
      setPaymentConfirmed(await hasPaidCompetitionFee(user.id));
      setLoadingDraft(false);
    })();
  }, [user]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    supabase
      .rpc("get_current_cycle_public_settings", { p_cycle_id: 2026 })
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active || error) return;
        setAllowsForeign(data?.allows_foreign_participants === true);
        const now = Date.now();
        setCycleSubmissionOpen(
          data?.status === "open" &&
            now >= new Date(data.applications_open_at).getTime() &&
            now <= new Date(data.applications_close_at).getTime()
        );
      });
    return () => {
      active = false;
    };
  }, []);

  // Быстрые изменения объединяются и сохраняются строго последовательно.
  useEffect(() => {
    if (!user?.id) return undefined;

    const queue = createDraftSaveQueue({
      save: (patch) => saveDraft(user.id, patch),
      onState: setSaveState,
    });
    saveQueue.current = queue;

    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") void queue.flush();
    };
    const protectUnsavedDraft = (event) => {
      if (!queue.hasUnsavedChanges()) return;
      void queue.flush();
      event.preventDefault();
      event.returnValue = "";
    };

    document.addEventListener("visibilitychange", flushWhenHidden);
    window.addEventListener("beforeunload", protectUnsavedDraft);

    return () => {
      document.removeEventListener("visibilitychange", flushWhenHidden);
      window.removeEventListener("beforeunload", protectUnsavedDraft);
      void queue.flush();
      queue.dispose();
      if (saveQueue.current === queue) saveQueue.current = null;
    };
  }, [user?.id]);

  const scheduleSave = (patch) => saveQueue.current?.schedule(patch);

  if (!user) return null;

  const age = ageFrom(birth);
  const isMinor = age !== null && age < 18;
  const ageEligible = age !== null && age >= 14 && age <= 25;
  const isGraduate = GRADUATE_CATEGORIES.includes(category);
  const specialtyOptions = grantSpecialtyOptions(selectedUniversity);

  const byKind = (k) => docs.filter((d) => d.kind === k);
  const setKind = (k) => (next) =>
    setDocs([...docs.filter((d) => d.kind !== k), ...next]);

  // Обязательные: удостоверение + успеваемость + выбранный вид поддержки.
  // Для гранта дополнительно обязательны университет и специальность.
  const hasIdentity = byKind("identity").length > 0;
  const hasMinorDocuments =
    byKind("birth_certificate").length > 0 &&
    byKind("guardian_identity").length > 0 &&
    byKind("guardian_consent").length > 0;
  const identityComplete = isMinor ? hasMinorDocuments : hasIdentity;
  const hasPerformance = byKind("performance").length > 0;
  const supportComplete =
    supportType === "scholarship" ||
    (supportType === "grant" && selectedUniversity && selectedSpecialty);
  const hasMotivation = Boolean(motivation.trim());
  const scopeComplete =
    participantScope === "kz_citizen" ||
    (allowsForeign &&
      participantScope === "foreign" &&
      Boolean(citizenshipCountry.trim()));
  const hasBaseData = Boolean(birth && category && scopeComplete && ageEligible);
  const consentsComplete = consentData && consentTerms;
  const canSubmit =
    hasBaseData &&
    identityComplete &&
    hasPerformance &&
    supportComplete &&
    hasMotivation &&
    consentsComplete &&
    (cycleSubmissionOpen || currentStatus === "needs_fixes");

  const editableStatuses = ["draft", "awaiting_payment", "ready_to_submit", "needs_fixes"];
  const isEditable = editableStatuses.includes(currentStatus);
  const isRevision = currentStatus === "needs_fixes";

  const onSubmit = async () => {
    if (!canSubmit || !isEditable) return;

    setSubmitError("");
    setSubmitting(true);
    await saveQueue.current?.flush();

    const saveResult = await saveDraft(user.id, {
      birth,
      category,
      participant_scope: participantScope,
      citizenship_country:
        participantScope === "foreign" ? citizenshipCountry.trim() : "Казахстан",
      support_type: supportType,
      university: supportType === "grant" ? selectedUniversity : "",
      specialty: supportType === "grant" ? selectedSpecialty : "",
      motivation,
      consent_data: consentData,
      consent_terms: consentTerms,
      consent_version: "2026-08-21-v1",
    });

    if (!saveResult.ok) {
      setSubmitting(false);
      setSubmitError(
        saveResult.error?.message ||
          (lang === "kk" ? "Өтінімді сақтау мүмкін болмады." : "Не удалось сохранить заявку.")
      );
      return;
    }

    if (!isRevision && !paymentConfirmed) {
      setSubmitting(false);
      navigate("/payment");
      return;
    }

    const result = await submitApplication();
    setSubmitting(false);

    if (result.ok) {
      setCurrentStatus("submitted");
      await refreshApplication();
      return;
    }

    if (result.code === "PAYMENT_REQUIRED") {
      setCurrentStatus("awaiting_payment");
      await refreshApplication();
      navigate("/payment");
      return;
    }

    setSubmitError(
      result.error?.message ||
        (lang === "kk" ? "Өтінімді жіберу мүмкін болмады." : "Не удалось отправить заявку.")
    );
  };

  if (loadingDraft) return null;

  if (!isEditable) {
    const lockedCopy = {
      ru: {
        title:
          currentStatus === "rejected"
            ? "Заявка отклонена."
            : currentStatus === "evaluation"
              ? "Заявка передана комиссии."
              : "Заявка отправлена.",
        text:
          currentStatus === "rejected"
            ? "Редактирование этой заявки закрыто."
            : currentStatus === "evaluation"
              ? "Комиссия приступила к оценке. Редактирование заявки закрыто."
              : "Заявка находится на рассмотрении. Редактирование временно закрыто.",
      },
      kk: {
        title:
          currentStatus === "rejected"
            ? "Өтінім қабылданбады."
            : currentStatus === "evaluation"
              ? "Өтінім комиссияға берілді."
              : "Өтінім жіберілді.",
        text:
          currentStatus === "rejected"
            ? "Бұл өтінімді редакциялау жабық."
            : currentStatus === "evaluation"
              ? "Комиссия бағалауға кірісті. Өтінімді редакциялау жабық."
              : "Өтінім қаралуда. Редакциялау уақытша жабық.",
      },
    }[lang];

    return (
      <>
        <PageHead label={t.label} title={lockedCopy.title} />
        <Section>
          <div className="max-w-[54ch] rounded-block border border-line bg-bg-2 p-8 lg:p-10">
            <CheckCircle
              size={30}
              weight="fill"
              aria-hidden="true"
              className="text-accent"
            />
            <p className="mt-5 text-base leading-relaxed text-ink-2">
              {lockedCopy.text}
            </p>

            {currentStatus === "rejected" && adminComment && (
              <div className="mt-6 rounded-2xl border border-red-400/40 bg-red-400/5 p-5">
                <p className="text-sm font-medium text-ink">
                  {lang === "kk" ? "Хатшылықтың түсіндірмесі" : "Причина решения"}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-2">
                  {adminComment}
                </p>
              </div>
            )}

            <Button to="/profile" className="mt-6">
              {t.toProfile}
            </Button>
          </div>
        </Section>
      </>
    );
  }

  return (
    <>
      <PageHead label={t.label} title={t.title} lead={t.lead} />
      <Section>
        {isRevision && (
          <div className="mb-8 max-w-[60ch] rounded-block border border-accent/50 bg-accent/5 p-6">
            <p className="font-display text-lg font-bold text-ink">{t.revisionTitle}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{t.revisionText}</p>
            {adminComment && (
              <div className="mt-4 rounded-2xl border border-line bg-bg p-4">
                <p className="text-xs uppercase tracking-[0.08em] text-muted">
                  {lang === "kk" ? "Хатшылықтың ескертуі" : "Комментарий секретариата"}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                  {adminComment}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Шаги */}
        <ol className="mb-10 flex flex-wrap gap-x-6 gap-y-2">
          {t.steps.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => setStep(i)}
                className={`text-sm font-medium transition-colors ${
                  i === step ? "text-accent" : i < step ? "text-ink" : "text-muted"
                }`}
              >
                {i + 1}. {label}
              </button>
            </li>
          ))}
        </ol>

        <div className="max-w-[60ch]">
          {/* Шаг 1: данные */}
          {step === 0 && (
            <div className="grid gap-6">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-ink">{t.birthLabel}</span>
                <input
                  type="date"
                  value={birth}
                  onChange={(e) => {
                    setBirth(e.target.value);
                    scheduleSave({ birth: e.target.value });
                  }}
                  className="w-full rounded-xl border border-line bg-bg px-4 py-3 text-ink"
                />
                <span className="text-sm text-muted">{t.birthHint}</span>
                {birth && !ageEligible && (
                  <span role="alert" className="text-sm text-red-300">
                    {t.ageError}
                  </span>
                )}
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-ink">{t.categoryLabel}</span>
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    scheduleSave({ category: e.target.value });
                  }}
                  className="w-full rounded-xl border border-line bg-bg px-4 py-3 text-ink"
                >
                  <option value="" disabled>
                    {lang === "kk" ? "Санатты таңдаңыз" : "Выберите категорию"}
                  </option>
                  {categoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="text-sm text-muted">{t.categoryFromProfile}</span>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-ink">
                  {t.participantScopeLabel}
                </span>
                <select
                  value={participantScope}
                  onChange={(event) => {
                    const next = event.target.value;
                    setParticipantScope(next);
                    if (next === "kz_citizen") setCitizenshipCountry("");
                    scheduleSave({
                      participant_scope: next,
                      citizenship_country: next === "kz_citizen" ? "Казахстан" : citizenshipCountry,
                    });
                  }}
                  className="w-full rounded-xl border border-line bg-bg px-4 py-3 text-ink"
                >
                  <option value="" disabled>
                    {lang === "kk" ? "Мәртебені таңдаңыз" : "Выберите статус"}
                  </option>
                  {participantScopeOptions
                    .filter((option) => option.value !== "foreign" || allowsForeign)
                    .map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                    ))}
                </select>
                {!allowsForeign && (
                  <span className="text-sm text-muted">
                    {t.currentCycleCitizensOnly}
                  </span>
                )}
              </label>

              {participantScope === "foreign" && (
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-ink">
                    {t.citizenshipCountryLabel}
                  </span>
                  <input
                    type="text"
                    value={citizenshipCountry}
                    onChange={(event) => {
                      setCitizenshipCountry(event.target.value);
                      scheduleSave({ citizenship_country: event.target.value });
                    }}
                    className="w-full rounded-xl border border-line bg-bg px-4 py-3 text-ink"
                  />
                  <span className="text-sm text-muted">
                    {t.citizenshipCountryHint}
                  </span>
                </label>
              )}

              <fieldset className="grid gap-3 border-t border-line pt-6">
                <legend className="text-sm font-medium text-ink">
                  {supportCopy.title}
                </legend>
                <p className="text-sm text-muted">{supportCopy.hint}</p>

                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    {
                      value: "grant",
                      title: supportCopy.grant,
                      hint: supportCopy.grantHint,
                    },
                    {
                      value: "scholarship",
                      title: supportCopy.scholarship,
                      hint: supportCopy.scholarshipHint,
                    },
                  ].map((option) => {
                    const active = supportType === option.value;
                    return (
                      <label
                        key={option.value}
                        className={`cursor-pointer rounded-2xl border p-4 transition-colors ${
                          active
                            ? "border-accent bg-accent/5"
                            : "border-line bg-bg hover:border-ink"
                        }`}
                      >
                        <span className="flex items-start gap-3">
                          <input
                            type="radio"
                            name="support-type"
                            value={option.value}
                            checked={active}
                            onChange={(e) => {
                              const next = e.target.value;
                              setSupportType(next);

                              if (next === "scholarship") {
                                setSelectedUniversity("");
                                setSelectedSpecialty("");
                                scheduleSave({
                                  support_type: next,
                                  university: "",
                                  specialty: "",
                                });
                              } else {
                                scheduleSave({ support_type: next });
                              }
                            }}
                            className="mt-1 accent-[var(--qz-accent)]"
                          />
                          <span>
                            <span className="block font-display text-base font-bold text-ink">
                              {option.title}
                            </span>
                            <span className="mt-1 block text-sm leading-relaxed text-muted">
                              {option.hint}
                            </span>
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {supportType === "grant" && (
                <div className="grid gap-6 rounded-block border border-line bg-bg-2 p-5 lg:p-6">
                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-ink">
                      {supportCopy.universityLabel}
                    </span>
                    <select
                      value={selectedUniversity}
                      onChange={(e) => {
                        const nextUniversity = e.target.value;
                        setSelectedUniversity(nextUniversity);
                        setSelectedSpecialty("");
                        scheduleSave({
                          university: nextUniversity,
                          specialty: "",
                        });
                      }}
                      className="w-full rounded-xl border border-line bg-bg px-4 py-3 text-ink"
                    >
                      <option value="">
                        {supportCopy.universityPlaceholder}
                      </option>
                      {GRANT_UNIVERSITIES.map((university) => (
                        <option key={university} value={university}>
                          {university}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-ink">
                      {supportCopy.specialtyLabel}
                    </span>
                    <select
                      value={selectedSpecialty}
                      disabled={!selectedUniversity}
                      onChange={(e) => {
                        setSelectedSpecialty(e.target.value);
                        scheduleSave({ specialty: e.target.value });
                      }}
                      className="w-full rounded-xl border border-line bg-bg px-4 py-3 text-ink disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">
                        {selectedUniversity
                          ? supportCopy.specialtyChoose
                          : supportCopy.specialtyPlaceholder}
                      </option>
                      {specialtyOptions.map((specialty) => (
                        <option key={specialty} value={specialty}>
                          {specialty}
                        </option>
                      ))}
                    </select>
                    <span className="text-sm text-muted">
                      {supportCopy.specialtyHint}
                    </span>
                  </label>

                  {(!selectedUniversity || !selectedSpecialty) && (
                    <p className="text-sm text-accent">
                      {supportCopy.grantRequired}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Шаг 2: документы */}
          {step === 1 && (
            <div className="grid gap-10">
              {/* Удостоверение или комплект несовершеннолетнего */}
              {!isMinor ? (
                <DocSection
                  title={t.identity.title}
                  badge={t.required}
                  desc={t.identity.adult}
                >
                  <DocUploader
                    userId={user.id}
                    applicationId={appId}
                    kind="identity"
                    files={byKind("identity")}
                    onChange={setKind("identity")}
                    t={t}
                  />
                </DocSection>
              ) : (
                <>
                  <p className="rounded-2xl border border-accent/40 bg-accent/5 p-4 text-sm leading-relaxed text-ink-2">
                    {t.identity.minor}
                  </p>
                  <DocSection
                    title={t.birthCertificate.title}
                    badge={t.required}
                    desc={t.birthCertificate.desc}
                  >
                    <DocUploader
                      userId={user.id}
                      applicationId={appId}
                      kind="birth_certificate"
                      files={byKind("birth_certificate")}
                      onChange={setKind("birth_certificate")}
                      t={t}
                    />
                  </DocSection>
                  <DocSection
                    title={t.guardianIdentity.title}
                    badge={t.required}
                    desc={t.guardianIdentity.desc}
                  >
                    <DocUploader
                      userId={user.id}
                      applicationId={appId}
                      kind="guardian_identity"
                      files={byKind("guardian_identity")}
                      onChange={setKind("guardian_identity")}
                      t={t}
                    />
                  </DocSection>
                  <DocSection
                    title={t.guardianConsent.title}
                    badge={t.required}
                    desc={t.guardianConsent.desc}
                  >
                    <DocUploader
                      userId={user.id}
                      applicationId={appId}
                      kind="guardian_consent"
                      files={byKind("guardian_consent")}
                      onChange={setKind("guardian_consent")}
                      t={t}
                    />
                  </DocSection>
                </>
              )}

              {/* Успеваемость */}
              <DocSection
                title={t.performance.title}
                badge={t.required}
                desc={isGraduate ? t.performance.graduate : t.performance.student}
              >
                <DocUploader
                  userId={user.id}
                  applicationId={appId}
                  kind="performance"
                  files={byKind("performance")}
                  onChange={setKind("performance")}
                  t={t}
                />
                <p className="mt-4 text-sm text-muted">{t.performance.ent}</p>
                <DocUploader
                  userId={user.id}
                  applicationId={appId}
                  kind="ent"
                  files={byKind("ent")}
                  onChange={setKind("ent")}
                  t={t}
                />
              </DocSection>

              {/* Иные документы */}
              <DocSection title={t.other.title} badge={t.optional} desc={t.other.desc}>
                <p className="text-sm text-muted">{t.other.examples}</p>
                <DocUploader
                  userId={user.id}
                  applicationId={appId}
                  kind="other"
                  multiple
                  files={byKind("other")}
                  onChange={setKind("other")}
                  t={t}
                />
              </DocSection>
            </div>
          )}

          {/* Шаг 3: мотивационное письмо */}
          {step === 2 && (
            <div className="grid gap-3">
              <h2 className="font-display text-xl font-bold tracking-tight">
                {t.motivationTitle}
              </h2>
              <p className="text-sm leading-relaxed text-ink-2">{t.motivationHint}</p>
              <textarea
                value={motivation}
                onChange={(e) => {
                  setMotivation(e.target.value);
                  scheduleSave({ motivation: e.target.value });
                }}
                placeholder={t.motivationPlaceholder}
                rows={14}
                className="mt-2 w-full resize-y rounded-block border border-line bg-bg px-4 py-3 text-ink leading-relaxed"
              />
              <p className="text-sm text-muted">{t.charCount(motivation.length)}</p>
            </div>
          )}

          {/* Шаг 4: проверка и оплата */}
          {step === 3 && (
            <div className="grid gap-8">
              <div>
                <h2 className="font-display text-xl font-bold tracking-tight">
                  {t.reviewTitle}
                </h2>
                <p className="mt-2 text-base leading-relaxed text-ink-2">{t.reviewText}</p>
              </div>

              <div className="rounded-block border border-line bg-bg-2 p-6 lg:p-8">
                <h3 className="font-display text-lg font-bold tracking-tight">
                  {supportCopy.reviewTitle}
                </h3>
                <dl className="mt-5 grid gap-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-3">
                    <dt className="text-sm text-muted">
                      {lang === "kk" ? "Қолдау түрі" : "Вид поддержки"}
                    </dt>
                    <dd className="font-display text-base font-medium text-ink">
                      {supportType === "grant"
                        ? supportCopy.grant
                        : supportType === "scholarship"
                          ? supportCopy.scholarship
                          : "—"}
                    </dd>
                  </div>

                  {supportType === "grant" && (
                    <>
                      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-3">
                        <dt className="text-sm text-muted">{supportCopy.university}</dt>
                        <dd className="max-w-[70%] text-right text-sm font-medium text-ink">
                          {selectedUniversity || "—"}
                        </dd>
                      </div>
                      <div className="flex flex-wrap items-baseline justify-between gap-3">
                        <dt className="text-sm text-muted">{supportCopy.specialty}</dt>
                        <dd className="max-w-[70%] text-right text-sm font-medium text-ink">
                          {selectedSpecialty || "—"}
                        </dd>
                      </div>
                    </>
                  )}
                </dl>
              </div>

              {/* Оплата требуется только при первичной подаче.
                  При доработке участник уже проходил этап оплаты, поэтому
                  повторно платить организационный взнос не нужно. */}
              {!isRevision ? (
                <div className="rounded-block border border-line bg-bg-2 p-6 lg:p-8">
                  <h3 className="font-display text-lg font-bold tracking-tight">
                    {t.paymentTitle}
                  </h3>
                  <div className="mt-5 rounded-2xl border border-line bg-bg p-5">
                    <p className="font-display text-base font-bold text-ink">
                      {paymentConfirmed ? t.paymentConfirmed : t.kaspiQr}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      {paymentConfirmed ? t.paymentConfirmedHint : t.kaspiQrHint}
                    </p>
                    {!paymentConfirmed && (
                      <Button to="/payment" className="mt-4">
                        {t.kaspiPay}
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-block border border-accent/40 bg-accent/5 p-6 lg:p-8">
                  <h3 className="font-display text-lg font-bold tracking-tight text-ink">
                    {lang === "kk"
                      ? "Қайта төлеу қажет емес"
                      : "Повторная оплата не требуется"}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-2">
                    {lang === "kk"
                      ? "Бұл өтінім бұрын берілген және ұйымдастыру жарнасын қайта төлеу талап етілмейді. Түзетулерді енгізіп, өтінімді қайта жіберіңіз."
                      : "Эта заявка уже была подана ранее. Организационный взнос повторно не оплачивается — внесите исправления и отправьте заявку повторно."}
                  </p>
                </div>
              )}

              <div className="grid gap-4 rounded-block border border-line bg-bg-2 p-6 lg:p-8">
                <Checkbox
                  checked={consentData}
                  onChange={(checked) => {
                    setConsentData(checked);
                    scheduleSave({ consent_data: checked });
                  }}
                >
                  <span>
                    {t.finalConsentData}{" "}
                    <a
                      href={legalDocs.soglasie.path}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-4 hover:text-accent"
                    >
                      {legalDocs.soglasie.short}
                    </a>
                  </span>
                </Checkbox>

                <Checkbox
                  checked={consentTerms}
                  onChange={(checked) => {
                    setConsentTerms(checked);
                    scheduleSave({
                      consent_terms: checked,
                      consent_version: "2026-08-21-v1",
                    });
                  }}
                >
                  <span>
                    {t.finalConsentTerms}{" "}
                    {["oferta", "programma", "otbor", "metodika"].map(
                      (key, index) => (
                        <span key={key}>
                          {index > 0 ? ", " : ""}
                          <a
                            href={legalDocs[key].path}
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-4 hover:text-accent"
                          >
                            {legalDocs[key].short}
                          </a>
                        </span>
                      )
                    )}
                  </span>
                </Checkbox>

                {!consentsComplete && (
                  <p className="text-sm text-accent">{t.consentRequired}</p>
                )}
              </div>

              {/* Чеклист обязательных документов */}
              <p className={`text-sm ${canSubmit ? "text-ink-2" : "text-accent"}`}>
                {!birth || !category || !participantScope
                  ? (lang === "kk"
                      ? "Туған күнді, санатты және қатысушы мәртебесін толтырыңыз."
                      : "Заполните дату рождения, категорию и статус участника.")
                  : !ageEligible
                    ? t.ageError
                  : !cycleSubmissionOpen && currentStatus !== "needs_fixes"
                    ? t.intakeClosed
                  : participantScope === "foreign" && !allowsForeign
                    ? t.currentCycleCitizensOnly
                  : participantScope === "foreign" && !citizenshipCountry.trim()
                    ? (lang === "kk" ? "Азаматтық елін көрсетіңіз." : "Укажите страну гражданства.")
                  : !supportType
                    ? supportCopy.supportRequired
                  : supportType === "grant" && (!selectedUniversity || !selectedSpecialty)
                    ? supportCopy.grantRequired
                    : !motivation.trim()
                      ? (lang === "kk"
                          ? "Мотивациялық хатты толтырыңыз."
                          : "Заполните мотивационное письмо.")
                      : !identityComplete || !hasPerformance
                        ? t.checklistMissing
                      : !consentsComplete
                        ? t.consentRequired
                      : canSubmit
                        ? t.checklistOk
                        : t.checklistMissing}
              </p>

              {submitError && (
                <p
                  role="alert"
                  className="rounded-2xl border border-red-400/40 bg-red-400/5 p-4 text-sm text-ink"
                >
                  {submitError}
                </p>
              )}

              <Button
                to="#"
                onClick={(e) => {
                  e.preventDefault();
                  onSubmit();
                }}
                className={`w-full sm:w-auto ${!canSubmit || submitting ? "pointer-events-none opacity-50" : ""}`}
              >
                {submitting
                  ? t.submitting
                  : isRevision
                    ? t.resubmit
                    : paymentConfirmed
                      ? t.submit
                      : t.payFirst}
              </Button>
            </div>
          )}
        </div>

        {/* Навигация + индикатор сохранения */}
        <div className="mt-10 flex max-w-[60ch] items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="text-sm text-ink-2 underline underline-offset-4 disabled:opacity-40"
          >
            {t.back}
          </button>
          <span className="text-sm text-muted" role="status" aria-live="polite">
            {saveState === "saving"
              ? t.saving
              : saveState === "saved"
                ? t.saved
                : saveState === "error"
                  ? t.saveError
                  : ""}
          </span>
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(t.steps.length - 1, s + 1))}
            disabled={step === t.steps.length - 1}
            className="text-sm text-ink underline underline-offset-4 disabled:opacity-40"
          >
            {t.next}
          </button>
        </div>
      </Section>
    </>
  );
}

function DocSection({ title, badge, desc, children }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>
        <span className="text-xs uppercase tracking-[0.08em] text-muted">{badge}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{desc}</p>
      {children}
    </div>
  );
}
