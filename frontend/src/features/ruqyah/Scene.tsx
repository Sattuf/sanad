import { motion, useReducedMotion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { cx } from "../../lib/cx";
import type { SceneTheme } from "./content";

/*
  خلفيات «الرقية والتحصين»: ثلاث طبقات — صورة المشهد (public/library/<theme>.jpg، مولَّدة بلا أي نص)،
  تدرّج لوني يضمن تباين النص ويبقى وحده إن لم تتوفر الصورة، ونقش هندسي إسلامي SVG خفيف.
  النص القرآني لا يُرسم داخل الصور أبداً: يُكتب فوقها بخط حقيقي حتى لا يُشوَّه حرف من كتاب الله.
*/

/** overlay يضمن تباين النص فوق الصورة، وbase يحلّ محلّها إن لم تتوفر. */
const tints: Record<SceneTheme, { overlay: string; base: string }> = {
  lantern: {
    overlay: "linear-gradient(115deg, rgba(6,24,28,.35) 0%, rgba(6,24,28,.78) 55%, rgba(4,14,18,.92) 100%), radial-gradient(circle at 18% 40%, rgba(242,198,117,.35), transparent 45%)",
    base: "linear-gradient(160deg, #0b2e33, #07151c)",
  },
  dawn: {
    overlay: "linear-gradient(180deg, rgba(20,34,40,.15) 0%, rgba(14,30,36,.55) 55%, rgba(8,20,26,.9) 100%)",
    base: "linear-gradient(180deg, #f0c98c 0%, #c98f5a 40%, #28515a 100%)",
  },
  dusk: {
    overlay: "linear-gradient(180deg, rgba(10,14,34,.2) 0%, rgba(10,14,34,.65) 60%, rgba(6,9,22,.92) 100%), radial-gradient(circle at 75% 20%, rgba(242,198,117,.3), transparent 30%)",
    base: "linear-gradient(180deg, #1c2452 0%, #0e3a45 100%)",
  },
  night: {
    overlay: "linear-gradient(180deg, rgba(4,8,20,.3) 0%, rgba(4,8,20,.75) 60%, rgba(3,6,14,.94) 100%), radial-gradient(circle at 70% 25%, rgba(236,233,226,.22), transparent 25%)",
    base: "linear-gradient(180deg, #0a1030 0%, #050814 100%)",
  },
  mihrab: {
    overlay: "linear-gradient(180deg, rgba(10,30,30,.25) 0%, rgba(8,26,26,.7) 60%, rgba(5,16,16,.93) 100%), radial-gradient(ellipse at 50% 30%, rgba(242,198,117,.3), transparent 50%)",
    base: "linear-gradient(180deg, #2c4f4a 0%, #0c1f1e 100%)",
  },
  manuscript: {
    overlay: "linear-gradient(90deg, rgba(6,20,22,.35) 0%, rgba(6,20,22,.8) 60%, rgba(4,14,16,.94) 100%), radial-gradient(circle at 25% 50%, rgba(242,198,117,.28), transparent 45%)",
    base: "linear-gradient(160deg, #203c3a, #081614)",
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
    <div className={cx("relative isolate overflow-hidden text-[#f4efe4]", className)}>
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
