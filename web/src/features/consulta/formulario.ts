/**
 * Estado do rail da Consulta: restauração a partir do fragmento, validação e montagem da entrada da API.
 * CID, sexo e faixa são obrigatórios e SEM pré-seleção.
 */
import type { Catalogo } from '../../api/referencias';
import type { AnaliseEntrada, Referencias, Sexo } from '../../api/types';
import { decodificarFragmento, type EstadoFragmento } from './fragmento';

export interface Formulario {
  dx: string | null;
  sexo: Sexo | null;
  faixa: string | null;
  com: string[];
  /** null = vazio ou texto que não é inteiro. */
  h: number | null;
  nmin: number;
}

export type CampoConsulta = 'dx' | 'sexo' | 'faixa' | 'com' | 'h';
export type ErrosConsulta = Partial<Record<CampoConsulta, string>>;

/** Ordem de Tab do rail: o submit incompleto foca o primeiro campo inválido nesta ordem. */
export const ORDEM_CAMPOS: CampoConsulta[] = ['dx', 'sexo', 'faixa', 'com', 'h'];

/** Elemento que recebe o foco por campo (grupos de rádio: o primeiro rádio). */
export const ID_FOCO: Record<CampoConsulta | 'nmin', string> = {
  dx: 'consulta-dx',
  sexo: 'consulta-sexo-0',
  faixa: 'consulta-faixa-0',
  com: 'consulta-com',
  h: 'consulta-h',
  nmin: 'consulta-nmin',
};

export function formularioInicial(limites: Referencias['limites']): Formulario {
  return { dx: null, sexo: null, faixa: null, com: [], h: limites.horizonte_padrao_dias, nmin: limites.n_minimo_padrao };
}

/** Fragmento -> formulário, descartando o que o catálogo não reconhece. */
export function restaurarFormulario(hash: string, catalogo: Catalogo): Formulario {
  const { limites } = catalogo.referencias;
  const f: EstadoFragmento = decodificarFragmento(hash);
  const dx = f.dx && catalogo.diagnostico(f.dx) ? f.dx : null;
  return {
    dx,
    sexo: f.sexo,
    faixa: f.faixa && catalogo.faixaEtaria(f.faixa) ? f.faixa : null,
    com: f.com.filter((c) => catalogo.cid(c) && c !== dx),
    h: f.h ?? limites.horizonte_padrao_dias,
    nmin: f.nmin !== null && f.nmin >= limites.n_minimo_min && f.nmin <= limites.n_minimo_max ? f.nmin : limites.n_minimo_padrao,
  };
}

export function formularioVazio(f: Formulario, limites: Referencias['limites']): boolean {
  return !f.dx && !f.sexo && !f.faixa && f.com.length === 0 && f.h === limites.horizonte_padrao_dias && f.nmin === limites.n_minimo_padrao;
}

export function validarFormulario(f: Formulario, limites: Referencias['limites']): ErrosConsulta {
  const erros: ErrosConsulta = {};
  if (!f.dx) erros.dx = 'Escolha o diagnóstico principal (CID-10).';
  if (!f.sexo) erros.sexo = 'Escolha o sexo; "não informado" é uma opção válida.';
  if (!f.faixa) erros.faixa = 'Escolha a faixa etária.';
  if (f.dx && f.com.includes(f.dx)) erros.com = 'O diagnóstico principal também está nas comorbidades; remova-o de lá.';
  if (f.h === null || f.h < limites.horizonte_min_dias || f.h > limites.horizonte_max_dias) {
    erros.h = `Informe o horizonte em dias inteiros, de ${limites.horizonte_min_dias} a ${limites.horizonte_max_dias}.`;
  }
  return erros;
}

/** Só chamar com formulário válido. */
export function paraEntrada(f: Formulario): AnaliseEntrada {
  return {
    sexo: f.sexo!,
    faixa_etaria_cod: f.faixa!,
    cid10_principal: f.dx!,
    comorbidades: f.com,
    horizonte_dias: f.h!,
    n_minimo: f.nmin,
  };
}
