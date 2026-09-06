import { createQrMatrix } from "./qrcode.js";

export const CERTIFICATE_WIDTH = 3508;
export const CERTIFICATE_HEIGHT = 2480;
export const CERTIFICATE_TEMPLATE_VERSION = "2026-v2-server";

const COLORS = {
  ink: "#101917",
  green: "#063a30",
  darkGreen: "#032d25",
  gold: "#cfa648",
  ivory: "#f5f1e8",
  champagne: "#e6c986",
  graphite: "#222424",
  border: "#c8c1b5",
  muted: "#747975",
};

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function validDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function certificateDate(value) {
  const date = validDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Almaty",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function certificateYear(value) {
  const date = validDate(value);
  if (!date) return 2026;
  return Number(new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Almaty",
    year: "numeric",
  }).format(date));
}

export function certificateRecipient(certificate) {
  return [certificate?.recipient_first_name, certificate?.recipient_last_name]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
}

export function certificateFilename(certificate, format = "pdf") {
  const type = ["participant", "grant", "scholarship", "top30"].includes(
    certificate?.certificate_type,
  ) ? certificate.certificate_type : "certificate";
  const number = String(certificate?.certificate_number || "QazEducation")
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .replace(/-+/g, "-");
  return `${number}-${type}.${format === "png" ? "png" : "pdf"}`;
}

function splitLines(value, maxChars, maxLines = 3) {
  const words = String(value || "").trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = `${current} ${word}`.trim();
    if (!current || next.length <= maxChars) {
      current = next;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);

  if (lines.length <= maxLines) return lines;
  const clipped = lines.slice(0, maxLines);
  clipped[maxLines - 1] = `${clipped[maxLines - 1].slice(0, Math.max(1, maxChars - 1)).trim()}…`;
  return clipped;
}

function textLines(lines, { x, y, size, lineHeight, fill, weight = 400, family = "DejaVu Sans", anchor = "start" }) {
  const tspans = lines.map((line, index) =>
    `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
  ).join("");
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${escapeXml(family)}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${tspans}</text>`;
}

function nameBlock(certificate, fill) {
  const recipient = certificateRecipient(certificate).toUpperCase();
  const lines = splitLines(recipient, 30, 2);
  const size = lines.length > 1 ? 82 : recipient.length > 28 ? 92 : 116;
  return textLines(lines, {
    x: 980,
    y: lines.length > 1 ? 760 : 820,
    size,
    lineHeight: size + 22,
    fill,
    family: "DejaVu Serif",
  });
}

function qrPath(payload, x, y, size) {
  const matrix = createQrMatrix(payload, "M");
  const quiet = 4;
  const total = matrix.length + quiet * 2;
  const cell = Math.floor(size / total);
  const actual = cell * total;
  const startX = x + Math.floor((size - actual) / 2) + quiet * cell;
  const startY = y + Math.floor((size - actual) / 2) + quiet * cell;
  const commands = [];

  matrix.forEach((row, rowIndex) => {
    row.forEach((dark, columnIndex) => {
      if (!dark) return;
      const px = startX + columnIndex * cell;
      const py = startY + rowIndex * cell;
      commands.push(`M${px} ${py}h${cell}v${cell}h-${cell}z`);
    });
  });

  return [
    `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#ffffff" stroke="${COLORS.gold}" stroke-width="4"/>`,
    `<path d="${commands.join("")}" fill="${COLORS.ink}"/>`,
    `<text x="${x + size / 2}" y="${y + size + 38}" fill="${COLORS.ink}" font-family="DejaVu Sans" font-size="23" font-weight="700" text-anchor="middle">ПРОВЕРКА ПОДЛИННОСТИ</text>`,
  ].join("");
}

function commonSide(assets, sideColor, year) {
  return [
    `<rect x="55" y="55" width="765" height="2370" fill="${sideColor}"/>`,
    `<rect x="807" y="55" width="13" height="2370" fill="${COLORS.gold}"/>`,
    `<image x="210" y="180" width="455" height="455" preserveAspectRatio="xMidYMid meet" href="${assets.logo}"/>`,
    `<text x="438" y="725" fill="${COLORS.gold}" font-family="DejaVu Sans" font-size="52" text-anchor="middle">QazEducation</text>`,
    `<text x="438" y="2175" fill="${COLORS.gold}" font-family="DejaVu Sans" font-size="142" font-weight="700" text-anchor="middle">${year}</text>`,
  ].join("");
}

function commonFooter(certificate, assets, verifyUrl, { color = COLORS.ink, organizerY = 1650, signatureY = 1635, metaY = 2070, qrY = 1935 } = {}) {
  return [
    textLines(["Организатор: ТОО «Business", "International Group Partners»"], {
      x: 980, y: organizerY, size: 31, lineHeight: 44, fill: color,
    }),
    `<image x="1565" y="${signatureY}" width="640" height="360" preserveAspectRatio="xMidYMid meet" href="${assets.signatureSeal}"/>`,
    textLines(["Руководитель", "Жунусов Нуржан", "Кожабекович"], {
      x: 2170, y: signatureY + 150, size: 31, lineHeight: 45, fill: color,
    }),
    textLines([
      `Сертификат № ${certificate.certificate_number}`,
      `Дата выдачи: ${certificateDate(certificate.issued_at)}`,
    ], { x: 980, y: metaY, size: 29, lineHeight: 45, fill: color }),
    qrPath(verifyUrl, 2982, qrY, 300),
  ].join("");
}

function basisBlock(certificate, y, fill) {
  const basis = certificate.basis_text || "Решение конкурсной комиссии";
  return textLines(splitLines(`Основание: ${basis}`, 79, 2), {
    x: 980, y, size: 29, lineHeight: 39, fill,
  });
}

function participant(certificate, assets, verifyUrl) {
  return [
    `<rect width="3508" height="2480" fill="${COLORS.ivory}"/>`,
    commonSide(assets, COLORS.darkGreen, certificateYear(certificate.issued_at)),
    `<text x="980" y="350" fill="${COLORS.darkGreen}" font-family="DejaVu Sans" font-size="164" font-weight="700">СЕРТИФИКАТ</text>`,
    `<text x="980" y="500" fill="${COLORS.gold}" font-family="DejaVu Sans" font-size="116" font-weight="700">УЧАСТНИКА</text>`,
    nameBlock(certificate, COLORS.ink),
    textLines([
      "Настоящий сертификат подтверждает участие в образовательной",
      "программе QazEducation 2026 и успешную подачу заявки.",
      "Ваше стремление к знаниям и развитию — первый шаг",
      "к новым возможностям.",
    ], { x: 980, y: 1030, size: 34, lineHeight: 49, fill: COLORS.ink }),
    commonFooter(certificate, assets, verifyUrl, {
      organizerY: 1570, signatureY: 1635, metaY: 2035, qrY: 1935,
    }),
  ].join("");
}

function grant(certificate, assets, verifyUrl) {
  const university = certificate.metadata?.university;
  const specialty = certificate.metadata?.specialty;
  const award = [];
  if (university) award.push(...splitLines(`Вуз: ${university}`, 67, 2));
  if (specialty) award.push(...splitLines(`Специальность: ${specialty}`, 67, 2));

  return [
    `<rect width="3508" height="2480" fill="${COLORS.green}"/>`,
    commonSide(assets, COLORS.darkGreen, certificateYear(certificate.issued_at)),
    `<text x="980" y="335" fill="${COLORS.ivory}" font-family="DejaVu Sans" font-size="157" font-weight="700">СЕРТИФИКАТ</text>`,
    `<text x="980" y="470" fill="${COLORS.gold}" font-family="DejaVu Sans" font-size="103" font-weight="700">ПОБЕДИТЕЛЯ</text>`,
    `<text x="980" y="555" fill="${COLORS.ivory}" font-family="DejaVu Sans" font-size="41" font-weight="700">ОБРАЗОВАТЕЛЬНЫЙ ГРАНТ</text>`,
    nameBlock(certificate, COLORS.ivory),
    textLines([
      "Настоящий сертификат подтверждает присуждение образовательного",
      "гранта по результатам конкурсного отбора программы QazEducation 2026.",
    ], { x: 980, y: 1010, size: 31, lineHeight: 44, fill: COLORS.ivory }),
    award.length ? textLines(award, {
      x: 980, y: 1160, size: 30, lineHeight: 42, fill: COLORS.ivory, weight: 700,
    }) : "",
    `<rect x="820" y="1510" width="2633" height="915" fill="${COLORS.ivory}"/>`,
    basisBlock(certificate, 1605, COLORS.ink),
    commonFooter(certificate, assets, verifyUrl, {
      organizerY: 1740, signatureY: 1650, metaY: 2070, qrY: 1980,
    }),
  ].join("");
}

function scholarship(certificate, assets, verifyUrl) {
  return [
    `<rect width="3508" height="2480" fill="${COLORS.champagne}"/>`,
    commonSide(assets, COLORS.darkGreen, certificateYear(certificate.issued_at)),
    `<text x="980" y="335" fill="${COLORS.darkGreen}" font-family="DejaVu Sans" font-size="157" font-weight="700">СЕРТИФИКАТ</text>`,
    `<text x="980" y="475" fill="#6e4d1a" font-family="DejaVu Sans" font-size="102" font-weight="700">СТИПЕНДИАТА</text>`,
    `<text x="980" y="560" fill="${COLORS.darkGreen}" font-family="DejaVu Sans" font-size="40" font-weight="700">СТИПЕНДИЯ 50 000 ₸</text>`,
    nameBlock(certificate, COLORS.ink),
    textLines([
      "Настоящий сертификат подтверждает присуждение стипендии",
      "по результатам конкурсного отбора программы QazEducation 2026.",
      "Пусть эта поддержка поможет раскрыть способности",
      "и достичь поставленных целей.",
    ], { x: 980, y: 1010, size: 31, lineHeight: 44, fill: COLORS.ink }),
    basisBlock(certificate, 1510, COLORS.ink),
    commonFooter(certificate, assets, verifyUrl, {
      organizerY: 1660, signatureY: 1570, metaY: 2070, qrY: 1980,
    }),
  ].join("");
}

function top30(certificate, assets, verifyUrl) {
  return [
    `<rect width="3508" height="2480" fill="${COLORS.graphite}"/>`,
    commonSide(assets, "#171a19", certificateYear(certificate.issued_at)),
    `<text x="980" y="335" fill="${COLORS.ivory}" font-family="DejaVu Sans" font-size="157" font-weight="700">СЕРТИФИКАТ</text>`,
    `<text x="980" y="475" fill="${COLORS.gold}" font-family="DejaVu Sans" font-size="105" font-weight="700">ФИНАЛИСТА</text>`,
    `<text x="980" y="560" fill="${COLORS.ivory}" font-family="DejaVu Sans" font-size="40" font-weight="700">КАДРОВЫЙ РЕЗЕРВ TOP-30</text>`,
    nameBlock(certificate, COLORS.ivory),
    textLines([
      "Настоящий сертификат подтверждает включение в кадровый резерв",
      "финалистов Top-30 программы QazEducation 2026.",
      "Пусть признание вашего потенциала станет стимулом",
      "для дальнейшего развития и новых достижений.",
    ], { x: 980, y: 1010, size: 31, lineHeight: 44, fill: COLORS.ivory }),
    `<rect x="820" y="1510" width="2633" height="915" fill="${COLORS.ivory}"/>`,
    basisBlock(certificate, 1605, COLORS.ink),
    commonFooter(certificate, assets, verifyUrl, {
      organizerY: 1740, signatureY: 1650, metaY: 2070, qrY: 1980,
    }),
  ].join("");
}

export function buildCertificateSvg(certificate, assets, options = {}) {
  if (!certificate?.certificate_number || !certificate?.verification_token) {
    throw new Error("certificate_identity_missing");
  }
  if (!assets?.logo || !assets?.signatureSeal) {
    throw new Error("certificate_assets_missing");
  }

  const type = certificate.certificate_type;
  const renderer = { participant, grant, scholarship, top30 }[type];
  if (!renderer) throw new Error("certificate_type_invalid");

  const verifyBaseUrl = String(
    options.verifyBaseUrl || "https://qazeducation.kz/certificate",
  ).replace(/\/+$/, "");
  const verifyUrl = `${verifyBaseUrl}/${encodeURIComponent(certificate.verification_token)}`;

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CERTIFICATE_WIDTH}" height="${CERTIFICATE_HEIGHT}" viewBox="0 0 ${CERTIFICATE_WIDTH} ${CERTIFICATE_HEIGHT}">`,
    `<title>${escapeXml(`Сертификат ${certificate.certificate_number}`)}</title>`,
    renderer(certificate, assets, verifyUrl),
    `<rect x="55" y="55" width="3398" height="2370" fill="none" stroke="${COLORS.border}" stroke-width="3"/>`,
    `</svg>`,
  ].join("");
}
