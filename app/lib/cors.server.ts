import shopify from "../shopify.server";

const DEFAULT_ALLOWED = [
  "https://extensions.shopifycdn.com", 
  process.env.SHOPIFY_APP_URL,
  'https://shopify.com'
].filter(Boolean) as string[];

export function makeCorsHeaders(origin?: string) {
  const headers = new Headers();

  // Pick the correct Access-Control-Allow-Origin
  if (origin && DEFAULT_ALLOWED.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  } else {
    // For debugging while tunneling (Cloudflare, ngrok, etc.)
    headers.set("Access-Control-Allow-Origin", "*");
  }

  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Max-Age", "86400");

  return headers;
}

export function corsJson(
  data: any,
  status: number = 200,
  origin?: string
): Response {
  const headers = makeCorsHeaders(origin);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(data), { status, headers });
}

// 💬 Helper: return empty 204 response for OPTIONS preflight
export function corsNoContent(origin?: string): Response {
  const headers = makeCorsHeaders(origin);
  return new Response(null, { status: 204, headers });
}

export const authenticate = shopify.authenticate;


export async function requireAdmin(request: Request) {
  const { admin, session } = await authenticate.admin(request);
  return { admin, shop: session.shop };
}

export async function requireCustomer(request: Request) {
  const { session } = await authenticate.public.appProxy(request);
  return { shop: session?.shop };
}

export async function decodeWithoutVerify(jwt: string) {
  const [, payloadB64] = jwt.split(".");
  const json = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
  try { return JSON.parse(decodeURIComponent(escape(json))); } catch { return JSON.parse(json); }
}