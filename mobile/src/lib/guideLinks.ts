import type { Href } from "expo-router";

/** روابط أزرار الأدلة مكتوبة بمسارات الويب — تُترجم لمسارات التطبيق. ما لا يُعرف يعود null. */
export function guideTarget(to: string): Href | null {
  const [path, query = ""] = to.split("?");
  if (path === "/emergency") return "/emergency";
  if (path === "/directory") {
    const track = new URLSearchParams(query).get("track");
    return track ? { pathname: "/directory", params: { track } } : "/directory";
  }
  const guide = /^\/(?:health|ruqyah\/guide)\/([\w-]+)$/.exec(path);
  if (guide) return { pathname: "/guide/[id]", params: { id: guide[1] } };
  return null;
}
