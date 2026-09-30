// Nomes dos cookies definidos no PDF
export const TX_COOKIE = "__Host-oauth-tx";
export const SESSION_COOKIE = "__Host-session";

// Lê o valor de um cookie a partir do cabeçalho Cookie da requisição
export function getCookie(request, name) {
  const header = request.headers.get("Cookie");
  if (!header) {
    return null;
  }
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return rest.join("=");
    }
  }
  return null;
}

// Cookie temporário da transação (seção 13.3)
export function transactionCookie(value) {
  return `${TX_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;
}

// Cookie da sessão (seção 13.6)
export function sessionCookie(value) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`;
}

// Expira (apaga) um cookie, mantendo os mesmos atributos
export function expireCookie(name, sameSite) {
  return `${name}=; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=0`;
}
