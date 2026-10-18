/*
  القرّاء ومسار تلاوة الآية — مشتركة بين الويب وتطبيق Flutter (ADR-0023).
  الصوت يخدمه سند نفسه (/api/v1/public/recitation) بعد جلبه من everyayah.com مرة واحدة.
*/
export const RECITERS = [
  { id: "Alafasy_128kbps", name: "مشاري العفاسي" },
  { id: "Husary_128kbps", name: "محمود خليل الحصري" },
  { id: "Minshawy_Murattal_128kbps", name: "محمد صديق المنشاوي" },
  { id: "Abdul_Basit_Murattal_192kbps", name: "عبد الباسط عبد الصمد" },
] as const;

export const ayahAudioPath = (reciter: string, surah: number, ayah: number) => `/api/v1/public/recitation/${reciter}/${surah}/${ayah}`;
