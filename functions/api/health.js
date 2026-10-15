export function onRequestGet() {
  return Response.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } }
  );
}

async function consultarNotas(env, nome) {
  return env.DB
    .prepare("SELECT * FROM notas WHERE aluno = ?")
    .bind(nome)
    .all();
}
