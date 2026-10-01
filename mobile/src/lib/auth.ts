import { authApi, completedTokens } from "@sanad/shared/api/auth";
import type { AuthResponse } from "@sanad/shared/api/types";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { Platform } from "react-native";
import { api } from "@/lib/api";
import { useSession } from "@/stores/session";

export const auth = authApi(api);

export type SignInOutcome = { kind: "done"; isNewUser: boolean } | { kind: "two-factor"; ticket: string } | { kind: "web-only" };

/**
 * يُنهي أي طريقة دخول: جلسة مكتملة تُحفظ (رمز التحديث في Keychain/Keystore)، ورمز 2FA يُطلب في التطبيق،
 * أما المراحل الإدارية (تغيير كلمة مرور مؤقتة، إعداد 2FA) فتُكمل على الويب — التطبيق للمستفيد (ADR-0018).
 */
export function finishSignIn(res: AuthResponse): SignInOutcome {
  const tokens = completedTokens(res);
  if (tokens) {
    useSession.getState().setTokens(tokens.access, tokens.refresh);
    return { kind: "done", isNewUser: res.isNewUser };
  }
  if (res.stage === "RequiresTwoFactorCode" && res.ticket) return { kind: "two-factor", ticket: res.ticket };
  return { kind: "web-only" };
}

/** الخروج: إبطال الرموز على الخادم ثم مسحها محلياً — المسح يتم حتى لو تعذّر الاتصال. */
export async function signOut() {
  try {
    await auth.revoke(useSession.getState().refreshToken);
  } catch {
    /* بلا شبكة: يكفي المسح المحلي، والرمز ينتهي على الخادم بمدته */
  } finally {
    useSession.getState().clear();
  }
}

// ── أبل ──────────────────────────────────────────────────────────────────────

export async function appleAvailable(): Promise<boolean> {
  return Platform.OS === "ios" && (await AppleAuthentication.isAvailableAsync().catch(() => false));
}

/**
 * nonce لمرة واحدة: نعطي أبل SHA-256 للقيمة، ونرسل القيمة الأصلية للخادم ليتحقق أن الرمز صدر لهذه المحاولة بالذات.
 * null = ألغى المستخدم.
 */
export async function signInWithApple(): Promise<AuthResponse | null> {
  const rawNonce = `${Crypto.randomUUID()}${Crypto.randomUUID()}`;
  const hashedNonce = (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce)).toLowerCase();
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
  } catch (e) {
    if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") return null;
    throw e;
  }
  if (!credential.identityToken) throw new Error("لم تُرجع أبل رمز هوية.");
  // الاسم يصل من أبل في أول دخول فقط
  const name = credential.fullName ? AppleAuthentication.formatFullName(credential.fullName) : null;
  return auth.apple(credential.identityToken, rawNonce, name?.trim() || null);
}

// ── جوجل ─────────────────────────────────────────────────────────────────────

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

type GoogleModule = typeof import("@react-native-google-signin/google-signin");

/** الوحدة الأصلية غير موجودة في Expo Go — تُحمَّل عند الطلب فقط حتى لا يتعطل التطبيق كله. */
function loadGoogle(): GoogleModule | null {
  if (!GOOGLE_WEB_CLIENT_ID) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- تحميل كسول مقصود: الوحدة الأصلية غير موجودة في Expo Go
    return require("@react-native-google-signin/google-signin") as GoogleModule;
  } catch {
    return null;
  }
}

export const googleConfigured = () => loadGoogle() !== null;

export async function signInWithGoogle(): Promise<AuthResponse | null> {
  const google = loadGoogle();
  if (!google) throw new Error("الدخول بجوجل غير مُعدّ في هذا الإصدار.");
  const { GoogleSignin, isSuccessResponse } = google;
  // webClientId يجعل جمهور الرمز معرّف عميل الويب الذي يقبله الخادم (Auth:Google:ClientId أو NativeClientIds)
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, iosClientId: GOOGLE_IOS_CLIENT_ID });
  if (Platform.OS === "android") await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return null;
  if (!response.data.idToken) throw new Error("لم تُرجع جوجل رمز هوية.");
  // لا نحتفظ بجلسة جوجل في التطبيق — جلسة سند وحدها تكفي، ويختار المستخدم حسابه في كل مرة
  await GoogleSignin.signOut().catch(() => null);
  return auth.googleNative(response.data.idToken);
}
