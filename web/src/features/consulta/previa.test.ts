import { describe, expect, it } from 'vitest';
import engineSrc from '../../../../medplan/engine.py?raw';
import matchingSrc from '../../../../medplan/matching.py?raw';
import { FRASE_COORTE_DIFERENTE } from './CriteriosIgnorados';
import { CRITERIOS_ESCADA, faixaAmpliada, previaRelaxamento } from './previa';
import { catalogoTeste } from './teste-fixtures';

const catalogo = catalogoTeste();

/** Sem a chave `nivel` da prévia: mesmo formato de `nivel.substituicoes` da API. */
const comoApi = (perfil: Parameters<typeof previaRelaxamento>[0]) => previaRelaxamento(perfil, catalogo).map(({ nivel: _nivel, ...resto }) => resto);

describe('prévia da escada (espelho de matching.py / substituições da API)', () => {
  it('F31.3 · feminino · 26_35 · sem comorbidade = substituições do nível 5 devolvidas pela API', () => {
    // Valores copiados de POST /api/v1/analises (amostra_analise_F313.json, escada[5].substituicoes).
    expect(comoApi({ dx: 'F31.3', sexo: 'feminino', faixa: '26_35', com: [] })).toEqual([
      { criterio: 'comorbidades clínicas', valor_informado: 'nenhuma', valor_usado: 'não filtradas' },
      { criterio: 'comorbidades psiquiátricas', valor_informado: 'nenhuma', valor_usado: 'não filtradas' },
      { criterio: 'faixa etária', valor_informado: '26 a 35 anos', valor_usado: '18 a 50 anos' },
      { criterio: 'sexo', valor_informado: 'feminino', valor_usado: 'todos' },
      {
        criterio: 'código CID-10',
        valor_informado: 'F31.3',
        valor_usado: 'grupo F30-F39',
        codigos_grupo: ['F31.1', 'F31.3', 'F31.9', 'F32.1', 'F32.2', 'F33.1', 'F33.2'],
        grupo_amplia: true,
      },
    ]);
  });

  it('F90.0 · masculino · 18_25: grupo de um só código não amplia; faixa 12 a 35 anos', () => {
    // Valores copiados de amostra_analise_F900.json (escada[5].substituicoes).
    expect(comoApi({ dx: 'F90.0', sexo: 'masculino', faixa: '18_25', com: [] })).toEqual([
      { criterio: 'comorbidades clínicas', valor_informado: 'nenhuma', valor_usado: 'não filtradas' },
      { criterio: 'comorbidades psiquiátricas', valor_informado: 'nenhuma', valor_usado: 'não filtradas' },
      { criterio: 'faixa etária', valor_informado: '18 a 25 anos', valor_usado: '12 a 35 anos' },
      { criterio: 'sexo', valor_informado: 'masculino', valor_usado: 'todos' },
      { criterio: 'código CID-10', valor_informado: 'F90.0', valor_usado: 'grupo F90-F98', codigos_grupo: ['F90.0'], grupo_amplia: false },
    ]);
  });

  it('comorbidades: capítulo F é psiquiátrica, o resto é clínica, na ordem informada', () => {
    const itens = previaRelaxamento({ dx: 'F31.3', sexo: 'feminino', faixa: '26_35', com: ['I10', 'F41.1', 'E11.9'] }, catalogo);
    expect(itens[0]).toMatchObject({ nivel: 1, valor_informado: 'I10, E11.9', valor_usado: 'não filtradas' });
    expect(itens[1]).toMatchObject({ nivel: 2, valor_informado: 'F41.1', valor_usado: 'não filtradas' });
  });

  it('faixas nas pontas do catálogo (ordem ± 1, como a subconsulta do matching)', () => {
    expect(faixaAmpliada('12_17', catalogo)).toBe('12 a 25 anos');
    expect(faixaAmpliada('51_65', catalogo)).toBe('36 anos ou mais');
    expect(faixaAmpliada('66_mais', catalogo)).toBe('51 anos ou mais');
  });

  it('campos vazios viram null (a tela mostra "—")', () => {
    const itens = previaRelaxamento({ dx: null, sexo: null, faixa: null, com: [] }, catalogo);
    expect(itens.map((i) => i.nivel)).toEqual([1, 2, 3, 4, 5]);
    expect(itens[2]).toMatchObject({ valor_informado: null, valor_usado: null });
    expect(itens[3]).toMatchObject({ valor_informado: null });
    expect(itens[4]).toMatchObject({ valor_informado: null, valor_usado: null });
  });

  it('a ordem dos critérios e as regras batem com matching.py', () => {
    const nivel5 = matchingSrc.match(/Nivel\(5,[\s\S]*?\(([\s\S]*?)\)\),/);
    expect(nivel5).not.toBeNull();
    const criterios = [...nivel5![1].matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    expect(criterios).toHaveLength(CRITERIOS_ESCADA.length);
    criterios.forEach((c, i) => expect(c.startsWith(CRITERIOS_ESCADA[i])).toBe(true));
    // faixa adjacente por ordem, grupo CID pelo catálogo, psiquiátrica = capítulo F
    expect(matchingSrc).toContain('SELECT ordem - 1 FROM faixa_etaria');
    expect(matchingSrc).toContain('SELECT ordem + 1 FROM faixa_etaria');
    expect(matchingSrc).toContain('SELECT codigo FROM cid10 WHERE grupo');
    expect(matchingSrc).toContain('c.upper().startswith("F")');
  });

  it('a frase final da caixa de critérios é literal do motor', () => {
    expect(engineSrc.replace(/"\s*\n\s*"/g, '')).toContain(FRASE_COORTE_DIFERENTE);
  });
});
