import { motion, useReducedMotion } from "framer-motion";

/*
  لغة الحركة (references/13-visual-motion-design.md): مصباح دافئ متنفّس.
  transform/opacity فقط (لا Layout)، واحترام prefers-reduced-motion إلزامي.
  لا تُستخدم إطلاقاً في محرري الملاحظة/التوصية.
*/

export function AnimatedLamp({ size = 176 }: { size?: number }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative flex items-center justify-center" style={{ width: size * 2, height: size * 2 }} aria-hidden>
      <motion.div
        className="absolute rounded-full"
        style={{ width: size * 2, height: size * 2, background: "radial-gradient(circle, color-mix(in srgb, var(--lamp-glow) 45%, transparent) 0%, transparent 65%)" }}
        animate={reduce ? { opacity: 0.8 } : { opacity: [0.55, 1, 0.55], scale: [0.95, 1.05, 0.95] }}
        transition={reduce ? { duration: 0 } : { duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <LampGlyph size={size * 0.62} />
    </div>
  );
}

/** رسم المصباح بـ SVG صرف — بلا صور خارجية. */
function LampGlyph({ size }: { size: number }) {
  const reduce = useReducedMotion();
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className="relative">
      <defs>
        <radialGradient id="flame" cx="50%" cy="60%" r="50%">
          <stop offset="0" stopColor="#fff6dc" />
          <stop offset="0.55" stopColor="var(--lamp-glow)" />
          <stop offset="1" stopColor="var(--lamp-glow)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <motion.ellipse
        cx="60" cy="44" rx="10" ry="16" fill="url(#flame)"
        style={{ transformOrigin: "60px 58px" }}
        animate={reduce ? undefined : { scaleY: [1, 1.12, 0.94, 1], scaleX: [1, 0.94, 1.04, 1] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      />
      <path d="M40 62 h40 l-6 30 h-28 z" fill="none" stroke="var(--lamp-glow)" strokeWidth="3" strokeLinejoin="round" opacity="0.9" />
      <path d="M50 62 q10 -8 20 0" fill="none" stroke="var(--lamp-glow)" strokeWidth="3" strokeLinecap="round" />
      <path d="M38 98 h44" stroke="var(--lamp-glow)" strokeWidth="3" strokeLinecap="round" />
      <path d="M60 18 v-8" stroke="var(--lamp-glow)" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}
