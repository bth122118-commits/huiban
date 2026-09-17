import { supabase } from "@/lib/supabase-browser";

// =====================================================================
// 汇办 Huiban · 浏览器端 API 请求助手
// 与 fetch 同签名，但自动带上当前用户的 Bearer token，供服务端鉴权。
// 组件里把 `fetch(...)` 换成 `apiFetch(...)` 即可，返回仍是 Response。
// =====================================================================

let token: string | null = null;

if (typeof window !== "undefined") {
  supabase.auth.getSession().then(({ data }) => { token = data.session?.access_token ?? null; });
  supabase.auth.onAuthStateChange((_event, session) => { token = session?.access_token ?? null; });
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  if (!token) {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token ?? null;
  }
  const headers = new Headers(init.headers);
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
