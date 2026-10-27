/**
 * Ocupa as rotas do redesign cujas telas ainda não consomem a API.
 * Sai do código quando a última dessas telas for implementada.
 */
export function TelaEmConstrucao({ titulo }: { titulo: string }) {
  return (
    <div className="tela-em-construcao">
      <h1>{titulo}</h1>
      <p>Esta tela ainda não está ligada à API. Por enquanto, use a Consulta por perfil e o registro.</p>
    </div>
  );
}
