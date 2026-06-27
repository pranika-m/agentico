const DEFAULT_API_BASE = "http://localhost:8000";

const rawBase =
  process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, "") || DEFAULT_API_BASE;

export const API_BASE = rawBase.endsWith("/api") ? rawBase : `${rawBase}/api`;

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}
