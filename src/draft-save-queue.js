/**
 * Последовательно сохраняет черновик и объединяет быстрые изменения полей.
 * Это предотвращает потерю первого поля, когда пользователь меняет несколько
 * значений быстрее интервала автосохранения или работает через медленную сеть.
 */
export function createDraftSaveQueue({ save, onState = () => {}, delay = 700 }) {
  let timer = null;
  let pendingPatch = {};
  let running = null;
  let disposed = false;

  const hasPending = () => Object.keys(pendingPatch).length > 0;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const flush = async () => {
    clearTimer();

    if (running) {
      await running;
      return hasPending() ? flush() : null;
    }

    if (!hasPending()) return null;

    const patch = pendingPatch;
    pendingPatch = {};

    running = Promise.resolve()
      .then(() => save(patch))
      .catch((error) => ({ ok: false, error }));

    const result = await running;
    running = null;

    if (!disposed) onState(result?.ok ? "saved" : "error");

    if (!result?.ok) {
      // Не теряем данные при временном сетевом сбое. Более новые значения
      // тех же полей имеют приоритет и будут отправлены при следующем flush.
      pendingPatch = { ...patch, ...pendingPatch };
      return result;
    }

    return hasPending() ? flush() : result;
  };

  const schedule = (patch) => {
    if (disposed || !patch || typeof patch !== "object") return;
    pendingPatch = { ...pendingPatch, ...patch };
    onState("saving");
    clearTimer();
    timer = setTimeout(() => void flush(), delay);
  };

  const dispose = () => {
    disposed = true;
    clearTimer();
  };

  return {
    schedule,
    flush,
    dispose,
    hasUnsavedChanges: () => hasPending() || Boolean(running),
  };
}
