/**
 * Rascunho do Registro de caso (só em memória) e as chaves de campo usadas por validação,
 * erros do servidor, pendências e foco.
 *
 * `null` em qualquer escolha = ainda não escolhido (a UI exige escolha explícita).
 * Exceção: `faixa_imc_cod`, onde `undefined` = não escolhida e `null` = "Desconhecida".
 *
 * Chaves de campo (estáveis, não mudam quando um tratamento é removido):
 *   perfil.sexo · t3.data_inicio · t3.status · t3.reacoes · t3.r7.gravidade_observada
 * O servidor usa índices ("tratamentos.0.desfecho.data_fim"); `chaveDoCampoServidor` converte.
 */
import type { FuncaoOrgao, GestacaoLactacao, Gravidade, Sexo, StatusTratamento, Tabagismo, UsoSubstancias, Via } from '../../api/types';

export interface RascunhoPerfil {
  cid10_principal: string | null;
  sexo: Sexo | null;
  faixa_etaria_cod: string | null;
  comorbidades: string[];
  /** undefined = não escolhida; null = desconhecida. */
  faixa_imc_cod: string | null | undefined;
  tabagismo: Tabagismo | null;
  gestacao_lactacao: GestacaoLactacao | null;
  funcao_renal: FuncaoOrgao | null;
  funcao_hepatica: FuncaoOrgao | null;
  uso_substancias: UsoSubstancias | null;
}

export interface RascunhoReacao {
  id: number;
  reacao_adversa_id: number | null;
  dias_ate_inicio: number | null;
  gravidade_observada: Gravidade | null;
  levou_descontinuacao: boolean | null;
}

export interface RascunhoTratamento {
  id: number;
  medicamento_id: number | null;
  data_inicio: string | null;
  linha_tratamento: number | null;
  via: Via | null;
  dose_inicial: number | null;
  dose_manutencao: number | null;
  unidade_dose: string | null;
  status: StatusTratamento | null;
  data_fim: string | null;
  /** Encerrado sem valor: a tela mostra a data de fim e o payload a envia explicitamente. */
  data_ultima_observacao: string | null;
  efetividade_percebida: number | null;
  reacoes: RascunhoReacao[];
}

export interface Rascunho {
  perfil: RascunhoPerfil;
  tratamentos: RascunhoTratamento[];
}

export const MAX_TRATAMENTOS = 10;

/** Espelho de stats.STATUS_CENSURA: sem desfecho conhecido, data de fim não se aplica. */
export const STATUS_CENSURA: readonly StatusTratamento[] = ['em_uso', 'perdido_seguimento'];

export function ehCensura(status: StatusTratamento | null): boolean {
  return status !== null && STATUS_CENSURA.includes(status);
}

/** Encerrado = concluído ou descontinuado (data de fim obrigatória). */
export function ehEncerrado(status: StatusTratamento | null): boolean {
  return status !== null && !STATUS_CENSURA.includes(status);
}

export function ehDescontinuacao(status: StatusTratamento | null): boolean {
  return status !== null && status.startsWith('desc_');
}

let proximoId = 1;
function novoId(): number {
  return proximoId++;
}

export function novaReacao(): RascunhoReacao {
  return { id: novoId(), reacao_adversa_id: null, dias_ate_inicio: null, gravidade_observada: null, levou_descontinuacao: null };
}

export function novoTratamento(): RascunhoTratamento {
  return {
    id: novoId(),
    medicamento_id: null,
    data_inicio: null,
    linha_tratamento: null,
    via: null,
    dose_inicial: null,
    dose_manutencao: null,
    unidade_dose: null,
    status: null,
    data_fim: null,
    data_ultima_observacao: null,
    efetividade_percebida: null,
    reacoes: [],
  };
}

export function novoRascunho(): Rascunho {
  return {
    perfil: {
      cid10_principal: null,
      sexo: null,
      faixa_etaria_cod: null,
      comorbidades: [],
      faixa_imc_cod: undefined,
      tabagismo: null,
      gestacao_lactacao: null,
      funcao_renal: null,
      funcao_hepatica: null,
      uso_substancias: null,
    },
    tratamentos: [novoTratamento()],
  };
}

// ---------------------------------------------------------------------------
// Chaves de campo
// ---------------------------------------------------------------------------
export const CAMPOS_PERFIL = [
  'cid10_principal',
  'sexo',
  'faixa_etaria_cod',
  'comorbidades',
  'faixa_imc_cod',
  'tabagismo',
  'gestacao_lactacao',
  'funcao_renal',
  'funcao_hepatica',
  'uso_substancias',
] as const;
export type CampoPerfil = (typeof CAMPOS_PERFIL)[number];

/** Na ordem visual do bloco. `reacoes` é a seção inteira (alerta de causa). */
export const CAMPOS_TRATAMENTO = [
  'medicamento_id',
  'data_inicio',
  'linha_tratamento',
  'via',
  'dose_inicial',
  'dose_manutencao',
  'unidade_dose',
  'status',
  'data_fim',
  'data_ultima_observacao',
  'efetividade_percebida',
  'reacoes',
] as const;
export type CampoTratamento = (typeof CAMPOS_TRATAMENTO)[number];

export const CAMPOS_REACAO = ['reacao_adversa_id', 'dias_ate_inicio', 'gravidade_observada', 'levou_descontinuacao'] as const;
export type CampoReacao = (typeof CAMPOS_REACAO)[number];

export const chavePerfil = (campo: CampoPerfil) => `perfil.${campo}`;
export const chaveTratamento = (tid: number, campo: CampoTratamento) => `t${tid}.${campo}`;
export const chaveReacao = (tid: number, rid: number, campo: CampoReacao) => `t${tid}.r${rid}.${campo}`;

/** id do elemento DOM do campo: "perfil.sexo" -> "reg-perfil-sexo". */
export function idDom(chave: string): string {
  return `reg-${chave.replace(/\./g, '-')}`;
}

/**
 * Caminho de erro do servidor (422) -> chave estável do rascunho que foi enviado.
 * Devolve null quando o caminho não corresponde a um campo da tela (vira mensagem geral).
 */
export function chaveDoCampoServidor(campo: string, rascunho: Rascunho): string | null {
  const partes = campo.split('.');
  if (partes[0] === 'perfil') {
    // "perfil.comorbidades.2" aponta para o seletor de comorbidades inteiro
    const nome = partes[1];
    const valido = (CAMPOS_PERFIL as readonly string[]).includes(nome) && (partes.length === 2 || (nome === 'comorbidades' && partes.length === 3));
    return valido ? chavePerfil(nome as CampoPerfil) : null;
  }
  if (partes[0] !== 'tratamentos' || partes.length < 3) return null;

  const tratamento = rascunho.tratamentos[Number(partes[1])];
  if (!/^\d+$/.test(partes[1]) || !tratamento) return null;
  const resto = partes.slice(2);

  if (resto[0] === 'reacoes' && resto.length === 3) {
    const reacao = /^\d+$/.test(resto[1]) ? tratamento.reacoes[Number(resto[1])] : undefined;
    return reacao && (CAMPOS_REACAO as readonly string[]).includes(resto[2])
      ? chaveReacao(tratamento.id, reacao.id, resto[2] as CampoReacao)
      : null;
  }
  const nome = resto[0] === 'desfecho' && resto.length === 2 ? resto[1] : resto.length === 1 ? resto[0] : null;
  return nome && (CAMPOS_TRATAMENTO as readonly string[]).includes(nome) ? chaveTratamento(tratamento.id, nome as CampoTratamento) : null;
}

/** Todas as chaves do rascunho, na ordem do formulário (ordem das pendências). */
export function chavesEmOrdem(rascunho: Rascunho): string[] {
  const chaves = CAMPOS_PERFIL.map(chavePerfil);
  for (const t of rascunho.tratamentos) {
    for (const campo of CAMPOS_TRATAMENTO) {
      if (campo === 'reacoes') {
        chaves.push(chaveTratamento(t.id, 'reacoes'));
        for (const r of t.reacoes) chaves.push(...CAMPOS_REACAO.map((c) => chaveReacao(t.id, r.id, c)));
      } else {
        chaves.push(chaveTratamento(t.id, campo));
      }
    }
  }
  return chaves;
}

/** Rótulo curto do campo, para a lista de pendências. */
export const ROTULO_CAMPO: Record<CampoPerfil | CampoTratamento | CampoReacao, string> = {
  cid10_principal: 'Diagnóstico principal',
  sexo: 'Sexo',
  faixa_etaria_cod: 'Faixa etária',
  comorbidades: 'Comorbidades',
  faixa_imc_cod: 'Faixa de IMC',
  tabagismo: 'Tabagismo',
  gestacao_lactacao: 'Gestação/lactação',
  funcao_renal: 'Função renal',
  funcao_hepatica: 'Função hepática',
  uso_substancias: 'Uso de substâncias',
  medicamento_id: 'Medicamento',
  data_inicio: 'Data de início',
  linha_tratamento: 'Linha de tratamento',
  via: 'Via',
  dose_inicial: 'Dose inicial',
  dose_manutencao: 'Dose de manutenção',
  unidade_dose: 'Unidade da dose',
  status: 'Status',
  data_fim: 'Data de fim',
  data_ultima_observacao: 'Data da última observação',
  efetividade_percebida: 'Efetividade percebida',
  reacoes: 'Reações adversas',
  reacao_adversa_id: 'Termo',
  dias_ate_inicio: 'Dias até o início',
  gravidade_observada: 'Gravidade observada',
  levou_descontinuacao: 'Levou à descontinuação',
};

/** "t3.r7.gravidade_observada" -> "T1 · reação 2 · Gravidade observada" (posições atuais). */
export function descreverChave(chave: string, rascunho: Rascunho): string {
  const partes = chave.split('.');
  const campo = partes[partes.length - 1] as keyof typeof ROTULO_CAMPO;
  if (partes[0] === 'perfil') return `Perfil · ${ROTULO_CAMPO[campo]}`;
  const i = rascunho.tratamentos.findIndex((t) => `t${t.id}` === partes[0]);
  const prefixo = `T${i + 1}`;
  if (partes.length === 3) {
    const j = rascunho.tratamentos[i]?.reacoes.findIndex((r) => `r${r.id}` === partes[1]) ?? -1;
    return `${prefixo} · reação ${j + 1} · ${ROTULO_CAMPO[campo]}`;
  }
  return `${prefixo} · ${ROTULO_CAMPO[campo]}`;
}

/** Diferença em dias entre duas datas ISO (b - a). */
export function diasEntre(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}
