// Keychain/Keystore غير متاحين في Jest — بديل في الذاكرة بنفس واجهة expo-secure-store
jest.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 5,
    __store: store,
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => void store.set(key, value)),
    deleteItemAsync: jest.fn(async (key: string) => void store.delete(key)),
  };
});

// WebView (CAPTCHA) وحدة أصلية — في الاختبارات يكفي عنصر فارغ
jest.mock("react-native-webview", () => {
  const { View } = jest.requireActual("react-native");
  return { WebView: View };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports -- مصنع jest.mock يُستدعى قبل الاستيرادات
jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));

// مشغّل الصوت وحدة أصلية — مشغّل وهمي افتراضي (اختبار المكتبة يستبدله بآخر يراقب الاستدعاءات)
jest.mock("expo-audio", () => ({
  createAudioPlayer: jest.fn(() => ({
    playing: false,
    replace: jest.fn(),
    play: jest.fn(),
    pause: jest.fn(),
    setActiveForLockScreen: jest.fn(),
    clearLockScreenControls: jest.fn(),
    addListener: jest.fn(),
  })),
  setAudioModeAsync: jest.fn(async () => undefined),
}));
