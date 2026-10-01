import { accountApi } from "@sanad/shared/api/account";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { auth } from "@/lib/auth";
import { useSession } from "@/stores/session";

export const account = accountApi(api);

export const queryKeys = { me: ["me"] as const, providers: ["auth-providers"] as const, minVersion: ["min-version"] as const };

export const useSignedIn = () => useSession((s) => Boolean(s.accessToken || s.refreshToken));

export function useMe() {
  const signedIn = useSignedIn();
  return useQuery({ queryKey: queryKeys.me, queryFn: account.me, enabled: signedIn });
}

export function useAuthProviders() {
  return useQuery({ queryKey: queryKeys.providers, queryFn: auth.providers, staleTime: 5 * 60_000 });
}
