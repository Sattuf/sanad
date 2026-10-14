// التقدّم كله محلي على الجهاز. لا حساب ولا خادم، ولا يُخزَّن أي شيء عن حال المستخدم.
const PREFIX = "sanad:";

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* وضع التصفح الخاص أو امتلاء التخزين: يستمر التطبيق في الذاكرة */
  }
}
