import { useRef, useState } from "react";
import { FilePlus, File as FileIcon, Trash, ArrowSquareOut } from "@phosphor-icons/react";
import { uploadDocument, deleteDocument, signedUrl } from "../application-api.js";

const MAX_SIZE = 15 * 1024 * 1024; // 15 МБ
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);
const ALLOWED_EXTENSIONS = /\.(pdf|jpe?g|png)$/i;

/**
 * Загрузчик документов одного типа (kind). Показывает список уже
 * загруженных файлов и кнопку добавления. Несколько файлов, если
 * multiple. Всё идёт в Supabase Storage через application-api.
 */
export default function DocUploader({
  userId,
  applicationId,
  kind,
  multiple = false,
  files,
  onChange,
  t,
}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pick = () => inputRef.current?.click();

  const onFiles = async (e) => {
    const chosen = Array.from(e.target.files || []);
    e.target.value = ""; // сброс, чтобы можно было выбрать тот же файл снова
    if (chosen.length === 0) return;
    setError("");
    setBusy(true);
    const added = [];
    for (const file of chosen) {
      if (!ALLOWED_EXTENSIONS.test(file.name) || (file.type && !ALLOWED_MIME_TYPES.has(file.type))) {
        setError(t.fileTypeInvalid);
        continue;
      }
      if (file.size > MAX_SIZE) {
        setError(t.fileTooBig);
        continue;
      }
      const res = await uploadDocument(userId, applicationId, kind, file);
      if (res.ok) added.push(res.doc);
    }
    setBusy(false);
    if (added.length) onChange([...files, ...added]);
  };

  const onRemove = async (doc) => {
    setBusy(true);
    const res = await deleteDocument(doc);
    setBusy(false);
    if (res.ok) onChange(files.filter((f) => f.id !== doc.id));
  };

  const onOpen = async (doc) => {
    const url = await signedUrl(doc.storage_path);
    if (url) window.open(url, "_blank", "noopener");
  };

  const canAdd = multiple || files.length === 0;

  return (
    <div className="mt-4">
      {files.length > 0 && (
        <ul className="mb-3 grid gap-2">
          {files.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-bg px-4 py-3"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2.5">
                <FileIcon size={18} aria-hidden="true" className="shrink-0 text-muted" />
                <span className="truncate text-sm text-ink">{doc.file_name}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => onOpen(doc)}
                  aria-label={t.view}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:text-ink"
                >
                  <ArrowSquareOut size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(doc)}
                  aria-label={t.remove}
                  disabled={busy}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:text-accent disabled:opacity-50"
                >
                  <Trash size={16} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {canAdd && (
        <button
          type="button"
          onClick={pick}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2.5 text-sm text-ink transition-colors hover:border-ink disabled:opacity-50"
        >
          <FilePlus size={16} aria-hidden="true" />
          {busy ? t.uploading : t.upload}
        </button>
      )}

      {files.length === 0 && !canAdd && (
        <p className="text-sm text-muted">{t.noFiles}</p>
      )}
      {error && <p className="mt-2 text-sm text-accent">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={onFiles}
        className="hidden"
      />
    </div>
  );
}
