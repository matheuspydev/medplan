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
  /** Opcional: informada, a escada ganha o degrau de faixa de IMC. */
  faixa_imc_cod?: string | null;
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
  perfil: Pick<AnaliseEntrada, 'sexo' | 'faixa_etaria_cod' | 'cid10_principal' | 'comorbidades' | 'faixa_imc_cod'>;
  horizonte_dias: number;
  n_minimo: number;
  nivel: NivelAnalise;
  n_perfis: number;
  dados_insuficientes: boolean;
  escada: DegrauEscada[];
  avisos: Aviso[];
  total_censurado: number;
  frequencia_prescricao: FrequenciaPrescricao;
  proveniencia: Proveniencia;
  recomendados: LinhaRecomendada[];
  sem_dados_suficientes: LinhaSemDadosSuficientes[];
}

/** {campo, mensagem}: formato dos erros 422 e dos alertas não bloqueantes. */
export interface ErroCampo {
  /** Caminho, ex. "tratamentos.0.desfecho.data_fim". Vazio quando o erro não é de um campo. */
  campo: string;
  mensagem: string;
}

// ---------------------------------------------------------------------------
// Painéis (POST /api/v1/paineis/...): proporções de stats.proporcao
// ---------------------------------------------------------------------------
/** Abaixo do n mínimo: só o denominador, sem casos, taxa, percentual ou IC (por contrato). */
export interface ProporcaoInsuficiente {
  suficiente: false;
  n_base: number;
}

export interface ProporcaoSuficiente extends ProporcaoArredondada {
  suficiente: true;
  /** casos */
  n: number;
  /** denominador */
  n_base: number;
  taxa: number;
}

export type ProporcaoPainel = ProporcaoSuficiente | ProporcaoInsuficiente;

export interface FrequenciaPrescricao {
  n_atendimentos: number;
  n_pacientes: number;
  classes: (ProporcaoPainel & { classe_terapeutica: string })[];
  medicamentos: (ProporcaoPainel & { medicamento_id: number; principio_ativo: string; classe_terapeutica: string })[];
}

/** Filtros globais. `diagnostico` = código CID-10 ou grupo ("F30-F39"); `comorbidades` 3 = "3 ou mais". */
export interface FiltrosGlobais {
  sexo?: Sexo;
  faixa_etaria_cod?: string;
  diagnostico?: string;
  faixa_imc_cod?: string;
  tabagista?: boolean;
  comorbidades?: number;
}

export type DivisaoGrupo = 'faixa' | 'sexo' | 'imc' | 'tabagismo';

export interface VisaoGeral {
  horizonte_dias: number;
  n_minimo: number;
  contagens: { n_pacientes: number; n_atendimentos: number; n_tratamentos: number; n_reacoes: number; n_medicamentos: number };
  diagnosticos: { codigo: string; descricao: string; n_pacientes: number }[];
  medicamentos: { medicamento_id: number; principio_ativo: string; codigo_atc: string; n_tratamentos: number }[];
  desfecho: { n_tratamentos: number; n_avaliavel: number; n_censurado: number; mantido: ProporcaoPainel; descontinuado: ProporcaoPainel };
  /** Denominador: os tratamentos descontinuados. */
  motivos: (ProporcaoPainel & { motivo: MotivoDescontinuacao; rotulo: string })[];
  classe_por_grupo: {
    dividir_por: DivisaoGrupo;
    fixados_por_filtro: DivisaoGrupo[];
    classes: string[];
    linhas: { rotulo: string; n_atendimentos: number; celulas: (ProporcaoPainel & { classe: string; n_atendimentos_classe: number })[] }[];
  };
  recentes: PacienteResumo[];
}

export interface PacienteResumo {
  chave_pseudonima: string;
  sexo: Sexo;
  faixa_etaria_cod: string;
  cid10: string;
  descricao_cid: string;
  medicamento_atual?: string;
  n_atendimentos: number;
  ultimo_atendimento: string;
}

export interface ListaPacientes {
  total: number;
  pagina: number;
  por_pagina: number;
  itens: PacienteResumo[];
}

export interface ReacaoRelatada {
  reacao_adversa_id: number;
  termo: string;
  soc: string;
  medicamento_id: number;
  principio_ativo: string;
  data_inicio_reacao: string | null;
  dias_ate_reacao: number | null;
  gravidade_observada: Gravidade;
  levou_descontinuacao: boolean;
}

export interface FichaPaciente {
  chave_pseudonima: string;
  sexo: Sexo;
  primeiro_atendimento: string;
  ultimo_atendimento: string;
  atendimentos: {
    sk_atendimento: number;
    data: string;
    faixa_etaria_cod: string;
    faixa_imc_cod: string | null;
    tabagista: boolean;
    qtd_comorbidades: number;
    cid10: string;
    medicamento_id: number;
    principio_ativo: string;
    linha_tratamento: number | null;
    status: StatusTratamento;
    dias_observados: number;
    reacoes: ReacaoRelatada[];
  }[];
  tratamentos: {
    medicamento_id: number;
    principio_ativo: string;
    linha_tratamento: number | null;
    data_inicio: string;
    data_ultima_observacao: string;
    status: StatusTratamento;
    encerrado: boolean;
    n_atendimentos: number;
  }[];
}

export interface PontoCurva {
  dia: number;
  sobrevida: number;
  ic_inferior: number;
  ic_superior: number;
  n_em_risco: number;
}

export interface FichaMedicamento {
  medicamento: Medicamento;
  horizonte_dias: number;
  n_minimo: number;
  contabilidade: { n_tratamentos: number; n_avaliavel: number; n_retidos: number; n_descontinuados: number; n_censurado: number };
  permanencia: ProporcaoPainel;
  descontinuacao_por_motivo: (ProporcaoPainel & { motivo: MotivoDescontinuacao; rotulo: string })[];
  /** null abaixo do n mínimo. */
  curva: { ate_dias: number; dias_censura: number[]; pontos: PontoCurva[] } | null;
  recebem: { sexos: OpcaoRotulo<Sexo>[]; linhas: { faixa_etaria_cod: string; rotulo: string; n_por_sexo: number[] }[] };
  reacoes: (ProporcaoPainel & { reacao_adversa_id: number; termo: string; soc: string })[];
  por_linha: { linha: '1' | '2' | '3+'; rotulo: string; n_tratamentos: number; permanencia: ProporcaoPainel }[];
  /** Tratamentos sem linha informada: fora da divisão por linha. */
  n_sem_linha: number;
}

export type LinhaTratamento = '1' | '2' | '3+';

export interface ResumoReacoes {
  n_minimo: number;
  contagens: {
    n_reacoes: number;
    n_tratamentos: number;
    tratamentos_com_reacao: ProporcaoPainel;
    levaram_descontinuacao: ProporcaoPainel;
    dias_ate_inicio: { n: number; mediana: number | null; q1: number | null; q3: number | null };
  };
  por_soc: { soc: string; n: number; termos: { termo: string; n: number }[] }[];
  gravidade: (ProporcaoPainel & { gravidade: Gravidade; rotulo: string })[];
  descontinuacao_por_gravidade: (ProporcaoPainel & { gravidade: Gravidade; rotulo: string })[];
  dias_por_faixa: { rotulo: string; n: number }[];
  reacao_x_medicamento: {
    medicamentos: { medicamento_id: number; principio_ativo: string; n_tratamentos: number }[];
    linhas: { reacao_adversa_id: number; termo: string; celulas: (ProporcaoPainel & { medicamento_id: number; n_tratamentos_com_reacao: number })[] }[];
  };
}

export interface PesoPorImc {
  medicamento: Medicamento;
  n_minimo: number;
  linhas: { faixa_imc_cod: string | null; rotulo: string; n_tratamentos: number; ganho_de_peso: ProporcaoPainel; perda_de_peso: ProporcaoPainel }[];
}

// ---------------------------------------------------------------------------
// POST /api/v1/atendimentos
// ---------------------------------------------------------------------------
export interface ReacaoAtendimentoEntrada {
  reacao_adversa_id: number;
  /** Medicamento que causou: pode ser o anterior ao prescrito nesta consulta. */
  medicamento_id: number;
  data_inicio_medicamento: string;
  data_inicio_reacao: string | null;
  gravidade_observada: Gravidade;
  levou_descontinuacao: boolean;
}

export interface AtendimentoEntrada {
  paciente: { chave_pseudonima: string; sexo?: Sexo | null };
  data_atendimento: string;
  faixa_etaria_cod: string;
  faixa_imc_cod: string | null;
  tabagismo: Tabagismo;
  cid10_principal: string;
  comorbidades: string[];
  medicamento_id: number;
  data_inicio_medicamento: string;
  linha_tratamento: number | null;
  status: StatusTratamento;
  reacoes: ReacaoAtendimentoEntrada[];
}

export interface AtendimentoCriado {
  chave_pseudonima: string;
  sk_atendimento: number;
  prescricao_id: number;
  n_atendimentos_paciente: number;
  primeiro_atendimento: boolean;
}

// ---------------------------------------------------------------------------
// Qualidade dos dados: POST /cargas, GET /qualidade, GET /qualidade/cargas/{id}
// ---------------------------------------------------------------------------
export interface ArquivoCsv {
  nome: string;
  /** UTF-8, separador ponto e vírgula, uma linha de cabeçalho. */
  conteudo: string;
}

export interface CargaEntrada {
  atendimentos: ArquivoCsv;
  reacoes?: ArquivoCsv;
  linhas_informadas?: number;
}

export type MotivoRejeicao = 'incompleto' | 'vocabulario' | 'data' | 'dominio' | 'vinculo' | 'duplicado';
export type SituacaoCarga = 'completa' | 'com_rejeicoes' | 'recusada';

export interface ResumoCarga {
  id: number;
  /** ISO com fuso (UTC). */
  criado_em: string;
  arquivo_atendimentos: string;
  arquivo_reacoes: string | null;
  linhas_informadas: number | null;
  /** Linhas dos dois arquivos. */
  lidas: number;
  aceitas: number;
  rejeitadas: number;
  lidas_atendimentos: number;
  situacao: SituacaoCarga;
  motivo_recusa: string | null;
}

export interface RejeicaoCarga {
  arquivo: 'atendimentos' | 'reacoes';
  linha: number;
  campo: string;
  motivo: MotivoRejeicao;
  mensagem: string;
  /** Só na resposta do envio: o valor recusado não é gravado. */
  valor?: string;
}

export interface DetalheCarga extends ResumoCarga {
  motivos: { motivo: MotivoRejeicao; rotulo: string; n: number }[];
  reconciliacao: {
    entidade: string;
    origem: number;
    banco: number;
    diferenca: number;
    rejeitadas: number | null;
    situacao: 'confere' | 'explicada' | 'a_conferir' | 'nao_processada';
  }[];
  /** Até 200, por arquivo e linha. */
  rejeicoes: RejeicaoCarga[];
  n_rejeicoes: number;
}

export interface Qualidade {
  cargas: ResumoCarga[];
  n_cargas: number;
  integridade: { verificacao: string; n: number }[];
  base: { n_atendimentos: number; n_pacientes: number };
  motivos: { motivo: MotivoRejeicao; rotulo: string }[];
}

// ---------------------------------------------------------------------------
// POST /medicamentos
// ---------------------------------------------------------------------------
export interface MedicamentoEntrada {
  codigo_atc: string;
  principio_ativo: string;
  classe_terapeutica: string;
}
