import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createQrMatrix } from "../supabase/functions/_shared/qrcode.js";
import {
  CERTIFICATE_HEIGHT,
  CERTIFICATE_TEMPLATE_VERSION,
  CERTIFICATE_WIDTH,
  buildCertificateSvg,
  certificateDate,
  certificateFilename,
  certificateRecipient,
} from "../supabase/functions/_shared/certificate-template.js";

const sample = {
  id: "123e4567-e89b-42d3-a456-426614174111",
  certificate_type: "participant",
  certificate_number: "QE-2026-P-000001",
  verification_token: "123e4567-e89b-42d3-a456-426614174000",
  recipient_first_name: "Айдос",
  recipient_last_name: "Оспан",
  issued_at: "2026-09-04T12:00:00+05:00",
  basis_text: null,
  metadata: {},
};

const assets = {
  logo: "data:image/png;base64,AA==",
  signatureSeal: "data:image/png;base64,AA==",
};

test("certificate identity and A4 filename are stable", () => {
  assert.equal(CERTIFICATE_WIDTH, 3508);
  assert.equal(CERTIFICATE_HEIGHT, 2480);
  assert.equal(CERTIFICATE_TEMPLATE_VERSION, "2026-v2-server");
  assert.equal(certificateRecipient(sample), "Айдос Оспан");
  assert.equal(certificateDate(sample.issued_at), "04.09.2026");
  assert.equal(
    certificateFilename(sample, "pdf"),
    "QE-2026-P-000001-participant.pdf",
  );
});

test("verification QR is a real square matrix for the public URL", () => {
  const url = `https://qazeducation.kz/certificate/${sample.verification_token}`;
  const matrix = createQrMatrix(url, "M");
  assert.ok(matrix.length >= 21);
  assert.ok(matrix.every((row) => row.length === matrix.length));
  assert.ok(matrix.flat().some(Boolean));
  assert.ok(matrix.flat().some((value) => !value));
});

test("all four server templates render dynamic data and escape XML", () => {
  const variants = {
    participant: ["УЧАСТНИКА", "успешную подачу заявки"],
    grant: ["ОБРАЗОВАТЕЛЬНЫЙ ГРАНТ", "Вуз: Академия права"],
    scholarship: ["СТИПЕНДИЯ 50 000 ₸", "СТИПЕНДИАТА"],
    top30: ["КАДРОВЫЙ РЕЗЕРВ TOP-30", "ФИНАЛИСТА"],
  };

  for (const [type, expected] of Object.entries(variants)) {
    const svg = buildCertificateSvg({
      ...sample,
      certificate_type: type,
      recipient_last_name: "Оспан & Сын",
      basis_text: "Протокол №12 <05.09.2026>",
      metadata: { university: "Академия права", specialty: "Юриспруденция" },
    }, assets);
    assert.match(svg, /width="3508" height="2480"/);
    assert.match(svg, /ОСПАН &amp; СЫН/);
    assert.doesNotMatch(svg, /<05\.09\.2026>/);
    assert.match(svg, /data:image\/png;base64/);
    for (const value of expected) assert.ok(svg.includes(value));
  }
});

test("database issuance is private, paid, idempotent and stores award details", async () => {
  const sql = await readFile("../supabase/certificates-server-v2.sql", "utf8");
  assert.match(sql, /qz_has_competition_access\(app\.user_id\)/);
  assert.match(sql, /certificates_one_active_type_idx/);
  assert.match(sql, /qz_next_certificate_number/);
  assert.match(sql, /verify_certificate/);
  assert.match(sql, /scholarship_amount_tenge'[\s\S]{0,120}50000/);
  assert.match(sql, /'university',[\s\S]{0,100}app\.data ->> 'university'/);
  assert.match(sql, /qazeducation-certificates-private/);
  assert.match(sql, /public = false/);
  assert.match(sql, /grant execute on function public\.verify_certificate\(uuid\) to anon, authenticated/);
  assert.doesNotMatch(sql, /returns table \([\s\S]{0,500}(phone|telegram|email)/i);
});

test("download function requires an authenticated owner and server-only assets", async () => {
  const [edge, client, panel, telegram] = await Promise.all([
    readFile("../supabase/functions/certificate-file/index.ts", "utf8"),
    readFile("../src/certificate-files.js", "utf8"),
    readFile("../src/components/CertificatesPanel.jsx", "utf8"),
    readFile("../supabase/functions/telegram-notify/index.ts", "utf8"),
  ]);

  assert.match(edge, /auth\.getUser\(token\)/);
  assert.match(edge, /certificate\.user_id === authData\.user\.id/);
  assert.match(edge, /certificate\.status !== "active"/);
  assert.match(edge, /qazeducation-certificates-private/);
  assert.match(edge, /jsr:@nick\/resvg@0\.1\.0-rc\.1/);
  assert.match(edge, /PDFDocument/);
  assert.match(client, /functions\.invoke\("certificate-file"/);
  assert.match(panel, /certificate-files\.js/);
  assert.doesNotMatch(panel, /certificate-renderer/);
  assert.match(telegram, /case "certificate_issued"/);

  await assert.rejects(access("../public/certificates/signature-seal.png"));
  await assert.rejects(access("../src/certificate-renderer.js"));
  await assert.rejects(access("../src/vendor/qrcode.js"));
});

test("release keeps the scholarship quota at 30", async () => {
  const [admin, resultsSql] = await Promise.all([
    readFile("../src/pages/Admin.jsx", "utf8"),
    readFile("../supabase/competition-results-v1.sql", "utf8"),
  ]);

  assert.match(admin, /value="30 мест"/);
  assert.match(admin, /quota="30 стипендий"/);
  assert.match(resultsSql, /scholarship_quota integer not null default 30/);
  assert.match(resultsSql, /set scholarship_quota = 30/);
});
