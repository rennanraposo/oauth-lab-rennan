import { sha256 } from "../_shared/crypto.js";
import { getCookie, SESSION_COOKIE, expireCookie } from "../_shared/cookies.js";

// 1. aceitar somente POST
export async function onRequestPost(context) {
  const { request, env } = context;

  // 2. exigir um cabeçalho Origin exatamente igual a PUBLIC_BASE_URL
  const origin = request.headers.get("Origin");
  if (origin !== env.PUBLIC_BASE_URL) {
    return new Response("Origem não permitida.", {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

  // 3. remover a linha da sessão no D1
  const sessionId = getCookie(request, SESSION_COOKIE);
  if (sessionId) {
    const sessionHash = await sha256(sessionId);
    await env.DB.prepare("DELETE FROM sessions WHERE id_hash = ?").bind(sessionHash).run();
  }

  // 4. expirar o cookie e 5. responder com Cache-Control: no-store
  const headers = new Headers({
    Location: env.PUBLIC_BASE_URL,
    "Cache-Control": "no-store",
  });
  headers.append("Set-Cookie", expireCookie(SESSION_COOKIE, "Strict"));
  return new Response(null, { status: 303, headers });
}

// qualquer outro método é recusado
export async function onRequest() {
  return new Response("Método não permitido.", {
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "no-store" },
  });
}
