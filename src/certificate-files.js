import { certificateFilename } from "./certificate-domain.js";
import { supabase } from "./supabase.js";

async function requestCertificate(certificate, format) {
  const safeFormat = format === "png" ? "png" : "pdf";
  const { data, error } = await supabase.functions.invoke("certificate-file", {
    body: {
      certificate_id: certificate?.id,
      format: safeFormat,
    },
  });

  if (error) throw error;
  if (!(data instanceof Blob)) throw new Error("Некорректный ответ сервера сертификатов");

  return new Blob([data], {
    type: safeFormat === "png" ? "image/png" : "application/pdf",
  });
}

export async function certificatePreviewUrl(certificate) {
  const blob = await requestCertificate(certificate, "png");
  return URL.createObjectURL(blob);
}

export async function downloadCertificate(certificate, format = "pdf") {
  const safeFormat = format === "png" ? "png" : "pdf";
  const blob = await requestCertificate(certificate, safeFormat);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = certificateFilename(certificate, safeFormat);
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
