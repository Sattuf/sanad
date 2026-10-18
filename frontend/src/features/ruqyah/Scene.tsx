import { motion, useReducedMotion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { cx } from "../../lib/cx";
import type { SceneTheme } from "@sanad/shared/content/ruqyah";

/*
  خلفيات «الرقية والتحصين»: ثلاث طبقات — صورة المشهد (public/library/<theme>.jpg، مولَّدة بلا أي نص)،
  تدرّج لوني يضمن تباين النص (وأغمق في جهة النص للمشاهد الساطعة) ويبقى وحده إن لم تتوفر الصورة، ونقش هندسي إسلامي SVG خفيف.
  النص القرآني لا يُرسم داخل الصور أبداً: يُكتب فوقها بخط حقيقي حتى لا يُشوَّه حرف من كتاب الله.
*/

/** لون رمز بشفافية — الألوان كلها من رموز --scene-* في index.css (ومنها تُولَّد لتطبيق Flutter). */
const mix = (token: string, alpha: number) => `color-mix(in srgb, var(--scene-${token}) ${alpha * 100}%, transparent)`;

/** overlay يضمن تباين النص فوق الصورة، وbase يحلّ محلّها إن لم تتوفر. */
const tints: Record<SceneTheme, { overlay: string; base: string }> = {
  lantern: {
    overlay: `linear-gradient(115deg, ${mix("lantern-a", 0.35)} 0%, ${mix("lantern-a", 0.78)} 55%, ${mix("lantern-b", 0.92)} 100%), radial-gradient(circle at 18% 40%, ${mix("gold", 0.35)}, transparent 45%)`,
    base: "linear-gradient(160deg, var(--scene-lantern-base-1), var(--scene-lantern-base-2))",
  },
  dawn: {
    overlay: `linear-gradient(to left, ${mix("dawn-a", 0.72)} 0%, ${mix("dawn-a", 0.35)} 55%, transparent 100%), linear-gradient(180deg, ${mix("dawn-b", 0.25)} 0%, ${mix("dawn-c", 0.6)} 55%, ${mix("dawn-a", 0.9)} 100%)`,
    base: "linear-gradient(180deg, var(--scene-dawn-base-1) 0%, var(--scene-dawn-base-2) 40%, var(--scene-dawn-base-3) 100%)",
  },
  dusk: {
    overlay: `linear-gradient(180deg, ${mix("dusk-a", 0.2)} 0%, ${mix("dusk-a", 0.65)} 60%, ${mix("dusk-b", 0.92)} 100%), radial-gradient(circle at 75% 20%, ${mix("gold", 0.3)}, transparent 30%)`,
    base: "linear-gradient(180deg, var(--scene-dusk-base-1) 0%, var(--scene-dusk-base-2) 100%)",
  },
  night: {
    overlay: `linear-gradient(180deg, ${mix("night-a", 0.3)} 0%, ${mix("night-a", 0.75)} 60%, ${mix("night-b", 0.94)} 100%), radial-gradient(circle at 70% 25%, ${mix("moon", 0.22)}, transparent 25%)`,
    base: "linear-gradient(180deg, var(--scene-night-base-1) 0%, var(--scene-night-base-2) 100%)",
  },
  mihrab: {
    overlay: `linear-gradient(to left, ${mix("mihrab-a", 0.75)} 0%, ${mix("mihrab-a", 0.4)} 55%, transparent 100%), linear-gradient(180deg, ${mix("mihrab-b", 0.35)} 0%, ${mix("mihrab-c", 0.7)} 60%, ${mix("mihrab-a", 0.93)} 100%), radial-gradient(ellipse at 50% 30%, ${mix("gold", 0.2)}, transparent 50%)`,
    base: "linear-gradient(180deg, var(--scene-mihrab-base-1) 0%, var(--scene-mihrab-base-2) 100%)",
  },
  manuscript: {
    overlay: `linear-gradient(90deg, ${mix("manuscript-a", 0.35)} 0%, ${mix("manuscript-a", 0.8)} 60%, ${mix("manuscript-b", 0.94)} 100%), radial-gradient(circle at 25% 50%, ${mix("gold", 0.28)}, transparent 45%)`,
    base: "linear-gradient(160deg, var(--scene-manuscript-base-1), var(--scene-manuscript-base-2))",
  },
};

/** نجمة ثمانية متكررة بخط ذهبي رفيع — تُستخدم كنقش خافت فوق كل مشهد. */
const pattern =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Cg fill='none' stroke='%23f2c675' stroke-width='0.8' opacity='0.55'%3E%3Cpath d='M40 8 L49 31 L72 40 L49 49 L40 72 L31 49 L8 40 L31 31 Z'/%3E%3Crect x='22' y='22' width='36' height='36' transform='rotate(45 40 40)'/%3E%3Crect x='22' y='22' width='36' height='36'/%3E%3C/g%3E%3C/svg%3E\")";

function sceneStyle(theme: SceneTheme): CSSProperties {
  return {
    backgroundImage: `${tints[theme].overlay}, url(/library/${theme}.jpg), ${tints[theme].base}`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
}

export function Scene({ theme, className, children, pan = false }: { theme: SceneTheme; className?: string; children: ReactNode; pan?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div className={cx("relative isolate overflow-hidden text-[var(--scene-text)]", className)}>
      {/* الصورة + التدرّج: حركة «كين برنز» بطيئة جداً تمنح المشهد حياة دون تشتيت */}
      <motion.div
        className="absolute inset-0 -z-10"
        style={sceneStyle(theme)}
        animate={pan && !reduce ? { scale: [1.04, 1.12, 1.04], x: ["0%", "-2%", "0%"] } : undefined}
        transition={pan && !reduce ? { duration: 40, repeat: Infinity, ease: "easeInOut" } : undefined}
        aria-hidden
      />
      <div className="absolute inset-0 -z-10 opacity-[0.12] mix-blend-screen" style={{ backgroundImage: pattern, backgroundSize: "80px 80px" }} aria-hidden />
      {children}
    </div>
  );
}

/** زخرفة فاصلة ذهبية بين الأقسام (نجمة بين خطين). */
export function Ornament({ className }: { className?: string }) {
  return (
    <div className={cx("flex items-center justify-center gap-3 text-lamp", className)} aria-hidden>
      <span className="h-px w-16 bg-gradient-to-l from-current to-transparent opacity-60" />
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1l3 7.5L22.5 12 15 15l-3 7.5L9 15 1.5 12 9 8.5z" /></svg>
      <span className="h-px w-16 bg-gradient-to-r from-current to-transparent opacity-60" />
    </div>
  );
}
