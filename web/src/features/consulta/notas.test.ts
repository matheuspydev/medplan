import { describe, expect, it } from 'vitest';
import { notaDeOrdem, textoNota } from './notas';

// Linhas SINTÉTICAS, com IC conferidos pelo ic_wilson do motor (valores da spec, sem significado clínico).
const linha = (nome: string, pct: number, inf: number, n: number) => ({
  principio_ativo: nome,
  permanencia: { pct, ic_inferior_pct: inf, n_avaliavel: n },
});

describe('nota de inversão e de empate da tabela 02', () => {
  it('a 1ª linha nunca tem nota', () => {
    expect(notaDeOrdem([linha('Fármaco A', 70, 54, 37)], 0)).toBeNull();
  });

  it('sem inversão e sem empate: nenhuma nota', () => {
    const linhas = [linha('Fármaco A', 70, 54, 37), linha('Fármaco B', 65, 48, 34)];
    expect(notaDeOrdem(linhas, 1)).toBeNull();
  });

  it('inversão com n menor: "Taxa pontual maior que a de B ..., n menor (29 vs. 34)"', () => {
    const linhas = [linha('Fármaco A', 70, 54, 37), linha('Fármaco B', 65, 48, 34), linha('Fármaco C', 66, 47, 29)];
    const nota = notaDeOrdem(linhas, 2);
    expect(nota).toEqual({ tipo: 'inversao', referencia: 'Fármaco B', n: 29, nReferencia: 34 });
    expect(textoNota(nota!)).toBe('Taxa pontual maior que a de Fármaco B, mas limite inferior do IC95% menor: n menor (29 vs. 34).');
  });

  it('inversão sem n menor: "IC mais largo"', () => {
    const linhas = [linha('Fármaco A', 60, 50, 30), linha('Fármaco B', 62, 45, 40)];
    expect(textoNota(notaDeOrdem(linhas, 1)!)).toBe('Taxa pontual maior que a de Fármaco A, mas limite inferior do IC95% menor: IC mais largo.');
  });

  it('usa a linha MAIS ALTA com taxa pontual menor', () => {
    const linhas = [linha('Fármaco A', 60, 55, 200), linha('Fármaco B', 58, 50, 150), linha('Fármaco C', 90, 49, 12)];
    expect(notaDeOrdem(linhas, 2)).toMatchObject({ tipo: 'inversao', referencia: 'Fármaco A', n: 12, nReferencia: 200 });
  });

  it('empate do limite inferior arredondado com a referência da inversão', () => {
    // exemplo do docstring do motor: 100% (n=21, IC 85–100) e 88% (n=300, IC 84–91) com limites próximos
    const linhas = [linha('Fármaco A', 88, 84, 300), linha('Fármaco B', 100, 84, 21)];
    const nota = notaDeOrdem(linhas, 1);
    expect(nota).toEqual({ tipo: 'empate', referencia: 'Fármaco A' });
    expect(textoNota(nota!)).toBe('Limite inferior do IC95% igual ao de Fármaco A após arredondamento; a ordem usa o valor não arredondado.');
  });

  it('empate com a linha logo acima, sem inversão', () => {
    const linhas = [linha('Fármaco A', 70, 48, 37), linha('Fármaco B', 65, 48, 60)];
    expect(notaDeOrdem(linhas, 1)).toEqual({ tipo: 'empate', referencia: 'Fármaco A' });
  });

  it('o texto das notas não imprime percentual (todo "%" sai de <Proporcao>)', () => {
    const linhas = [linha('Fármaco A', 70, 54, 37), linha('Fármaco B', 65, 48, 34), linha('Fármaco C', 66, 47, 29)];
    expect(textoNota(notaDeOrdem(linhas, 2)!).replaceAll('IC95%', '')).not.toMatch(/\d\s*%/);
  });

  it('n com ponto de milhar pt-BR', () => {
    const linhas = [linha('Fármaco A', 60, 58, 5000), linha('Fármaco B', 61, 57, 1200)];
    expect(textoNota(notaDeOrdem(linhas, 1)!)).toContain('n menor (1.200 vs. 5.000)');
  });
});
