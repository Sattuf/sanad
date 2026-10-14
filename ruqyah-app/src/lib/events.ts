import { companionApi } from "../api/companion";
import { hasApi } from "../api/client";
import { getState } from "../state/store";
import { load, save } from "./storage";

/*
  مؤشرات مجهولة تماماً (product-spec.md §7): اسم حدث وبُعد واحد فقط من قائمة يقبلها الخادم — لا معرّف ولا نص كتبه المستخدم.
  تُجمع على الجهاز وتُرسل دفعة واحدة، ويمكن إيقافها من «حسابي».
*/
export type EventName =
  | "plan_started" | "wird_completed" | "plan_completed" | "khatma_juz_done" | "khatma_completed"
  | "khatma_invite_accepted" | "safety_page_opened" | "first_open";

const KEY = "events";

export function track(name: EventName, dimension: string) {
  if (!hasApi || !getState().anonymousStats) return;
  const queue = load<{ name: string; dimension: string }[]>(KEY, []);
  if (queue.length >= 100) return;
  queue.push({ name, dimension });
  save(KEY, queue);
}

export async function flushEvents() {
  if (!hasApi) return;
  const queue = load<{ name: string; dimension: string }[]>(KEY, []);
  if (queue.length === 0) return;
  if (!getState().anonymousStats) {
    save(KEY, []);
    return;
  }
  const batch = queue.slice(0, 20);
  try {
    await companionApi.events(batch);
    save(KEY, queue.slice(batch.length));
  } catch {
    /* يُعاد لاحقاً */
  }
}
