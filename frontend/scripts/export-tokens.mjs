// يولّد رموز ألوان تطبيق Flutter من رموز الويب نفسها (frontend/src/styles/index.css) — ADR-0023.
// الويب مرجع التصميم: أي تعديل لون يُعدَّل في CSS ثم يُعاد التوليد، ولا يُكتب لون يدوياً في Dart.
//   node frontend/scripts/export-tokens.mjs          ← يكتب mobile_flutter/lib/theme/tokens.g.dart
//   node frontend/scripts/export-tokens.mjs --check  ← يفشل إن لم يطابق الملف المصدر (CI)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const css = readFileSync(new URL("../src/styles/index.css", import.meta.url), "utf8");
const out = fileURLToPath(new URL("../../mobile_flutter/lib/theme/tokens.g.dart", import.meta.url));

/** متغيّرات كتلة CSS تبدأ بمحدِّد معيّن. */
function block(selector) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`لم يُعثر على ${selector}`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const light = block(":root");
const dark = block(':root[data-theme="dark"]');
const camel = (n) => n.replace(/-(\w)/g, (_, c) => c.toUpperCase());
const color = (hex) => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`لون غير مدعوم: ${hex}`);
  return `Color(0xFF${full.toUpperCase()})`;
};
/** linear-gradient(<deg>deg, c1 p1%, c2 p2%, …) ← LinearGradient بنفس الاتجاه والمحطات. */
const gradient = (value) => {
  const m = /linear-gradient\((\d+)deg,\s*(.+)\)$/.exec(value);
  if (!m) throw new Error(`تدرّج غير مدعوم: ${value}`);
  const rad = (Number(m[1]) * Math.PI) / 180;
  const [x, y] = [Math.sin(rad), -Math.cos(rad)].map((n) => Number(n.toFixed(4)));
  const stops = [...m[2].matchAll(/(#[0-9a-f]{3,6})\s+(\d+)%/gi)];
  return `LinearGradient(begin: Alignment(${-x}, ${-y}), end: Alignment(${x}, ${y}), colors: [${stops.map((s) => color(s[1])).join(", ")}], stops: [${stops.map((s) => Number(s[2]) / 100).join(", ")}])`;
};

const names = Object.keys(light).filter((k) => k !== "dawn");
for (const k of [...names, "dawn"]) if (!(k in dark)) throw new Error(`--${k} غير معرّف في الوضع الليلي`);

const instance = (vars) =>
  `SanadTokens(\n${names.map((k) => `    ${camel(k)}: ${color(vars[k])},`).join("\n")}\n    dawn: ${gradient(vars.dawn)},\n  )`;

const dart = `// مولَّد من frontend/src/styles/index.css بـ frontend/scripts/export-tokens.mjs — لا يُعدَّل يدوياً (ADR-0023).
// ignore_for_file: prefer_const_constructors, lines_longer_than_80_chars

import 'package:flutter/painting.dart';

/// رموز «سكينة الفجر» — نفس قيم الويب حرفياً.
class SanadTokens {
  const SanadTokens({
${names.map((k) => `    required this.${camel(k)},`).join("\n")}
    required this.dawn,
  });

${names.map((k) => `  final Color ${camel(k)};`).join("\n")}
  final LinearGradient dawn;

  static const light = ${instance(light)};

  static const dark = ${instance(dark)};
}
`;

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(out, "utf8").replace(/\r\n/g, "\n");
  } catch {
    /* غير موجود */
  }
  if (current !== dart) {
    console.error("tokens.g.dart لا يطابق index.css — شغّل: node frontend/scripts/export-tokens.mjs");
    process.exit(1);
  }
  console.log("رموز Flutter مطابقة للويب ✓");
} else {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, dart);
  console.log(`كُتب ${out} (${names.length} لوناً + تدرّج الفجر)`);
}
