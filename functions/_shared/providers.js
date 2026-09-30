// Dados públicos de cada provedor (seções 13.3 a 13.5)
const PROVIDERS = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    issuer: "https://accounts.google.com",
    clientIdVar: "GOOGLE_CLIENT_ID",
    clientSecretVar: "GOOGLE_CLIENT_SECRET",
  },
  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    issuer: "https://github.com",
    clientIdVar: "GITHUB_CLIENT_ID",
    clientSecretVar: "GITHUB_CLIENT_SECRET",
  },
};

// Devolve os dados do provedor, ou null se não for google nem github (seção 13.1)
export function getProvider(name) {
  if (name !== "google" && name !== "github") {
    return null;
  }
  return PROVIDERS[name];
}

// Monta a URL de retorno exata cadastrada no provedor
export function redirectUri(env, name) {
  return `${env.PUBLIC_BASE_URL}/oauth/callback/${name}`;
}
