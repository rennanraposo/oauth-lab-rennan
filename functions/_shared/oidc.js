// Validação do id_token do Google sem bibliotecas externas (seção 13.5)

const GOOGLE_DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

// Converte texto Base64URL de volta em bytes
function base64UrlToBytes(text) {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Decodifica uma parte do JWT (cabeçalho ou conteúdo) em objeto
function decodeJsonPart(part) {
  const bytes = base64UrlToBytes(part);
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function verifyGoogleIdToken(idToken, clientId, expectedNonce) {
  // 1. separar as três partes do JWT e recusar outro formato
  if (typeof idToken !== "string") {
    throw new Error("id_token ausente");
  }
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new Error("formato do id_token inválido");
  }
  const [headerPart, payloadPart, signaturePart] = parts;

  // 2. decodificar o cabeçalho e exigir RS256
  const header = decodeJsonPart(headerPart);
  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("cabeçalho do id_token inválido");
  }

  // 3. obter o documento de descoberta OIDC do emissor esperado
  const discoveryResponse = await fetch(GOOGLE_DISCOVERY_URL);
  if (!discoveryResponse.ok) {
    throw new Error("falha na descoberta OIDC");
  }
  const discovery = await discoveryResponse.json();
  if (!GOOGLE_ISSUERS.includes(discovery.issuer)) {
    throw new Error("emissor da descoberta inesperado");
  }

  // 4. obter o conjunto de chaves JWKS indicado por jwks_uri
  const jwksResponse = await fetch(discovery.jwks_uri);
  if (!jwksResponse.ok) {
    throw new Error("falha ao obter JWKS");
  }
  const jwks = await jwksResponse.json();

  // 5. selecionar a chave pública pelo kid do cabeçalho
  const jwk = jwks.keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    throw new Error("chave não encontrada");
  }

  // 6. importar a JWK
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  // 7. verificar a assinatura
  const signedData = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
  const signature = base64UrlToBytes(signaturePart);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, signature, signedData);
  if (!valid) {
    throw new Error("assinatura inválida");
  }

  // 8. validar iss, aud, exp, iat e nonce antes de usar sub, nome e e-mail
  const claims = decodeJsonPart(payloadPart);
  const now = Math.floor(Date.now() / 1000);

  if (!GOOGLE_ISSUERS.includes(claims.iss)) {
    throw new Error("iss inválido");
  }
  if (claims.aud !== clientId) {
    throw new Error("aud inválido");
  }
  if (typeof claims.exp !== "number" || claims.exp <= now) {
    throw new Error("id_token expirado");
  }
  if (typeof claims.iat !== "number" || claims.iat > now + 60) {
    throw new Error("iat inválido");
  }
  if (!expectedNonce || claims.nonce !== expectedNonce) {
    throw new Error("nonce inválido");
  }
  if (typeof claims.sub !== "string" || claims.sub === "") {
    throw new Error("sub ausente");
  }

  return {
    issuer: "https://accounts.google.com",
    subject: claims.sub,
    email: claims.email ?? null,
    displayName: claims.name ?? null,
  };
}
