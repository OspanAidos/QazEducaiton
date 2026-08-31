export const TELEGRAM_PROVIDER = "custom:telegram";
export const TELEGRAM_BOT_USERNAME = "QazEducationBot";

function pickIdentityData(user) {
  const identities = Array.isArray(user?.identities) ? user.identities : [];
  const telegramIdentity = identities.find((identity) =>
    String(identity?.provider ?? "").toLowerCase().includes("telegram")
  );

  return telegramIdentity?.identity_data ?? {};
}

function asNonEmptyString(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text;
}

function normalizePhone(value) {
  const raw = asNonEmptyString(value);
  if (!raw) return "";

  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";

  return `+${digits}`;
}

export function isTelegramUser(user) {
  const provider = asNonEmptyString(user?.app_metadata?.provider).toLowerCase();
  if (provider.includes("telegram")) return true;

  return (user?.identities ?? []).some((identity) =>
    String(identity?.provider ?? "").toLowerCase().includes("telegram")
  );
}

export function extractTelegramClaims(user) {
  const metadata = user?.user_metadata ?? {};
  const identity = pickIdentityData(user);

  // Supabase может разместить OIDC claims либо в user_metadata,
  // либо в identity_data. Берём оба источника.
  const claims = {
    ...metadata,
    ...identity,
  };

  const fullName =
    asNonEmptyString(claims.name) ||
    asNonEmptyString(claims.full_name);

  const nameParts = fullName.split(/\s+/).filter(Boolean);

  const firstName =
    asNonEmptyString(claims.given_name) ||
    asNonEmptyString(claims.first_name) ||
    nameParts[0] ||
    "";

  const lastName =
    asNonEmptyString(claims.family_name) ||
    asNonEmptyString(claims.last_name) ||
    nameParts.slice(1).join(" ") ||
    "";

  const telegramUserId =
    asNonEmptyString(claims.id) ||
    asNonEmptyString(claims.telegram_user_id) ||
    asNonEmptyString(claims.sub);

  return {
    firstName,
    lastName,
    phone: normalizePhone(claims.phone_number ?? claims.phone),
    telegramUserId,
    telegramUsername:
      asNonEmptyString(claims.preferred_username) ||
      asNonEmptyString(claims.username),
    telegramPhotoUrl:
      asNonEmptyString(claims.picture) ||
      asNonEmptyString(claims.avatar_url),
  };
}
