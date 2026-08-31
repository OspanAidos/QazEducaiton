import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "./supabase.js";
import { finishTelegramBotAuth } from "./telegram-bot-auth.js";

const AuthContext = createContext(null);
const APPLICATION_FIELDS =
  "id,number,status,progress,deadline,decision,result_published_at,appeal_deadline,admin_status_comment,admin_action_type,admin_action_at,data,submitted_at,resubmitted_at,created_at,updated_at,terms_accepted_at,terms_version";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [application, setApplication] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCommission, setIsCommission] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null);
      return null;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select(
        "first_name,last_name,phone,lang,category,telegram_user_id,telegram_chat_id,telegram_username,telegram_connected_at"
      )
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("loadProfile:", error);
      return null;
    }

    setProfile(data ?? null);
    return data ?? null;
  }, []);

  const loadRoles = useCallback(async (userId) => {
    if (!userId) {
      setIsAdmin(false);
      setIsCommission(false);
      return { admin: false, commission: false };
    }

    const [adminRes, commissionRes] = await Promise.all([
      supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("commission_members")
        .select("user_id")
        .eq("user_id", userId)
        .eq("active", true)
        .maybeSingle(),
    ]);

    const admin = !adminRes.error && Boolean(adminRes.data);
    const commission = !commissionRes.error && Boolean(commissionRes.data);

    setIsAdmin(admin);
    setIsCommission(commission);

    return { admin, commission };
  }, []);

  const loadApplication = useCallback(async (userId) => {
    if (!userId) {
      setApplication(null);
      return;
    }

    const { data, error } = await supabase
      .from("applications")
      .select(APPLICATION_FIELDS)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("loadApplication:", error);
      return;
    }

    if (data) {
      setApplication(data);
      return;
    }

    const number =
      "QE-" + new Date().getFullYear() + "-" + String(Date.now()).slice(-6);

    const { data: created, error: createError } = await supabase
      .from("applications")
      .insert({ user_id: userId, number, status: "draft", progress: 0 })
      .select(APPLICATION_FIELDS)
      .maybeSingle();

    if (createError) {
      console.error("create application:", createError);
    }

    setApplication(
      created ?? { number, status: "draft", progress: 0, deadline: null }
    );
  }, []);

  const loadSessionUser = useCallback(
    async (nextSession) => {
      const user = nextSession?.user ?? null;
      const uid = user?.id;

      if (!uid) {
        setProfile(null);
        setApplication(null);
        setIsAdmin(false);
        setIsCommission(false);
        return;
      }

      const roles = await loadRoles(uid);
      await loadProfile(uid);

      if (roles.admin || roles.commission) {
        setApplication(null);
        return;
      }

      await loadApplication(uid);
    },
    [loadApplication, loadProfile, loadRoles]
  );

  const refreshApplication = useCallback(
    () => loadApplication(session?.user?.id),
    [loadApplication, session]
  );

  const refreshProfile = useCallback(
    () => loadProfile(session?.user?.id),
    [loadProfile, session]
  );

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;

      const nextSession = data.session ?? null;
      setSession(nextSession);
      await loadSessionUser(nextSession);

      if (active) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      // Не выполняем await/Supabase-запросы прямо внутри auth callback:
      // это может привести к deadlock в supabase-js.
      const nextSession = next ?? null;
      setSession(nextSession);

      window.setTimeout(() => {
        void loadSessionUser(nextSession);
      }, 0);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadSessionUser]);

  const completeTelegramBotLogin = useCallback(async (
    tokenHash,
    { recordRegistrationConsents = false, profileNames } = {}
  ) => {
    const result = await finishTelegramBotAuth(tokenHash);

    if (!result.ok) return result;

    if (result.data?.session) {
      setSession(result.data.session);
    }

    if (result.data?.user?.id) {
      if (recordRegistrationConsents) {
        const { data: registrationData, error: consentError } = await supabase.rpc(
          "complete_participant_registration",
          {
            p_first_name: profileNames?.firstName?.trim() || "",
            p_last_name: profileNames?.lastName?.trim() || "",
            p_terms_version: "2026-08-21-v1",
          }
        );

        if (consentError || registrationData?.ok === false) {
          console.error(
            "Не удалось завершить регистрацию:",
            consentError?.message || registrationData?.error
          );
          await supabase.auth.signOut();
          setSession(null);
          return {
            ok: false,
            error: consentError || new Error("Не удалось сохранить имя и фамилию."),
          };
        }
      }

      window.setTimeout(() => {
        void loadSessionUser(result.data.session ?? null);
      }, 0);
    }

    return result;
  }, [loadSessionUser]);

  // Служебный вход администратора/комиссии остаётся через email + пароль.
  const signIn = useCallback(async ({ email, password }) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) return { ok: false, error };
    return { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setApplication(null);
    setIsAdmin(false);
    setIsCommission(false);
  }, []);

  const resetPassword = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/update-password`,
    });

    if (error) return { ok: false, error };
    return { ok: true };
  }, []);

  const updatePassword = useCallback(async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { ok: false, error };
    return { ok: true };
  }, []);

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      profile,
      application,
      refreshApplication,
      refreshProfile,
      isAdmin,
      isCommission,
      loading,
      completeTelegramBotLogin,
      signIn,
      signOut,
      resetPassword,
      updatePassword,
    }),
    [
      session,
      profile,
      application,
      refreshApplication,
      refreshProfile,
      isAdmin,
      isCommission,
      loading,
      completeTelegramBotLogin,
      signIn,
      signOut,
      resetPassword,
      updatePassword,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth используется вне AuthProvider");
  }

  return context;
}
