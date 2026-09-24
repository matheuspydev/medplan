/**
 * Normalização para busca local nos catálogos (CID-10, medicamentos, reações):
 * NFD sem diacríticos, sem caixa; em códigos, o ponto é opcional ("f313" casa "F31.3").
 */

const DIACRITICOS = /[̀-ͯ]/g;

/** "Depressão" -> "depressao". */
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(DIACRITICOS, '').toLowerCase();
}

/** "F31.3" -> "f313" (sem ponto e sem espaço). */
export function normalizarCodigo(texto: string): string {
  return normalizar(texto).replace(/[.\s]/g, '');
}

/**
 * Onde a consulta casa dentro do texto ORIGINAL, respeitando acento e ponto opcional.
 * Devolve [início, fim) em índices do texto original, ou null.
 * Ex.: trechoCasado("Episódio depressivo", "odio") -> [4, 8]; trechoCasado("F31.3", "f313", true) -> [0, 5].
 */
export function trechoCasado(
  original: string,
  consulta: string,
  ignorarPontos = false,
): [number, number] | null {
  const alvo = ignorarPontos ? normalizarCodigo(consulta) : normalizar(consulta);
  if (!alvo) return null;

  // normalizado[i] veio de original[mapa[i]]
  let normalizado = '';
  const mapa: number[] = [];
  let i = 0;
  for (const ch of original) {
    const pedaco = ignorarPontos ? normalizarCodigo(ch) : normalizar(ch);
    for (let k = 0; k < pedaco.length; k++) mapa.push(i);
    normalizado += pedaco;
    i += ch.length;
  }

  const pos = normalizado.indexOf(alvo);
  if (pos < 0) return null;
  const inicio = mapa[pos];
  const ultimo = mapa[pos + alvo.length - 1];
  const fim = ultimo + (original.codePointAt(ultimo)! > 0xffff ? 2 : 1);
  return [inicio, fim];
}
