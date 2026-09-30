import { randomToken, sha256 } from "../../_shared/crypto.js";
import { getCookie, TX_COOKIE, sessionCookie, expireCookie } from "../../_shared/cookies.js";
import { getProvider, redirectUri } from "../../_shared/providers.js";
import { verifyGoogleIdToken } from "../../_shared/oidc.js";

const SESSION_SECONDS = 28800;
const GITHUB_API_VERSION = "2026-03-10";

// Resposta de erro genérica: sem detalhes internos, sem cache e limpando o cookie temporário
function failure(status, message) {
  const headers = new Headers({
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  headers.append("Set-Cookie", expireCookie(TX_COOKIE, "Lax"));
  return new Response(message, { status, headers });
}

// GitHub: consultar /user com o access_token e revogar a autorização (seção 13.5)
async function getGitHubIdentity(tokens, clientId, clientSecret) {
  // 9. exigir access_token e token_type compatível com Bearer
  if (typeof tokens.access_token !== "string" || tokens.access_token === "") {
    throw new Error("access_token ausente");
  }
  if (typeof tokens.token_type !== "string" || tokens.token_type.toLowerCase() !== "bearer") {
    throw new Error("token_type inválido");
  }

  // 10. consultar o perfil autenticado
  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": "oauth-lab-rennan",
    },
  });
  if (userResponse.status !== 200) {
    throw new Error("falha ao consultar /user");
  }
  const user = await userResponse.json();
  if (!Number.isInteger(user.id)) {
    throw new Error("id do GitHub inválido");
  }

  // revogar a autorização antes de criar a sessão local (exigir 204)
  const revokeResponse = await fetch(`https://api.github.com/applications/${clientId}/grant`, {
    method: "DELETE",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": "oauth-lab-rennan",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ access_token: tokens.access_token }),
  });
  if (revokeResponse.status !== 204) {
    throw new Error("falha ao revogar a autorização");
  }

  return {
    issuer: "https://github.com",
    subject: String(user.id),
    email: user.email ?? null,
    displayName: user.name ?? user.login ?? null,
  };
}

async function handleCallback(context) {
  const { request, params, env } = context;
  const name = params.provider;

  // somente google ou github (seção 13.1)
  const provider = getProvider(name);
  if (!provider) {
    return new Response("Not Found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  // 1. recusar error ou a ausência de code e state
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.has("error") || !code || !state) {
    return failure(400, "Login recusado.");
  }

  // 2. exigir o cookie __Host-oauth-tx
  const txId = getCookie(request, TX_COOKIE);
  if (!txId) {
    return failure(400, "Transação de login ausente.");
  }

  // 3. calcular o resumo do cookie e localizar uma transação não expirada
  const now = Math.floor(Date.now() / 1000);
  const txIdHash = await sha256(txId);
  const tx = await env.DB.prepare(
    "SELECT provider, state_hash, nonce, code_verifier FROM oauth_transactions WHERE id_hash = ? AND expires_at > ?"
  )
    .bind(txIdHash, now)
    .first();
  if (!tx) {
    return failure(400, "Transação de login inválida ou expirada.");
  }

  // 4. comparar o resumo de state com o valor conservado no D1
  const stateHash = await sha256(state);
  const stateMatches = tx.state_hash === stateHash && tx.provider === name;

  // 5. apagar a transação antes de concluir o fluxo (uso único)
  const deletion = await env.DB.prepare("DELETE FROM oauth_transactions WHERE id_hash = ?")
    .bind(txIdHash)
    .run();
  if (!stateMatches || deletion.meta.changes !== 1) {
    return failure(400, "Transação de login inválida.");
  }

  // 6. trocar o código com o code_verifier e o Client Secret do provedor correto
  const clientId = env[provider.clientIdVar];
  const clientSecret = env[provider.clientSecretVar];
  const tokenResponse = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: redirectUri(env, name),
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: tx.code_verifier,
    }),
  });
  if (!tokenResponse.ok) {
    return failure(502, "Falha na troca do código.");
  }
  const tokens = await tokenResponse.json();
  if (tokens.error) {
    return failure(502, "Falha na troca do código.");
  }

  // 7. validar a resposta de identidade conforme o contrato do provedor
  let identity;
  try {
    if (name === "google") {
      identity = await verifyGoogleIdToken(tokens.id_token, clientId, tx.nonce);
    } else {
      identity = await getGitHubIdentity(tokens, clientId, clientSecret);
    }
  } catch {
    return failure(401, "Não foi possível confirmar a identidade.");
  }

  // 8. criar uma sessão opaca (o D1 guarda somente o resumo)
  const sessionId = randomToken();
  const sessionHash = await sha256(sessionId);
  await env.DB.prepare(
    "INSERT INTO sessions (id_hash, issuer, subject, email, display_name, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(sessionHash, identity.issuer, identity.subject, identity.email, identity.displayName, now + SESSION_SECONDS, now)
    .run();

  // 9. limpar o cookie temporário e 10. redirecionar para PUBLIC_BASE_URL
  const headers = new Headers({
    Location: env.PUBLIC_BASE_URL,
    "Cache-Control": "no-store",
  });
  headers.append("Set-Cookie", expireCookie(TX_COOKIE, "Lax"));
  headers.append("Set-Cookie", sessionCookie(sessionId));
  return new Response(null, { status: 302, headers });
}

export async function onRequestGet(context) {
  try {
    return await handleCallback(context);
  } catch {
    return failure(500, "Erro interno.");
  }
}
