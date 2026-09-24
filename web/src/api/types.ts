/**
 * Tipos da API /api/v1 — espelho de CONTRATO_API.md (a REVISÃO 2 prevalece).
 *
 * Regras de contrato que os tipos tornam explícitas:
 * - Toda proporção traz n (ou n_base), floats crus (só para SVG) e inteiros já
 *   arredondados pelo backend (pct, ic_inferior_pct, ic_superior_pct). O front NUNCA arredonda.
 * - `sem_dados_suficientes` não tem nenhum campo de taxa/IC, por contrato.
 * - Nenhum tipo tem nome, CPF, prontuário, data de nascimento, endereço ou texto livre.
 */

// ---------------------------------------------------------------------------
// Enums do schema (db/sqlite/schema.sql). Rótulos pt-BR vêm de /referencias.opcoes.
// ---------------------------------------------------------------------------
export type Sexo = 'feminino' | 'masculino' | 'intersexo' | 'nao_informado';
export type Tabagismo = 'nunca' | 'ex_fumante' | 'atual' | 'desconhecido';
export type GestacaoLactacao = 'nao_aplicavel' | 'nao' | 'gestante' | 'lactante' | 'desconhecido';
export type FuncaoOrgao = 'normal' | 'alterada' | 'desconhecida';
export type UsoSubstancias = 'nenhum' | 'alcool' | 'outras' | 'multiplas' | 'desconhecido';
export type Via = 'oral' | 'intramuscular' | 'longa_acao' | 'outra';
export type Gravidade = 'leve' | 'moderada' | 'grave';
export type StatusTratamento =
  | 'em_uso'
  | 'perdido_seguimento'
  | 'concluido_sucesso'
  | 'desc_reacao_adversa'
  | 'desc_ineficacia'
  | 'desc_nao_adesao'
  | 'desc_outro';
export type MotivoDescontinuacao = 'desc_reacao_adversa' | 'desc_ineficacia' | 'desc_nao_adesao' | 'desc_outro';
/** Grupo do status em /referencias.opcoes.status_tratamento. */
export type GrupoStatus = 'censura' | 'sucesso' | 'descontinuacao';
export type TipoComorbidade = 'psiquiatrica' | 'clinica';

// ---------------------------------------------------------------------------
// GET /api/v1/referencias
// ---------------------------------------------------------------------------
export interface OpcaoRotulo<C extends string = string> {
  codigo: C;
  rotulo: string;
}

export interface OpcaoStatus extends OpcaoRotulo<StatusTratamento> {
  grupo: GrupoStatus;
}

export interface Diagnostico {
  codigo: string;
  descricao: string;
  /** Grupo CID do catálogo, ex. "F30-F39". */
  grupo: string;
  /** Perfis do hospital com esse CID principal. */
  n_perfis: number;
}

export interface Cid10 {
  codigo: string;
  descricao: string;
  grupo: string;
  /** 'psiquiatrica' se o código começa com F. */
  tipo: TipoComorbidade;
}

export interface FaixaCatalogo {
  codigo: string;
  rotulo: string;
  ordem: number;
}

export interface Medicamento {
  id: number;
  principio_ativo: string;
  codigo_atc: string;
  classe_terapeutica: string;
}

export interface ReacaoAdversaCatalogo {
  id: number;
  termo: string;
  soc: string;
  /** Existe no catálogo, mas a UI NÃO usa para pré-preencher gravidade. */
  gravidade_padrao: Gravidade;
}

export interface Referencias {
  ambiente: { dados_sinteticos: boolean; hospital: string };
  clinico_atual: { id: number; nome: string; papel: string };
  limites: {
    horizonte_padrao_dias: number;
    horizonte_min_dias: number;
    horizonte_max_dias: number;
    n_minimo_padrao: number;
    n_minimo_min: number;
    n_minimo_max: number;
  };
  diagnosticos: Diagnostico[];
  cid10: Cid10[];
  faixas_etarias: FaixaCatalogo[];
  faixas_imc: FaixaCatalogo[];
  medicamentos: Medicamento[];
  reacoes_adversas: ReacaoAdversaCatalogo[];
  opcoes: {
    sexo: OpcaoRotulo<Sexo>[];
    tabagismo: OpcaoRotulo<Tabagismo>[];
    gestacao_lactacao: OpcaoRotulo<GestacaoLactacao>[];
    funcao_renal: OpcaoRotulo<FuncaoOrgao>[];
    funcao_hepatica: OpcaoRotulo<FuncaoOrgao>[];
    uso_substancias: OpcaoRotulo<UsoSubstancias>[];
    via: OpcaoRotulo<Via>[];
    gravidade: OpcaoRotulo<Gravidade>[];
    status_tratamento: OpcaoStatus[];
    /** REVISÃO 2 §6: hoje ["mg"]; a lista real é pergunta para a médica. */
    unidades_dose: string[];
  };
}

// ---------------------------------------------------------------------------
// GET /api/v1/base
// ---------------------------------------------------------------------------
export interface BaseResumo {
  n_perfis: number;
  n_tratamentos: number;
  n_reacoes_registradas: number;
}

// ---------------------------------------------------------------------------
// POST /api/v1/analises
// ---------------------------------------------------------------------------
export interface AnaliseEntrada {
  sexo: Sexo;
  faixa_etaria_cod: string;
  cid10_principal: string;
  comorbidades: string[];
  /** 28–180 */
  horizonte_dias: number;
  /** 5–100 */
  n_minimo: number;
}

/** REVISÃO 2 §3: valor informado → valor usado, por critério ignorado. */
export interface Substituicao {
  /** Ordem: comorbidades clínicas, comorbidades psiquiátricas, faixa etária, sexo, código CID-10. */
  criterio: string;
  valor_informado: string;
  valor_usado: string;
  /** Só no critério CID-10: códigos do grupo no catálogo. */
  codigos_grupo?: string[];
  /** Só no critério CID-10: false quando o grupo tem um único código (o nível não ampliou nada). */
  grupo_amplia?: boolean;
}

export interface NivelAnalise {
  ordem: number;
  rotulo: string;
  criterios_relaxados: string[];
  substituicoes: Substituicao[];
}

export interface DegrauEscada extends NivelAnalise {
  n_perfis: number;
  n_medicamentos: number;
  melhor_n_avaliavel: number;
  atingiu_n_minimo: boolean;
  /** true no nível em que o motor parou. */
  selecionado: boolean;
}

export type TipoAviso = 'vies_indicacao' | 'relaxamento' | 'censura';

export interface Aviso {
  tipo: TipoAviso;
  /** Texto literal do motor (vies_indicacao = engine.AVISO_VIES_INDICACAO). */
  texto: string;
}

/** Campos comuns a toda proporção exibível. */
export interface ProporcaoArredondada {
  ic_inferior: number;
  ic_superior: number;
  /** Inteiros arredondados no Python: int(format(x, ".0%")[:-1]). */
  pct: number;
  ic_inferior_pct: number;
  ic_superior_pct: number;
}

export interface Permanencia extends ProporcaoArredondada {
  taxa: number;
  n_avaliavel: number;
  n_retidos: number;
  n_censurado: number;
}

export interface DescontinuacaoMotivo extends ProporcaoArredondada {
  motivo: MotivoDescontinuacao;
  rotulo: string;
  n: number;
  /** = n_avaliavel do medicamento */
  n_base: number;
  taxa: number;
}

export interface ReacaoFrequente extends ProporcaoArredondada {
  termo: string;
  soc: string;
  n: number;
  /** = n_episodios (inclui censurados) */
  n_base: number;
  proporcao: number;
  mediana_dias_ate_inicio: number | null;
  n_levou_descontinuacao: number;
}

export interface LinhaRecomendada {
  /** Ordem do motor (limite inferior do IC95%). A UI não reordena. */
  posicao: number;
  medicamento_id: number;
  principio_ativo: string;
  classe_terapeutica: string;
  codigo_atc: string;
  n_episodios: number;
  permanencia: Permanencia;
  /** Sempre os 4 motivos, inclusive n=0, na ordem fixa (REVISÃO 2 §2). */
  descontinuacao_por_motivo: DescontinuacaoMotivo[];
  /** Até 6, por n decrescente. */
  reacoes: ReacaoFrequente[];
}

/** Sem nenhum campo de taxa/proporção/IC — por contrato. */
export interface LinhaSemDadosSuficientes {
  medicamento_id: number;
  principio_ativo: string;
  classe_terapeutica: string;
  codigo_atc: string;
  n_episodios: number;
  n_avaliavel: number;
  n_censurado: number;
}

export interface Proveniencia {
  sintetico: boolean;
  n_perfis_base: number;
  /** ISO com fuso, ex. "2026-09-14T14:32:05-03:00". */
  calculado_em: string;
}

export interface AnaliseResposta {
  /** Eco do perfil; horizonte_dias e n_minimo ficam na raiz. */
  perfil: Pick<AnaliseEntrada, 'sexo' | 'faixa_etaria_cod' | 'cid10_principal' | 'comorbidades'>;
  horizonte_dias: number;
  n_minimo: number;
  nivel: NivelAnalise;
  n_perfis: number;
  dados_insuficientes: boolean;
  escada: DegrauEscada[];
  avisos: Aviso[];
  total_censurado: number;
  proveniencia: Proveniencia;
  recomendados: LinhaRecomendada[];
  sem_dados_suficientes: LinhaSemDadosSuficientes[];
}

// ---------------------------------------------------------------------------
// POST /api/v1/casos
// ---------------------------------------------------------------------------
export interface PerfilRegistro {
  sexo: Sexo;
  faixa_etaria_cod: string;
  cid10_principal: string;
  comorbidades: string[];
  /** Obrigatório na entrada; null = desconhecido. */
  faixa_imc_cod: string | null;
  tabagismo: Tabagismo;
  gestacao_lactacao: GestacaoLactacao;
  funcao_renal: FuncaoOrgao;
  funcao_hepatica: FuncaoOrgao;
  uso_substancias: UsoSubstancias;
}

export interface ReacaoEntrada {
  reacao_adversa_id: number;
  /** >= 0 ou null */
  dias_ate_inicio?: number | null;
  gravidade_observada: Gravidade;
  levou_descontinuacao: boolean;
}

export interface DesfechoEntrada {
  status: StatusTratamento;
  /** ISO aaaa-mm-dd. Obrigatória se encerrado; proibida se em_uso/perdido_seguimento. */
  data_fim?: string | null;
  data_ultima_observacao?: string | null;
  /** 1–5 ou null (não avaliada). */
  efetividade_percebida?: number | null;
}

export interface TratamentoEntrada {
  medicamento_id: number;
  data_inicio: string;
  /** > 0, até 2 casas. Sem faixa "plausível" (seria dado clínico inventado). */
  dose_inicial?: number | null;
  dose_manutencao?: number | null;
  unidade_dose?: string | null;
  via: Via;
  /** >= 1, opcional */
  linha_tratamento?: number | null;
  desfecho: DesfechoEntrada;
  reacoes: ReacaoEntrada[];
}

export interface CasoEntrada {
  perfil: PerfilRegistro;
  /** 1 a 10 */
  tratamentos: TratamentoEntrada[];
}

/** {campo, mensagem}: formato dos erros 422 e dos alertas não bloqueantes. */
export interface ErroCampo {
  /** Caminho, ex. "tratamentos.0.desfecho.data_fim". Vazio quando o erro não é de um campo. */
  campo: string;
  mensagem: string;
}

export interface CasoCriado {
  id: number;
  /** "REG-" + 8 caracteres sem ambíguos. */
  chave_pseudonima: string;
  tratamentos: number;
  reacoes: number;
  criado_em: string;
  /** Consistência NÃO bloqueante (REVISÃO 2 §8), pendente de validação da médica. */
  alertas: ErroCampo[];
}

// ---------------------------------------------------------------------------
// GET /api/v1/casos?limite=10
// ---------------------------------------------------------------------------
export interface CasoResumo {
  id: number;
  chave_pseudonima: string;
  /** Sempre por código; a UI mostra por extenso. */
  sexo: Sexo;
  faixa_etaria_cod: string;
  cid10_principal: string;
  comorbidades: string[];
  criado_em: string;
  n_reacoes: number;
  tratamentos: { principio_ativo: string; data_inicio: string; status: StatusTratamento }[];
}
