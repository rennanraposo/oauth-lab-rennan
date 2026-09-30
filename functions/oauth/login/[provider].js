import { randomToken, sha256 } from "../../_shared/crypto.js";
import { transactionCookie } from "../../_shared/cookies.js";
import { getProvider, redirectUri } from "../../_shared/providers.js";

export async function onRequestGet(context) {
  const { params, env } = context;
  const name = params.provider;

  // 1. aceitar somente google ou github (seção 13.1)
  const provider = getProvider(name);
  if (!provider) {
    return new Response("Not Found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  // 2. gerar a transação (seção 13.2)
  const txId = randomToken();
  const state = randomToken();
  const codeVerifier = randomToken();
  const nonce = name === "google" ? randomToken() : null;

  const txIdHash = await sha256(txId);
  const stateHash = await sha256(state);
  const codeChallenge = await sha256(codeVerifier);

  // gravar no D1 somente resumos, code_verifier, nonce e expiração (10 minutos)
  const expiresAt = Math.floor(Date.now() / 1000) + 600;
  await env.DB.prepare(
    "INSERT INTO oauth_transactions (id_hash, provider, state_hash, nonce, code_verifier, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
  )
    .bind(txIdHash, name, stateHash, nonce, codeVerifier, expiresAt)
    .run();

  // 4. montar o pedido de autorização (seção 13.3)
  const url = new URL(provider.authorizeUrl);
  url.searchParams.set("client_id", env[provider.clientIdVar]);
  url.searchParams.set("redirect_uri", redirectUri(env, name));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (name === "google") {
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("nonce", nonce);
  }

  // 3 e 5. criar o cookie temporário e redirecionar com 302
  return new Response(null, {
    status: 302,
    headers: {
      Location: url.toString(),
      "Set-Cookie": transactionCookie(txId),
      "Cache-Control": "no-store",
    },
  });
}
