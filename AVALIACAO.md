# Avaliação — GitHub Actions com IA

Aluno: Rennan Raposo
Repositório: https://github.com/rennanraposo/oauth-lab-rennan

## Tarefa 1 — CI a cada commit

O workflow ci.yml executa em todo push e em pull requests para main.
Ele procura possíveis segredos versionados, aplica as migrações em
SQLite e valida os arquivos HTML.

- Execução verde:
  https://github.com/rennanraposo/oauth-lab-rennan/actions/runs/38009826714
- Execução vermelha com erro proposital no SQL:
  https://github.com/rennanraposo/oauth-lab-rennan/actions/runs/38010366120

Linha do erro:

```text
Parse error near line 1: near "TABL": syntax error
```

O erro foi provocado pela troca de CREATE TABLE por CREATE TABL
e depois corrigido na mesma branch.

Testamos a migração em SQLite antes do D1 para identificar erros
de SQL sem alterar o banco remoto.

## Tarefa 2 — Proteção da main

A main exige pull request e aprovação do status check verificar.
A proteção também foi aplicada ao administrador do repositório.

PR usado para demonstrar o bloqueio e a liberação após a correção:
https://github.com/rennanraposo/oauth-lab-rennan/pull/1

Com o SQL incorreto, o CI falhou e o merge ficou bloqueado.
Depois da correção na mesma branch, o CI passou e o merge foi liberado.

Também tentei enviar um commit vazio diretamente para main:

```bash
git commit --allow-empty -m "Testa bloqueio de push direto na main"
git push origin main
```

O GitHub recusou o envio:

```text
remote: error: GH006: Protected branch update failed for refs/heads/main.
remote: - Changes must be made through a pull request.
remote: - Required status check "verificar" is expected.
! [remote rejected] main -> main (protected branch hook declined)
```

## Tarefa 3 — Revisão de PR por IA

O workflow revisao-ia.yml executa quando um PR é aberto ou atualizado.
Ele monta um prompt com o diff e publica a resposta da IA no PR.

PR do teste:
https://github.com/rennanraposo/oauth-lab-rennan/pull/2

### Consulta vulnerável

```javascript
async function consultarNotas(env, nome) {
  return env.DB
    .prepare(`SELECT * FROM notas WHERE aluno = '${nome}'`)
    .all();
}
```

Primeira revisão, identificando a interpolação insegura:
https://github.com/rennanraposo/oauth-lab-rennan/pull/2#issuecomment-6204186432

A função foi adicionada apenas para o teste e não era chamada
pelo endpoint. A IA identificou corretamente essa limitação.

### Consulta corrigida

```javascript
async function consultarNotas(env, nome) {
  return env.DB
    .prepare("SELECT * FROM notas WHERE aluno = ?")
    .bind(nome)
    .all();
}
```

A consulta passou a receber o nome como parâmetro, impedindo que
o valor seja interpretado como parte do comando SQL.

Segunda revisão, reconhecendo o uso de prepare().bind():
https://github.com/rennanraposo/oauth-lab-rennan/pull/2#issuecomment-6204216609

### Teste de permissão

Removi pull-requests: write e fiz um novo commit.
A revisão da IA funcionou, mas a etapa de publicar o comentário falhou.

Execução com falha:
https://github.com/rennanraposo/oauth-lab-rennan/actions/runs/38822586042

Erro:

```text
GraphQL: Resource not accessible by integration (addComment)
Process completed with exit code 1.
```

Depois restaurei a permissão. A execução passou e publicou o comentário:

https://github.com/rennanraposo/oauth-lab-rennan/actions/runs/38823173222

### Análise crítica da resposta da IA

Comentário analisado:
https://github.com/rennanraposo/oauth-lab-rennan/pull/2#issuecomment-6204358235

A IA terminou a revisão oferecendo opções para corrigir o código
e criar um arquivo. Essas opções não são executadas pelo nosso
workflow, que apenas publica comentários no PR. Portanto, essa
parte da resposta é irrelevante para o funcionamento da automação.
O alerta sobre o acesso ao PAT representa um risco real e não
foi considerado uma afirmação errada.

### Ajustes necessários na ação

A referência actions/ai-inference@v1 ainda usava a implementação
com GitHub Models durante nossos testes. Para usar a implementação
com Copilot CLI, fixamos a ação neste commit do repositório oficial:

41caef41a74eb26f6d0c6b1e9941d691588e0b2b

Também configuramos model: "" porque o modelo gpt-4.1 não estava
disponível. Assim, o Copilot CLI escolheu seu modelo padrão.

## Tarefa 4 — Migrações D1 depois do merge

O workflow migrar.yml executa em push na main somente quando
há alterações em migrations/**.

PR com o workflow e a migração:
https://github.com/rennanraposo/oauth-lab-rennan/pull/3

A migração 0002_adiciona_coluna.sql contém:

```sql
ALTER TABLE notas ADD COLUMN observacao TEXT;
```

Execução que aplicou as migrações no D1 remoto:
https://github.com/rennanraposo/oauth-lab-rennan/actions/runs/38824216363

A própria execução também consultou a estrutura da tabela:

```bash
npx --yes wrangler d1 execute oauth-sessions-rennan --remote --command "PRAGMA table_info(notas)"
```

Trecho do resultado:

```json
{
  "cid": 3,
  "name": "observacao",
  "type": "TEXT",
  "notnull": 0,
  "dflt_value": null,
  "pk": 0
}
```

O resultado confirma a criação da coluna observacao, do tipo TEXT.

### Teste de merge sem alteração em migrations/

O PR #4 alterou apenas AVALIACAO.md e foi mesclado na main:
https://github.com/rennanraposo/oauth-lab-rennan/pull/4

Commit do merge:
109a28fb28674d2d2286914b77c1692abe11956d

Nesse commit, somente o workflow ci executou e passou:
https://github.com/rennanraposo/oauth-lab-rennan/actions/runs/38824952740

Não houve execução do workflow migrar, confirmando que o filtro
migrations/** evita sua execução quando apenas a documentação muda.

Execuções associadas ao commit:
https://github.com/rennanraposo/oauth-lab-rennan/actions?query=sha%3A109a28fb28674d2d2286914b77c1692abe11956d

## Perguntas

### 1. Por que o CI roda duas vezes com um PR aberto?

O push na branch dispara o evento push e a atualização do PR
dispara pull_request, pois configuramos os dois gatilhos.
Quando existe uma execução no commit de teste de merge do PR,
o resultado desse commit precisa passar para permitir a mesclagem;
não basta observar apenas a execução de push na branch.

### 2. Por que PRs de forks não recebem COPILOT_PAT?

O GitHub não disponibiliza os segredos do repositório de destino
para workflows de pull_request vindos de forks.
Isso impede que alguém altere o código ou o workflow em um fork
para tentar roubar o token durante a execução.

### 3. Por que declarar permissions?

Declaramos as permissões necessárias para não depender das
configurações padrão do GITHUB_TOKEN.
contents: read permite ler o código, e pull-requests: write permite
comentar no PR; ao remover a segunda, observamos a falha addComment.

### 4. A revisão da IA pode substituir o status check?

Não: a IA pode produzir sugestões irrelevantes, como oferecer
ações que nosso workflow não executa, e sua resposta precisa
ser interpretada por uma pessoa.
O CI executa verificações automáticas e seu resultado controla
o bloqueio do merge; um comentário da IA não substitui essas verificações.