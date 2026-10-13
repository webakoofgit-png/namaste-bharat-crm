let csrf = "";
const base = import.meta.env["VITE_API_URL"] || "/api";
export function setCsrf(value: string) {
  csrf = value;
}
export async function api<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (csrf && options.method && options.method !== "GET") headers.set("x-csrf-token", csrf);
  const response = await fetch(`${base}${endpoint}`, {
    ...options,
    headers,
    credentials: "include",
  });
  const payload = await response.json();
  if (!response.ok)
    throw new Error(payload.error?.message || "The request could not be completed.");
  return payload.data as T;
}
export function apiUrl(endpoint: string) {
  return `${base}${endpoint}`;
}
