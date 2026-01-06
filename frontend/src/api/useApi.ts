import { useAuth0 } from "@auth0/auth0-react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
const AUDIENCE = import.meta.env.VITE_AUTH0_AUDIENCE;

type ApiError = {
  status: number;
  body: unknown;
};

async function readBody(resp: Response): Promise<unknown> {
  const text = await resp.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function useApi() {
  const { isAuthenticated, user, getAccessTokenSilently } = useAuth0();

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);

    // Works with backend dev fallback (AUTH0_DOMAIN/AUDIENCE not configured).
    if (isAuthenticated && user?.sub) headers.set("X-User-Id", user.sub);

    // When backend is configured for Auth0, it will validate Bearer tokens.
    if (isAuthenticated && AUDIENCE) {
      const token = await getAccessTokenSilently({
        authorizationParams: { audience: AUDIENCE },
      });
      headers.set("Authorization", `Bearer ${token}`);
    }

    if (!headers.has("Content-Type") && init.body) {
      headers.set("Content-Type", "application/json");
    }

    const resp = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
    });

    if (!resp.ok) {
      const body = await readBody(resp);
      const err: ApiError = { status: resp.status, body };
      throw err;
    }

    return (await readBody(resp)) as T;
  }

  return { request };
}
