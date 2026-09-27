# المرحلة 13 — لغة الحركة البصرية (Motion) في React

هذا الملف يضيف طبقة حركة واحترافية بصرية فوق `10-frontend-architecture.md`، دون تعديل أي قرار معماري أو أمني سابق. الهدف: واجهة أجمل وأكثر حيوية (مستوحاة من تصميم "Lamp Login Animation" الذي أرسلته كمرجع)، **مبنية من الصفر بـ React مع Framer Motion**، لا الكود الأصلي (Vanilla JS/HTML) الذي كان في المرجع — ذلك الكود يبقى إلهاماً بصرياً فقط، لا مصدراً يُنسَخ.

## 13.1 لماذا Framer Motion تحديداً

React لا "يحرّك" DOM يدوياً (`classList.add`, `setTimeout`) كما في الكود المرجعي — الحركة في React تُعبَّر عنها كدالة من الحالة (State)، وFramer Motion هي المكتبة المعيارية لذلك: تعريف حركة كـ Props على المكوّن نفسه (`initial`, `animate`, `transition`)، لا كود إجرائي منفصل. أضِفها في `09-project-scaffold-commands.md` كحزمة أمامية:

```bash
cd frontend && npm install framer-motion
```

## 13.2 تحويل تصميم "المصباح" إلى مكوّن React فعلي

بنية `LoginScreen.tsx` (تستبدل أي تصميم دخول سابق، مع الحفاظ الكامل على `AuthMethodPicker` من `10-frontend-architecture.md` §10.4 — الحركة تُضاف حول المنطق الوظيفي، لا بدلاً عنه):

```tsx
// features/auth/LoginScreen.tsx
import { motion } from "framer-motion";

export function LoginScreen() {
  return (
    <div className="grid md:grid-cols-2 min-h-screen bg-[--color-bg-deep]">
      {/* العمود البصري — يقابل جانب المصباح في التصميم المرجعي */}
      <div className="relative hidden md:flex items-center justify-center overflow-hidden">
        <AnimatedLamp />
        <ParticleField count={24} />
      </div>

      {/* العمود الوظيفي — النموذج الفعلي، بلا أي حركة تُبطئ إدخال البيانات */}
      <motion.div
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex items-center justify-center p-8"
      >
        <AuthMethodPicker />   {/* من 10-frontend-architecture.md §10.4 — بلا تغيير في المنطق */}
      </motion.div>
    </div>
  );
}
```

```tsx
// components/ui/AnimatedLamp.tsx — إعادة بناء أثر الإضاءة من التصميم المرجعي بـ CSS/Framer Motion بحتة، بلا صور خارجية
function AnimatedLamp() {
  return (
    <motion.div
      className="relative w-40 h-40 rounded-full"
      style={{ background: "radial-gradient(circle, var(--color-lamp-glow) 0%, transparent 70%)" }}
      animate={{ opacity: [0.6, 1, 0.6], scale: [0.95, 1.05, 0.95] }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

// components/ui/ParticleField.tsx — نقاط ضوء عائمة خفيفة، بديل React خفيف الأداء عن جسيمات JS يدوية
function ParticleField({ count }: { count: number }) {
  const particles = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);
  return (
    <>
      {particles.map((i) => (
        <motion.span
          key={i}
          className="absolute w-1 h-1 rounded-full bg-[--color-lamp-glow]"
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: [0, 0.8, 0], y: -120 }}
          transition={{ duration: 3 + (i % 5), repeat: Infinity, delay: i * 0.3 }}
          style={{ left: `${(i * 37) % 100}%`, bottom: 0 }}
        />
      ))}
    </>
  );
}
```

## 13.3 رموز التصميم (Design Tokens) للطابع الليلي الدافئ

أضِف على `styles/` (تتوافق مع نظام الألوان الهادئ في `10-frontend-architecture.md` §10.5 — لا تستبدله، بل تفعّل نسخته الداكنة تحديداً لشاشات الدخول والتصفح المسائي):

```css
:root[data-theme="dark"] {
  --color-bg-deep: #0d0f14;
  --color-lamp-glow: #f2c675;      /* دفء المصباح — يُستخدم أيضاً في مؤشرات "توصية جديدة" (10 §10.6) بدل الأخضر الحاد */
  --color-card-surface: #171a21;
}
```

**قاعدة مهمة:** الأحمر يبقى محجوزاً حصراً لحالات الخطر الحقيقية (راجع `10-frontend-architecture.md` §10.5) — لا تستخدم توهّج المصباح الدافئ في أي مكان قد يُفهم كتنبيه، وإلا تعارض مع نظام الألوان الوظيفي القائم.

## 13.4 أين تُستخدم هذه اللغة البصرية، وأين تتوقف عمداً

**تُستخدم في:** `/login` (§13.2)، شاشة الترحيب `/` (A01)، شاشات فارغة (Empty States) في `/library` — إضاءة خافتة متحركة خلف رسالة "لا نتائج بعد" أدفأ من شاشة فراغ رمادية عادية.

**لا تُستخدم إطلاقاً في:**
- شاشة `/emergency` (A09) ومكوّن `EmergencyReferralBanner` — هذه الشاشات تحتاج وضوحاً فورياً لا تأثيراً جمالياً؛ أي حركة زخرفية هنا تُبطئ إدراك المستخدم للمعلومة الحرجة، وهذا يخالف مبدأ "خط الدفاع الأول" في `07-safety-guardrails.md` §7.4.
- `CaseNoteEditor` و`RecommendationComposer` (`10-frontend-architecture.md` §10.6) — هاتان الشاشتان تعتمدان على وضوح الشريط التحذيري اللوني (أحمر/أخضر) للتمييز الفوري بين "خاص" و"يصل للمستفيد"؛ أي حركة إضافية تُشتّت هذا التمييز البصري الحرج.
- أي نموذج يحتوي حقلاً حراً حساساً ("ملاحظتي للمختص") — الحركة هنا تبقى بسيطة جداً (Fade فقط)، إذ الهدف تركيز المستخدم على الكتابة لا الجمال البصري.

## 13.5 إمكانية الوصول (Accessibility) — إلزامي، لا اختياري

```tsx
import { useReducedMotion } from "framer-motion";

function AnimatedLamp() {
  const reduceMotion = useReducedMotion();   // يقرأ تفضيل النظام prefers-reduced-motion تلقائياً
  return (
    <motion.div
      animate={reduceMotion ? { opacity: 0.8 } : { opacity: [0.6, 1, 0.6], scale: [0.95, 1.05, 0.95] }}
      transition={reduceMotion ? { duration: 0 } : { duration: 4, repeat: Infinity }}
    />
  );
}
```

كل مكوّن حركة في §13.2 يطبّق `useReducedMotion` بنفس النمط — هذا يطابق التزام WCAG 2.2 AA المذكور أصلاً في `10-frontend-architecture.md` §10.11، ولا يُعتبر بنداً منفصلاً اختيارياً.

## 13.6 الأداء

- `ParticleField` يُقيَّد بحد أقصى منطقي (24–30 عنصر) — لا تُنشئ مئات العناصر المتحركة، فهذا يستهلك إعادة رسم (Repaint) غير ضروري خصوصاً على أجهزة جوّال متوسطة.
- استخدم `transform`/`opacity` فقط في كل حركة (كما في الأمثلة أعلاه) — لا حركة على `width`/`height`/`top`/`left` مباشرة، لأنها تُجبر المتصفح على إعادة تخطيط الصفحة (Layout) بدل تسريع GPU البسيط.
- حمّل `framer-motion` بتقسيم كود (Code Splitting) على مستوى `LoginScreen` فقط إن كبر حجم الحزمة لاحقاً — لا حاجة الآن في هذا الحجم من الاستخدام.
