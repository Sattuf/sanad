/** localStorage قد يرمي (تصفّح خاص، تخزين محظور) — كل وصول ملفوف، والواجهة تعمل بدونه. */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* تجاهل */
  }
}

export function removeKey(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* تجاهل */
  }
}
