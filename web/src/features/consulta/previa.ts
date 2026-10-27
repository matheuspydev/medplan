/**
 * Prévia, ANTES de analisar, do que cada degrau da escada deixaria de exigir e do que usaria no lugar.
 *
 * Espelha matching.construir_consulta e o `_substituicoes` da API, só com o catálogo de /referencias:
 * - nível 1: comorbidades clínicas (as que não começam com F) deixam de ser filtradas;
 * - nível 2: comorbidades psiquiátricas (capítulo F) deixam de ser filtradas;
 * - com faixa de IMC informada, um degrau a mais aqui: a faixa de IMC vira a própria + as adjacentes;
 * - depois: faixa etária vira a própria + as adjacentes por `ordem` (ordem - 1 a ordem + 1);
 * - depois: sexo deixa de ser filtrado;
 * - por fim: CID-10 exato vira todos os códigos do mesmo `grupo` do catálogo.
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
  imc: string | null;
  com: string[];
}

export interface ItemPrevia {
  /** Nível em que o critério deixa de ser exigido (1..5; 1..6 com IMC). */
  nivel: number;
  criterio: (typeof CRITERIOS_ESCADA)[number] | 'faixa de IMC';
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

/** Mesmo texto da API: sem comorbidade informada, afrouxar faz entrar quem tem comorbidade. */
function comorbidades(informadas: string[]): { valor_informado: string; valor_usado: string } {
  return informadas.length
    ? { valor_informado: informadas.join(', '), valor_usado: 'qualquer comorbidade' }
    : { valor_informado: 'sem comorbidades', valor_usado: 'com ou sem comorbidades' };
}

/** Faixas de IMC adjacentes (mesma subconsulta do matching): "primeira a última", como na API. */
export function imcAmpliado(codigo: string, catalogo: Catalogo): string | null {
  const alvo = catalogo.faixaImc(codigo);
  if (!alvo) return null;
  const adjacentes = [...catalogo.referencias.faixas_imc].sort((a, b) => a.ordem - b.ordem).filter((f) => Math.abs(f.ordem - alvo.ordem) <= 1);
  return [...new Set([adjacentes[0].rotulo, adjacentes[adjacentes.length - 1].rotulo])].join(' a ');
}

export function previaRelaxamento(perfil: PerfilPrevia, catalogo: Catalogo): ItemPrevia[] {
  const psiquiatricas = perfil.com.filter(ehPsiquiatrica);
  const clinicas = perfil.com.filter((c) => !ehPsiquiatrica(c));

  const grupo = perfil.dx ? (catalogo.cid(perfil.dx)?.grupo ?? catalogo.diagnostico(perfil.dx)?.grupo ?? null) : null;
  const codigos = grupo ? catalogo.codigosDoGrupo(grupo).map((c) => c.codigo) : [];

  const itens: Omit<ItemPrevia, 'nivel'>[] = [
    { criterio: 'comorbidades clínicas', ...comorbidades(clinicas) },
    { criterio: 'comorbidades psiquiátricas', ...comorbidades(psiquiatricas) },
    ...(perfil.imc
      ? [{ criterio: 'faixa de IMC' as const, valor_informado: catalogo.faixaImc(perfil.imc)?.rotulo ?? null, valor_usado: imcAmpliado(perfil.imc, catalogo) }]
      : []),
    {
      criterio: 'faixa etária',
      valor_informado: perfil.faixa ? (catalogo.faixaEtaria(perfil.faixa)?.rotulo ?? null) : null,
      valor_usado: perfil.faixa ? faixaAmpliada(perfil.faixa, catalogo) : null,
    },
    {
      criterio: 'sexo',
      valor_informado: perfil.sexo ? catalogo.rotuloOpcao('sexo', perfil.sexo).toLowerCase() : null,
      valor_usado: 'todos',
    },
    grupo
      ? { criterio: 'código CID-10', valor_informado: perfil.dx, valor_usado: `grupo ${grupo}`, codigos_grupo: codigos, grupo_amplia: codigos.length > 1 }
      : { criterio: 'código CID-10', valor_informado: null, valor_usado: null },
  ];
  return itens.map((item, i) => ({ ...item, nivel: i + 1 }));
}
