/**
 * Notas automáticas que explicam a ORDEM da tabela 02 (o motor ordena pelo limite inferior do IC95%,
 * não pela taxa pontual). Calculadas só com números da API; a UI nunca reordena.
 *
 * Para cada linha i a partir da 2ª:
 * - j = a linha MAIS ALTA acima de i com taxa pontual (pct) menor que a de i.
 *   - Se existir e os limites inferiores arredondados forem diferentes: nota de INVERSÃO
 *     ("n menor" quando n(i) < n(j); senão "IC mais largo").
 *   - Se existir e os limites inferiores arredondados empatarem: nota de EMPATE com j.
 * - Sem j, se o limite inferior arredondado empata com o da linha logo acima: nota de EMPATE com ela.
 *
 * O texto não repete percentuais (todo "%" sai de <Proporcao>, com n e IC): as duas linhas comparadas
 * estão visíveis na mesma tabela, com o limite inferior destacado.
 */
import type { LinhaRecomendada } from '../../api/types';
import { formatarInteiro } from '../../lib/format';

export type NotaOrdem =
  | { tipo: 'inversao'; referencia: string; n: number; nReferencia: number }
  | { tipo: 'empate'; referencia: string };

type LinhaOrdem = Pick<LinhaRecomendada, 'principio_ativo'> & {
  permanencia: Pick<LinhaRecomendada['permanencia'], 'pct' | 'ic_inferior_pct' | 'n_avaliavel'>;
};

export function notaDeOrdem(linhas: readonly LinhaOrdem[], i: number): NotaOrdem | null {
  if (i <= 0 || i >= linhas.length) return null;
  const atual = linhas[i].permanencia;
  const j = linhas.slice(0, i).findIndex((l) => l.permanencia.pct < atual.pct);

  if (j >= 0) {
    const referencia = linhas[j];
    if (referencia.permanencia.ic_inferior_pct === atual.ic_inferior_pct) {
      return { tipo: 'empate', referencia: referencia.principio_ativo };
    }
    return { tipo: 'inversao', referencia: referencia.principio_ativo, n: atual.n_avaliavel, nReferencia: referencia.permanencia.n_avaliavel };
  }

  const anterior = linhas[i - 1];
  if (anterior.permanencia.ic_inferior_pct === atual.ic_inferior_pct) {
    return { tipo: 'empate', referencia: anterior.principio_ativo };
  }
  return null;
}

export function textoNota(nota: NotaOrdem): string {
  if (nota.tipo === 'empate') {
    return `Limite inferior do IC95% igual ao de ${nota.referencia} após arredondamento; a ordem usa o valor não arredondado.`;
  }
  const motivo = nota.n < nota.nReferencia ? `n menor (${formatarInteiro(nota.n)} vs. ${formatarInteiro(nota.nReferencia)})` : 'IC mais largo';
  return `Taxa pontual maior que a de ${nota.referencia}, mas limite inferior do IC95% menor: ${motivo}.`;
}
