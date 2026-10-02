import { useSyncExternalStore } from "react";
import { companionApi, type ServerPlan } from "../api/companion";
import { hasApi } from "../api/client";
import { load, save } from "../lib/storage";
import { fromServerPlan, listPlans, setRemotePlans, type Plan } from "./plans";

/*
  كتالوج الخطط: المنشور من الخادم (معدّ بإذن مسجَّل، مراجعة ثانية، فحص أمان) يُجلب ويُحفظ على الجهاز ليعمل دون إنترنت.
  الخطة التي يسجّل فيها المستخدم تبقى محفوظة ولو استُبدلت بإصدار أحدث، حتى يكمل نسخته.
*/
const KEY = "catalog";
const listeners = new Set<() => void>();
let version = 0;

function apply(raw: ServerPlan[]) {
  setRemotePlans(raw.map(fromServerPlan).filter((p): p is Plan => p !== null));
  version++;
  listeners.forEach((l) => l());
}

apply(load<ServerPlan[]>(KEY, []));

/** يجلب المنشور ويُبقي المحفوظ للخطة النشطة إن لم تعد في القائمة (مستبدلة أو سُحب الاتصال). */
export async function refreshCatalog(keepId?: string | null) {
  if (!hasApi) return;
  try {
    const summaries = await companionApi.plans();
    const details = await Promise.all(summaries.map((s) => companionApi.plan(s.id)));
    const cached = load<ServerPlan[]>(KEY, []);
    if (keepId && !details.some((d) => d.id === keepId)) {
      const kept = cached.find((c) => c.id === keepId) ?? (await companionApi.plan(keepId).catch(() => null));
      if (kept) details.push(kept);
    }
    save(KEY, details);
    apply(details);
  } catch {
    /* دون اتصال: يبقى المحفوظ */
  }
}

export function useCatalog(): Plan[] {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  return listPlans();
}
