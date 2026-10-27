/**
 * Cliente tipado da API /api/v1.
 *
 * - Nunca registra corpo de requisição/resposta (nada vai para o console).
 * - Falhas viram ErroApi com `erros: {campo, mensagem}[]` já normalizados, inclusive o
 *   422 padrão do FastAPI ({loc, msg}). O campo `input` do pydantic é descartado para
 *   nunca ecoar valores do perfil numa mensagem.
 * - O perfil vai sempre no CORPO de um POST, nunca em query string.
 */
import type {
  AnaliseEntrada,
  AnaliseResposta,
  AtendimentoCriado,
  AtendimentoEntrada,
  CargaEntrada,
  DetalheCarga,
  Medicamento,
  MedicamentoEntrada,
  Qualidade,
  DivisaoGrupo,
  FichaMedicamento,
  FichaPaciente,
  FiltrosGlobais,
  LinhaTratamento,
  ListaPacientes,
  PesoPorImc,
  ResumoReacoes,
  Sexo,
  VisaoGeral,
  BaseResumo,
  ErroCampo,
  Referencias,
} from './types';

export const API_BASE = '/api/v1';

export class ErroApi extends Error {
  /** HTTP status; 0 quando não houve resposta (rede/servidor fora do ar). */
  readonly status: number;
  /** Sempre ao menos um item. Em 422, um por campo inválido. */
  readonly erros: ErroCampo[];

  constructor(status: number, erros: ErroCampo[]) {
    super(erros[0]?.mensagem ?? 'Falha na API.');
    this.name = 'ErroApi';
    this.status = status;
    this.erros = erros;
  }
}

function mensagemGenerica(status: number): string {
  if (status === 0) return 'Não foi possível falar com o servidor. Verifique se a API está em execução.';
  return `O servidor respondeu com erro (HTTP ${status}).`;
}

/** Normaliza `detail` de erro em {campo, mensagem}[]. Aceita o formato do contrato e o do FastAPI. */
export function normalizarDetalhe(detail: unknown, status: number): ErroCampo[] {
  if (typeof detail === 'string' && detail.trim()) return [{ campo: '', mensagem: detail }];
  if (!Array.isArray(detail)) return [{ campo: '', mensagem: mensagemGenerica(status) }];

  const erros: ErroCampo[] = [];
  for (const item of detail) {
    if (!item || typeof item !== 'object') continue;
    const registro = item as Record<string, unknown>;
    if (typeof registro.mensagem === 'string') {
      erros.push({ campo: typeof registro.campo === 'string' ? registro.campo : '', mensagem: registro.mensagem });
    } else if (typeof registro.msg === 'string') {
      const loc = Array.isArray(registro.loc) ? registro.loc : [];
      const campo = loc.filter((p) => p !== 'body').map(String).join('.');
      erros.push({ campo, mensagem: registro.msg });
    }
  }
  return erros.length ? erros : [{ campo: '', mensagem: mensagemGenerica(status) }];
}

async function requisitar<T>(metodo: 'GET' | 'POST', caminho: string, corpo?: unknown, signal?: AbortSignal): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(`${API_BASE}${caminho}`, {
      method: metodo,
      headers: corpo === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ErroApi(0, [{ campo: '', mensagem: mensagemGenerica(0) }]);
  }

  if (!resposta.ok) {
    let detail: unknown;
    try {
      detail = ((await resposta.json()) as { detail?: unknown }).detail;
    } catch {
      detail = undefined;
    }
    throw new ErroApi(resposta.status, normalizarDetalhe(detail, resposta.status));
  }
  return (await resposta.json()) as T;
}

export function obterReferencias(signal?: AbortSignal): Promise<Referencias> {
  return requisitar('GET', '/referencias', undefined, signal);
}

export function obterBase(signal?: AbortSignal): Promise<BaseResumo> {
  return requisitar('GET', '/base', undefined, signal);
}

export function criarAnalise(entrada: AnaliseEntrada, signal?: AbortSignal): Promise<AnaliseResposta> {
  return requisitar('POST', '/analises', entrada, signal);
}

export function registrarAtendimento(entrada: AtendimentoEntrada, signal?: AbortSignal): Promise<AtendimentoCriado> {
  return requisitar('POST', '/atendimentos', entrada, signal);
}

// ---- painéis: POST com corpo (filtros e chave nunca vão na URL) ----------------------
export function obterVisaoGeral(
  entrada: { filtros: FiltrosGlobais; dividir_por: DivisaoGrupo; horizonte_dias?: number; n_minimo?: number },
  signal?: AbortSignal,
): Promise<VisaoGeral> {
  return requisitar('POST', '/paineis/visao-geral', entrada, signal);
}

export function listarPacientes(
  entrada: { q?: string; sexo?: Sexo; faixa_etaria_cod?: string; grupo?: string; pagina: number; por_pagina?: number },
  signal?: AbortSignal,
): Promise<ListaPacientes> {
  return requisitar('POST', '/paineis/pacientes', entrada, signal);
}

export function obterPaciente(chave_pseudonima: string, signal?: AbortSignal): Promise<FichaPaciente> {
  return requisitar('POST', '/paineis/paciente', { chave_pseudonima }, signal);
}

export function obterFichaMedicamento(
  entrada: { medicamento_id: number; filtros: FiltrosGlobais; horizonte_dias?: number; n_minimo?: number },
  signal?: AbortSignal,
): Promise<FichaMedicamento> {
  return requisitar('POST', '/paineis/medicamento', entrada, signal);
}

export function obterResumoReacoes(
  entrada: { filtros: FiltrosGlobais; medicamento_id?: number; linha?: LinhaTratamento; n_minimo?: number },
  signal?: AbortSignal,
): Promise<ResumoReacoes> {
  return requisitar('POST', '/paineis/reacoes', entrada, signal);
}

export function obterPesoPorImc(
  entrada: { medicamento_id: number; filtros: FiltrosGlobais; n_minimo?: number },
  signal?: AbortSignal,
): Promise<PesoPorImc> {
  return requisitar('POST', '/paineis/peso-por-imc', entrada, signal);
}

// ---- qualidade dos dados ---------------------------------------------------------
export function enviarCarga(entrada: CargaEntrada, signal?: AbortSignal): Promise<DetalheCarga> {
  return requisitar('POST', '/cargas', entrada, signal);
}

export function obterQualidade(signal?: AbortSignal): Promise<Qualidade> {
  return requisitar('GET', '/qualidade', undefined, signal);
}

export function obterCarga(id: number, signal?: AbortSignal): Promise<DetalheCarga> {
  return requisitar('GET', `/qualidade/cargas/${encodeURIComponent(id)}`, undefined, signal);
}

export function adicionarMedicamento(entrada: MedicamentoEntrada, signal?: AbortSignal): Promise<Medicamento> {
  return requisitar('POST', '/medicamentos', entrada, signal);
}
