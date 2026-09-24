/**
 * Prévia, ANTES de analisar, do que cada degrau da escada deixaria de exigir e do que usaria no lugar.
 *
 * Espelha matching.construir_consulta e o `_substituicoes` da API, só com o catálogo de /referencias:
 * - nível 1: comorbidades clínicas (as que não começam com F) deixam de ser filtradas;
 * - nível 2: comorbidades psiquiátricas (capítulo F) deixam de ser filtradas;
 * - nível 3: faixa etária vira a própria + as adjacentes por `ordem` (ordem - 1 a ordem + 1);
 * - nível 4: sexo deixa de ser filtrado;
 * - nível 5: CID-10 exato vira todos os códigos do mesmo `grupo` do catálogo.
 * As strings saem no mesmo formato da API (valor_informado/valor_usado), para a tela usar um só render.
 * Nada é calculado sobre pacientes aqui: é só a regra aplicada ao perfil digitado.
 */
import type { Catalogo } from '../../api/referencias';

/** Ordem em que os critérios caem na escada (glifos, prévia, caixa de critérios ignorados). */
export const CRITERIOS_ESCADA = ['comorbidades clínicas', 'comorbidades psiquiátricas', 'faixa etária', 'sexo', 'código CID-10'] as const;

export interface PerfilPrevia {
  dx: string | null;
  sexo: string | null;
  faixa: string | null;
  com: string[];
}

export interface ItemPrevia {
  /** Nível (1..5) em que o critério deixa de ser exigido. */
  nivel: number;
  criterio: (typeof CRITERIOS_ESCADA)[number];
  /** null = campo ainda vazio (a tela mostra "—"). */
  valor_informado: string | null;
  valor_usado: string | null;
  codigos_grupo?: string[];
  grupo_amplia?: boolean;
}

/** Comorbidade psiquiátrica = capítulo F (mesma regra de PerfilAlvo.comorbidades_psiquiatricas). */
export function ehPsiquiatrica(codigo: string): boolean {
  return codigo.toUpperCase().startsWith('F');
}

function numeros(rotulo: string): number[] {
  return (rotulo.match(/\d+/g) ?? []).map(Number);
}

/**
 * Faixa usada no nível 3: da menor idade da faixa adjacente inferior à maior idade da adjacente superior;
 * se a superior é a última do catálogo, "X anos ou mais". As idades vêm dos rótulos do catálogo.
 */
export function faixaAmpliada(codigo: string, catalogo: Catalogo): string | null {
  const alvo = catalogo.faixaEtaria(codigo);
  if (!alvo) return null;
  const todas = [...catalogo.referencias.faixas_etarias].sort((a, b) => a.ordem - b.ordem);
  const adjacentes = todas.filter((f) => f.ordem >= alvo.ordem - 1 && f.ordem <= alvo.ordem + 1);
  const primeira = adjacentes[0];
  const ultima = adjacentes[adjacentes.length - 1];
  const minimo = numeros(primeira.rotulo)[0];
  if (minimo === undefined) return null;
  if (ultima.ordem === todas[todas.length - 1].ordem) return `${minimo} anos ou mais`;
  const maximo = numeros(ultima.rotulo).at(-1);
  return maximo === undefined ? null : `${minimo} a ${maximo} anos`;
}

export function previaRelaxamento(perfil: PerfilPrevia, catalogo: Catalogo): ItemPrevia[] {
  const psiquiatricas = perfil.com.filter(ehPsiquiatrica);
  const clinicas = perfil.com.filter((c) => !ehPsiquiatrica(c));

  const grupo = perfil.dx ? (catalogo.cid(perfil.dx)?.grupo ?? catalogo.diagnostico(perfil.dx)?.grupo ?? null) : null;
  const codigos = grupo ? catalogo.codigosDoGrupo(grupo).map((c) => c.codigo) : [];

  return [
    { nivel: 1, criterio: 'comorbidades clínicas', valor_informado: clinicas.join(', ') || 'nenhuma', valor_usado: 'não filtradas' },
    { nivel: 2, criterio: 'comorbidades psiquiátricas', valor_informado: psiquiatricas.join(', ') || 'nenhuma', valor_usado: 'não filtradas' },
    {
      nivel: 3,
      criterio: 'faixa etária',
      valor_informado: perfil.faixa ? (catalogo.faixaEtaria(perfil.faixa)?.rotulo ?? null) : null,
      valor_usado: perfil.faixa ? faixaAmpliada(perfil.faixa, catalogo) : null,
    },
    {
      nivel: 4,
      criterio: 'sexo',
      valor_informado: perfil.sexo ? catalogo.rotuloOpcao('sexo', perfil.sexo).toLowerCase() : null,
      valor_usado: 'todos',
    },
    grupo
      ? {
          nivel: 5,
          criterio: 'código CID-10',
          valor_informado: perfil.dx,
          valor_usado: `grupo ${grupo}`,
          codigos_grupo: codigos,
          grupo_amplia: codigos.length > 1,
        }
      : { nivel: 5, criterio: 'código CID-10', valor_informado: null, valor_usado: null },
  ];
}
