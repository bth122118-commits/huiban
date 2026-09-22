import { createHmac, timingSafeEqual } from "crypto";

// =====================================================================
// 汇办 Huiban · Aurinko 统一邮箱 API 客户端（服务端）
// 文档：https://docs.aurinko.io
// 账户 OAuth 流程：authorize → 回调 code → token 换 accountToken → 用 Bearer 调 API
// =====================================================================

const BASE = "https://api.aurinko.io/v1";

export function aurinkoClientId(): string { return process.env.AURINKO_CLIENT_ID!; }
function aurinkoClientSecret(): string { return process.env.AURINKO_CLIENT_SECRET!; }

// ── 1. 授权 URL（把用户重定向到 Aurinko 去授权 Google 邮箱）────────────
export function authorizeUrl(returnUrl: string, state: string): string {
  const q = new URLSearchParams({
    clientId: aurinkoClientId(),
    serviceType: "Google",
    scopes: "Mail.Read Mail.Send",
    responseType: "code",
    returnUrl,
    state,
  });
  return `${BASE}/auth/authorize?${q.toString()}`;
}

// ── 2. 用回调返回的 code 换 accountToken（Basic Auth：clientId:secret）──
export async function exchangeCode(code: string): Promise<{ accountId: number | string; accessToken: string }> {
  const basic = Buffer.from(`${aurinkoClientId()}:${aurinkoClientSecret()}`).toString("base64");
  const res = await fetch(`${BASE}/auth/token/${encodeURIComponent(code)}`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!res.ok) throw new Error(`Aurinko token exchange failed: ${res.status}`);
  return res.json();
}

// ── 3. 订阅「新邮件」webhook（per-account）─────────────────────────────
export async function subscribeWebhook(accessToken: string, notificationUrl: string): Promise<void> {
  const res = await fetch(`${BASE}/subscriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ resource: "/email/messages", notificationUrl }),
  });
  if (!res.ok) throw new Error(`Aurinko subscribe failed: ${res.status}`);
}

// ── 4. 取单封邮件内容 ──────────────────────────────────────────────────
export async function fetchMessage(accessToken: string, id: string): Promise<any | null> {
  const res = await fetch(`${BASE}/email/messages/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json();
}

// ── 5. 归一化成 ingestMessage 需要的字段（防御性解析，字段名以实测为准）─
export function normalizeMessage(m: any): {
  from: string; subject: string; body: string;
  messageId: string | null; inReplyTo: string | null; references: string | null;
} | null {
  if (!m) return null;
  const subject = String(m.subject || "");
  const body = String(m.body || m.text || m.snippet || "").slice(0, 4000);
  let from = "";
  if (typeof m.from === "string") from = m.from;
  else if (m.from) from = m.from.email || m.from.address || m.from.name || "";
  const headers: Record<string, string> = {};
  if (Array.isArray(m.headers)) {
    m.headers.forEach((h: any) => { if (h?.name) headers[String(h.name).toLowerCase()] = String(h.value); });
  } else if (m.headers && typeof m.headers === "object") {
    Object.entries(m.headers).forEach(([k, v]) => { headers[k.toLowerCase()] = String(v); });
  }
  return {
    from, subject, body,
    messageId: headers["message-id"] || m.messageId || m.id || null,
    inReplyTo: headers["in-reply-to"] || m.inReplyTo || null,
    references: headers["references"] || m.references || null,
  };
}

// ── 6. webhook 验签（HMAC-SHA256，签名字段名/格式以实测为准）───────────
export function verifyWebhookSignature(req: Request, rawBody: string): boolean {
  const secret = process.env.AURINKO_WEBHOOK_SECRET;
  if (!secret) return true; // 未配置则跳过（本地）
  const sig = req.headers.get("x-aurinko-signature")
    || req.headers.get("aurinko-signature")
    || req.headers.get("x-signature")
    || "";
  if (!sig) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = sig.replace(/^sha256=/i, "").toLowerCase();
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
