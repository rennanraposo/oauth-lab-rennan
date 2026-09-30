import { sha256 } from "../_shared/crypto.js";
import { getCookie, SESSION_COOKIE } from "../_shared/cookies.js";

// Resposta JSON sem cache (seção 13.6)
function json(status, data) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;

  // ler o cookie de sessão
  const sessionId = getCookie(request, SESSION_COOKIE);
  if (!sessionId) {
    return json(401, { error: "sem sessão" });
  }

  // calcular o resumo e procurar uma sessão ainda válida
  const now = Math.floor(Date.now() / 1000);
  const sessionHash = await sha256(sessionId);
  const session = await env.DB.prepare(
    "SELECT email, display_name FROM sessions WHERE id_hash = ? AND expires_at > ?"
  )
    .bind(sessionHash, now)
    .first();
  if (!session) {
    return json(401, { error: "sem sessão" });
  }

  // devolver apenas o perfil mínimo
  return json(200, {
    email: session.email,
    displayName: session.display_name,
  });
}
