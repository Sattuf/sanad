import AsyncStorage from "@react-native-async-storage/async-storage";

/*
  تخزين محلي غير حساس (تقدّم الورد، إعدادات التذكير). الأسرار في SecureStore فقط (stores/session.ts).
  كل الأخطاء تُبتلع: التخزين راحة، لا شرط لعمل التطبيق.
*/
export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* تجاهل */
  }
}

/** حذف مفاتيح بادئة معيّنة عدا ما يُستثنى — لتنظيف تقدّم الأيام الماضية. */
export async function pruneKeys(prefix: string, keep: (key: string) => boolean): Promise<void> {
  try {
    const stale = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(prefix) && !keep(k));
    if (stale.length) await AsyncStorage.multiRemove(stale);
  } catch {
    /* تجاهل */
  }
}
