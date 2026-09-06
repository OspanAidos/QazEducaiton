import { createClient } from "npm:@supabase/supabase-js@^2";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { render } from "jsr:@nick/resvg@0.1.0-rc.1";
import {
  CERTIFICATE_HEIGHT,
  CERTIFICATE_TEMPLATE_VERSION,
  CERTIFICATE_WIDTH,
  buildCertificateSvg,
  certificateFilename,
} from "../_shared/certificate-template.js";

const PRIVATE_BUCKET = "qazeducation-certificates-private";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { ...corsHeaders, "Cache-Control": "no-store" },
  });
}

function getServerKey() {
  let key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeysRaw) {
    try {
      key = JSON.parse(secretKeysRaw)?.default || key;
    } catch {
      // Compatibility with projects that still expose SERVICE_ROLE_KEY.
    }
  }
  if (!key) throw new Error("supabase_server_key_missing");
  return key;
}

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) throw new Error("supabase_url_missing");
  return createClient(url, getServerKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function tokenFromRequest(request: Request) {
  return (request.headers.get("Authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function downloadBytes(db: ReturnType<typeof adminClient>, path: string) {
  const { data, error } = await db.storage.from(PRIVATE_BUCKET).download(path);
  if (error || !data) throw new Error(`private_asset_missing:${path}`);
  return new Uint8Array(await data.arrayBuffer());
}

type CertificateAssets = {
  logo: string;
  signatureSeal: string;
  regularFont: Uint8Array;
  boldFont: Uint8Array;
  serifFont: Uint8Array;
};

let assetsPromise: Promise<CertificateAssets> | null = null;

function loadAssets(db: ReturnType<typeof adminClient>) {
  if (assetsPromise) return assetsPromise;
  assetsPromise = Promise.all([
    downloadBytes(db, "assets/logo-mark.png"),
    downloadBytes(db, "assets/signature-seal.png"),
    downloadBytes(db, "assets/DejaVuSans.ttf"),
    downloadBytes(db, "assets/DejaVuSans-Bold.ttf"),
    downloadBytes(db, "assets/DejaVuSerif.ttf"),
  ]).then(([logo, signatureSeal, regularFont, boldFont, serifFont]) => ({
    logo: `data:image/png;base64,${toBase64(logo)}`,
    signatureSeal: `data:image/png;base64,${toBase64(signatureSeal)}`,
    regularFont,
    boldFont,
    serifFont,
  })).catch((error) => {
    assetsPromise = null;
    throw error;
  });
  return assetsPromise;
}

async function cachedFile(db: ReturnType<typeof adminClient>, path: string) {
  const { data, error } = await db.storage.from(PRIVATE_BUCKET).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

async function cacheFile(
  db: ReturnType<typeof adminClient>,
  path: string,
  bytes: Uint8Array,
  contentType: string,
) {
  const { error } = await db.storage.from(PRIVATE_BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
    cacheControl: "31536000",
  });
  if (error) console.warn("certificate-file: cache write failed", error.message);
}

async function renderPng(db: ReturnType<typeof adminClient>, certificate: any) {
  const cachePath = `rendered/${CERTIFICATE_TEMPLATE_VERSION}/${certificate.id}.png`;
  const cached = await cachedFile(db, cachePath);
  if (cached) return cached;

  const assets = await loadAssets(db);
  const verifyBaseUrl = Deno.env.get("CERTIFICATE_VERIFY_BASE_URL") ||
    "https://qazeducation.kz/certificate";
  const svg = buildCertificateSvg(certificate, assets, { verifyBaseUrl });
  const bytes = render(svg, {
    dpi: 300,
    languages: ["ru", "kk", "en"],
    fontFamily: "DejaVu Sans",
    fontFaces: [
      {
        kind: "sans-serif",
        name: "DejaVu Sans",
        weight: 400,
        style: "normal",
        data: assets.regularFont,
      },
      {
        kind: "sans-serif",
        name: "DejaVu Sans",
        weight: 700,
        style: "normal",
        data: assets.boldFont,
      },
      {
        kind: "serif",
        name: "DejaVu Serif",
        weight: 400,
        style: "normal",
        data: assets.serifFont,
      },
    ],
    imageRendering: "optimizeQuality",
    textRendering: "optimizeLegibility",
  });
  await cacheFile(db, cachePath, bytes, "image/png");
  return bytes;
}

async function renderPdf(db: ReturnType<typeof adminClient>, certificate: any) {
  const cachePath = `rendered/${CERTIFICATE_TEMPLATE_VERSION}/${certificate.id}.pdf`;
  const cached = await cachedFile(db, cachePath);
  if (cached) return cached;

  const png = await renderPng(db, certificate);
  const document = await PDFDocument.create();
  const page = document.addPage([841.89, 595.28]);
  const image = await document.embedPng(png);
  page.drawImage(image, { x: 0, y: 0, width: 841.89, height: 595.28 });
  document.setTitle(`QazEducation ${certificate.certificate_number}`);
  document.setAuthor("ТОО «Business International Group Partners»");
  document.setCreator("QazEducation server certificate service");
  document.setCreationDate(new Date(certificate.issued_at));
  const bytes = await document.save({ useObjectStreams: true });
  await cacheFile(db, cachePath, bytes, "application/pdf");
  return bytes;
}

function fileResponse(bytes: Uint8Array, filename: string, format: string) {
  const headers = new Headers(corsHeaders);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Content-Type", format === "pdf" ? "application/pdf" : "application/octet-stream");
  headers.set("Content-Disposition", `attachment; filename="${filename}"`);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Certificate-Format", format);
  return new Response(bytes, { status: 200, headers });
}

export default {
  fetch: async (request: Request) => {
    if (request.method === "OPTIONS") return json({ ok: true });
    if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

    try {
      const token = tokenFromRequest(request);
      if (!token) return json({ ok: false, error: "authentication_required" }, 401);

      const db = adminClient();
      const { data: authData, error: authError } = await db.auth.getUser(token);
      if (authError || !authData.user) {
        return json({ ok: false, error: "authentication_required" }, 401);
      }

      const body = await request.json().catch(() => null);
      const certificateId = String(body?.certificate_id || "").trim();
      const format = body?.format === "png" ? "png" : body?.format === "pdf" ? "pdf" : "";
      if (!UUID_PATTERN.test(certificateId) || !format) {
        return json({ ok: false, error: "invalid_request" }, 400);
      }

      const { data: certificate, error: certificateError } = await db
        .from("certificates")
        .select("id,user_id,application_id,certificate_type,certificate_number,verification_token,recipient_first_name,recipient_last_name,basis_text,status,issued_at,metadata")
        .eq("id", certificateId)
        .maybeSingle();
      if (certificateError) throw certificateError;
      if (!certificate) return json({ ok: false, error: "certificate_not_found" }, 404);

      let allowed = certificate.user_id === authData.user.id;
      if (!allowed) {
        const { data: admin } = await db
          .from("admin_users")
          .select("user_id")
          .eq("user_id", authData.user.id)
          .maybeSingle();
        allowed = Boolean(admin);
      }
      if (!allowed) return json({ ok: false, error: "forbidden" }, 403);
      if (certificate.status !== "active") {
        return json({ ok: false, error: "certificate_revoked" }, 410);
      }

      const bytes = format === "png"
        ? await renderPng(db, certificate)
        : await renderPdf(db, certificate);
      return fileResponse(bytes, certificateFilename(certificate, format), format);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      if (message.startsWith("private_asset_missing:")) {
        console.error("certificate-file: private assets are not installed");
        return json({ ok: false, error: "certificate_assets_not_installed" }, 503);
      }
      console.error("certificate-file: render failed", message);
      return json({ ok: false, error: "certificate_render_failed" }, 500);
    }
  },
};
