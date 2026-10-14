// الحزمة المشتركة تُستهلك من الويب (Vite) والجوال (Metro) مباشرة من المصدر، فلا يجوز أن تستورد أي حزمة خارجية:
// كل استيراد خارج الاختبارات يجب أن يكون نسبياً.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const bad = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "__tests__") walk(p);
    } else if (/\.tsx?$/.test(e.name)) {
      for (const [, spec] of readFileSync(p, "utf8").matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g))
        if (!spec.startsWith(".")) bad.push(`${p}: ${spec}`);
    }
  }
};
walk(new URL("../src", import.meta.url).pathname);
if (bad.length) {
  console.error("استيراد خارجي ممنوع في packages/shared:\n" + bad.join("\n"));
  process.exit(1);
}
console.log("packages/shared: لا اعتمادات خارجية ✓");
