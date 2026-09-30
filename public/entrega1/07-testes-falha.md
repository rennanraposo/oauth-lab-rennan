# 07 – Testes de falha

Projeto: oauth-lab-rennan · URL_BASE: https://oauth-lab-rennan.pages.dev
Aluno: Rennan Raposo

Valores transitórios (cookies, code, state, nonce, tokens) foram omitidos deste registro.

## Caso 1: retorno sem cookie temporário

- **Preparação:** login com Google iniciado em uma janela comum e interrompido na página do provedor. A URL de autorização foi copiada para uma janela privativa, sem o cookie `__Host-oauth-tx`, e o login foi concluído nessa janela.
- **Pedido enviado:** `GET /oauth/callback/google?code=[REMOVIDO]&state=[REMOVIDO]` sem o cookie `__Host-oauth-tx`.
- **Resultado esperado:** a rota de retorno recusa a resposta e não cria sessão.
- **Resultado observado:** resposta 400 "Transação de login ausente.", com `Cache-Control: no-store`. Nenhum cookie `__Host-session` foi criado e a página inicial exibiu "Nenhuma sessão neste navegador."

## Caso 2: state alterado

- **Preparação:** login com GitHub iniciado e interrompido na página de autorização do provedor. Um único caractere do parâmetro `state` foi alterado na barra de endereço antes de autorizar.
- **Pedido enviado:** `GET /oauth/callback/github?code=[REMOVIDO]&state=[ALTERADO]` com o cookie `__Host-oauth-tx` válido.
- **Resultado esperado:** a rota de retorno recusa a resposta antes de trocar o código.
- **Resultado observado:** resposta 400 "Transação de login inválida.", com `Cache-Control: no-store`. A transação foi apagada do D1, o código não foi trocado e nenhuma sessão foi criada.

## Caso 3: reutilização da transação

- **Preparação:** login com Google concluído com sucesso. No painel Network, a requisição de retorno foi localizada e copiada com Copy URL.
- **Pedido enviado:** repetição do mesmo `GET /oauth/callback/google?code=[REMOVIDO]&state=[REMOVIDO]`.
- **Resultado esperado:** a transação já foi removida e a repetição falha.
- **Resultado observado:** resposta 400 "Transação de login ausente." (o cookie temporário já havia sido expirado no primeiro retorno), com `Cache-Control: no-store`. Nenhuma nova sessão foi criada.

## Caso 4: sessão expirada

- **Preparação:** sessão de teste criada com login válido. No console D1 do banco `oauth-sessions-rennan` foi executado `UPDATE sessions SET expires_at = 0;`.
- **Pedido enviado:** recarga da página inicial, que consulta `GET /api/me` com o cookie `__Host-session`.
- **Resultado esperado:** `/api/me` responde 401.
- **Resultado observado:** `/api/me` respondeu 401 `{"error":"sem sessão"}`, com `Cache-Control: no-store`, e a página exibiu "Nenhuma sessão neste navegador."

## Caso 5: origem inválida na saída

- **Preparação:** sessão válida aberta em URL_BASE. Em outra aba, em https://example.com, foi executado no console: `fetch("https://oauth-lab-rennan.pages.dev/oauth/logout", { method: "POST", credentials: "include" });`
- **Pedido enviado:** `POST /oauth/logout` com o cabeçalho `Origin: https://example.com`.
- **Resultado esperado:** a rota recusa a operação e a sessão original permanece válida.
- **Resultado observado:** resposta 403 "Origem não permitida.", com `Cache-Control: no-store` (o navegador também registrou bloqueio de CORS na leitura da resposta). Na aba de URL_BASE, `/api/me` continuou respondendo 200 com o perfil.

## Caso 6: reutilização do cookie revogado

- **Preparação:** em uma sessão exclusiva do laboratório, o valor do cookie `__Host-session` foi copiado temporariamente pelas ferramentas de desenvolvimento. O logout foi executado e o mesmo valor foi restaurado no navegador.
- **Pedido enviado:** `GET /api/me` com o cookie `__Host-session` restaurado ([REMOVIDO]).
- **Resultado esperado:** a resposta é 401, porque a linha da sessão foi removida do D1.
- **Resultado observado:** `/api/me` respondeu 401 `{"error":"sem sessão"}`. A cópia do valor foi apagada imediatamente e não consta desta evidência.
