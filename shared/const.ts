export const COOKIE_NAME = "financas_bi_session";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = "Entre na sua conta para continuar.";
export const NOT_ADMIN_ERR_MSG = "Você não tem permissão para esta ação.";
export const OAUTH_STATE_COOKIE = "__Host-oauth_state";
export type OAuthState = { redirectUri: string; nonce?: string };
export const encodeOAuthState = (state: OAuthState): string => btoa(JSON.stringify(state));
export const decodeOAuthState = (state: string): OAuthState => {
  let decoded: string;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
    // Keep the legacy base64-encoded redirect supported by the unused OAuth routes.
  }
  return { redirectUri: decoded };
};
