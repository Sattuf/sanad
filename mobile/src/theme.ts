import { useColorScheme } from "react-native";

// نفس رموز الهوية في الويب (frontend/src/styles/index.css) — أي تعديل هناك يُنقل هنا.
const light = {
  bg: "#f6f3ec",
  bgDeep: "#efe9dd",
  surface: "#ffffff",
  surface2: "#faf8f3",
  text: "#1d2126",
  muted: "#5a626d",
  border: "#e3ddd1",
  primary: "#0f5c58",
  primaryContrast: "#ffffff",
  lamp: "#b8802a",
  success: "#1f6f47",
  successBg: "#e6f4ec",
  danger: "#b42318",
  dangerBg: "#fdecea",
};

const dark: typeof light = {
  bg: "#0d0f14",
  bgDeep: "#090b0f",
  surface: "#171a21",
  surface2: "#1d212a",
  text: "#ece9e2",
  muted: "#a4a9b3",
  border: "#2a2f3a",
  primary: "#5fb3ad",
  primaryContrast: "#0b1a19",
  lamp: "#f2c675",
  success: "#6fcf97",
  successBg: "#13261c",
  danger: "#ff7b6e",
  dangerBg: "#2c1513",
};

export type Colors = typeof light;

export const fonts = {
  body: "IBMPlexSansArabic_400Regular",
  bold: "IBMPlexSansArabic_700Bold",
  dua: "Amiri_400Regular",
  quran: "AmiriQuran_400Regular",
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { md: 12, lg: 16, xl: 24 };

export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}
