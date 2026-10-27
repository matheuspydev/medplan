/**
 * Rascunho do Registrar atendimento (só em memória), validação local, corpo de POST /atendimentos
 * e o caminho dos erros 422 até o campo da tela.
 *
 * `null` em qualquer escolha = ainda não escolhido (a UI exige escolha explícita).
 * Exceção: `faixa_imc_cod`, onde `undefined` = não escolhida e `null` = "Não informado".
 *
 * Chaves de campo: o nome do campo ("data_atendimento", "chave", "sexo") e, nas reações,
 * "r7.gravidade_observada" (o id da reação não muda quando outra é removida).
 */
import type { AtendimentoEntrada, Gravidade, Sexo, StatusTratamento, Tabagismo } from '../../api/types';

/** Espelho de atendimento.FORMATO_CHAVE. */
export const FORMATO_CHAVE = /^[A-Z0-9][A-Z0-9-]{3,31}$/;

/** Causador "prescrito neste atendimento"; os anteriores são `${medicamento_id}|${data_inicio}`. */
export const CAUSADOR_ATUAL = 'atual';

export interface RascunhoReacao {
  id: number;
  reacao_adversa_id: number | null;
  causador: string | null;
  data_inicio_reacao: string | null;
  /** "Paciente não soube informar": a data vai como null. */
  sem_data: boolean;
  gravidade_observada: Gravidade | null;
  levou_descontinuacao: boolean | null;
}

export interface Rascunho {
  modo: 'existente' | 'novo';
  chave: string;
  /** Só no primeiro atendimento. */
  sexo: Sexo | null;
  data_atendimento: string | null;
  faixa_etaria_cod: string | null;
  faixa_imc_cod: string | null | undefined;
  tabagismo: Tabagismo | null;
  cid10_principal: string | null;
  comorbidades: string[];
  medicamento_id: number | null;
  data_inicio_medicamento: string | null;
  linha_tratamento: number | null;
  status: StatusTratamento | null;
  reacoes: RascunhoReacao[];
}

/** Medicamento anterior do paciente que pode ter causado a reação. */
export interface TratamentoAnterior {
  medicamento_id: number;
  data_inicio: string;
}

let proximoId = 1;

export function novaReacao(): RascunhoReacao {
  return {
    id: proximoId++,
    reacao_adversa_id: null,
    causador: null,
    data_inicio_reacao: null,
    sem_data: false,
    gravidade_observada: null,
    levou_descontinuacao: null,
  };
}

export function novoRascunho(chave: string | null): Rascunho {
  return {
    modo: chave ? 'existente' : 'novo',
    chave: chave ?? '',
    sexo: null,
    data_atendimento: null,
    faixa_etaria_cod: null,
    faixa_imc_cod: undefined,
    tabagismo: null,
    cid10_principal: null,
    comorbidades: [],
    medicamento_id: null,
    data_inicio_medicamento: null,
    linha_tratamento: null,
    status: null,
    reacoes: [],
  };
}

export const valorCausador = (t: TratamentoAnterior) => `${t.medicamento_id}|${t.data_inicio}`;

/** Medicamento e data de início do causador escolhido (null enquanto falta o necessário). */
export function causadorDe(r: RascunhoReacao, rascunho: Rascunho): TratamentoAnterior | null {
  if (r.causador === null) return null;
  if (r.causador === CAUSADOR_ATUAL) {
    if (rascunho.medicamento_id === null || rascunho.data_inicio_medicamento === null) return null;
    return { medicamento_id: rascunho.medicamento_id, data_inicio: rascunho.data_inicio_medicamento };
  }
  const [id, data] = r.causador.split('|');
  return { medicamento_id: Number(id), data_inicio: data };
}

// ---------------------------------------------------------------------------
// Validação local (o servidor revalida tudo)
// ---------------------------------------------------------------------------
export interface Pendencia {
  chave: string;
  rotulo: string;
  mensagem: string;
}

const ROTULOS: Record<string, string> = {
  chave: 'Paciente: chave pseudônima',
  sexo: 'Paciente: sexo',
  data_atendimento: 'Atendimento: data',
  faixa_etaria_cod: 'Atendimento: faixa etária',
  faixa_imc_cod: 'Atendimento: faixa de IMC',
  tabagismo: 'Atendimento: tabagismo',
  cid10_principal: 'Atendimento: diagnóstico principal',
  comorbidades: 'Atendimento: comorbidades',
  medicamento_id: 'Medicamento prescrito',
  data_inicio_medicamento: 'Data de início do medicamento',
  linha_tratamento: 'Linha de tratamento',
  status: 'Status do tratamento',
  reacao_adversa_id: 'termo',
  causador: 'medicamento que causou',
  data_inicio_reacao: 'data de início',
  gravidade_observada: 'gravidade',
  levou_descontinuacao: 'levou à descontinuação',
};

/** "r7.gravidade_observada" -> "Reação 2: gravidade" (posição atual). */
export function rotuloDaChave(chave: string, rascunho: Rascunho): string {
  const m = /^r(\d+)\.(.+)$/.exec(chave);
  if (!m) return ROTULOS[chave] ?? chave;
  const n = rascunho.reacoes.findIndex((r) => r.id === Number(m[1])) + 1;
  return `Reação ${n}: ${ROTULOS[m[2]]}`;
}

/**
 * Pendências na ordem do formulário. `pacienteEncontrado`: no modo "já registrado", a chave
 * precisa corresponder a um paciente da base (null = ainda buscando).
 */
export function validar(rascunho: Rascunho, hoje: string, pacienteEncontrado: boolean | null): Pendencia[] {
  const p: Pendencia[] = [];
  const falta = (chave: string, mensagem = 'Obrigatório.') => p.push({ chave, rotulo: rotuloDaChave(chave, rascunho), mensagem });
  const a = rascunho;

  if (!a.chave) falta('chave');
  else if (!FORMATO_CHAVE.test(a.chave)) falta('chave', 'Use a chave da exportação: 4 a 32 caracteres, letras maiúsculas, dígitos e hífen.');
  else if (a.modo === 'existente' && pacienteEncontrado === false) falta('chave', 'Nenhum paciente com esta chave. Se é a primeira consulta, use "Primeiro atendimento".');
  if (a.modo === 'novo' && a.sexo === null) falta('sexo');

  if (!a.data_atendimento) falta('data_atendimento');
  else if (a.data_atendimento > hoje) falta('data_atendimento', 'A data do atendimento não pode estar no futuro.');
  if (a.faixa_etaria_cod === null) falta('faixa_etaria_cod');
  if (a.faixa_imc_cod === undefined) falta('faixa_imc_cod');
  if (a.tabagismo === null) falta('tabagismo');
  if (a.cid10_principal === null) falta('cid10_principal');
  else if (a.comorbidades.includes(a.cid10_principal)) falta('comorbidades', 'A comorbidade não pode ser o próprio diagnóstico principal.');

  if (a.medicamento_id === null) falta('medicamento_id');
  if (!a.data_inicio_medicamento) falta('data_inicio_medicamento');
  else if (a.data_atendimento && a.data_inicio_medicamento > a.data_atendimento)
    falta('data_inicio_medicamento', 'O início do medicamento não pode ser depois do atendimento.');
  if (a.linha_tratamento === null) falta('linha_tratamento');
  if (a.status === null) falta('status');

  const vistas = new Set<string>();
  for (const r of a.reacoes) {
    const k = (campo: string) => `r${r.id}.${campo}`;
    const causador = causadorDe(r, a);
    if (r.reacao_adversa_id === null) falta(k('reacao_adversa_id'));
    else if (causador) {
      const par = `${r.reacao_adversa_id}|${causador.medicamento_id}`;
      if (vistas.has(par)) falta(k('reacao_adversa_id'), 'Reação repetida para o mesmo medicamento.');
      vistas.add(par);
    }
    if (r.causador === null) falta(k('causador'));
    if (!r.sem_data) {
      if (!r.data_inicio_reacao) falta(k('data_inicio_reacao'), 'Informe a data ou marque "Paciente não soube informar".');
      else if (causador && a.data_atendimento && !(causador.data_inicio <= r.data_inicio_reacao && r.data_inicio_reacao <= a.data_atendimento))
        falta(k('data_inicio_reacao'), 'A reação tem de começar entre o início do medicamento e o atendimento.');
    }
    if (r.gravidade_observada === null) falta(k('gravidade_observada'));
    if (r.levou_descontinuacao === null) falta(k('levou_descontinuacao'));
  }
  return p;
}

/** Rascunho sem pendências -> corpo exato de POST /atendimentos. */
export function montarEntrada(a: Rascunho): AtendimentoEntrada {
  return {
    paciente: a.modo === 'novo' ? { chave_pseudonima: a.chave, sexo: a.sexo } : { chave_pseudonima: a.chave },
    data_atendimento: a.data_atendimento!,
    faixa_etaria_cod: a.faixa_etaria_cod!,
    faixa_imc_cod: a.faixa_imc_cod ?? null,
    tabagismo: a.tabagismo!,
    cid10_principal: a.cid10_principal!,
    comorbidades: [...a.comorbidades],
    medicamento_id: a.medicamento_id!,
    data_inicio_medicamento: a.data_inicio_medicamento!,
    linha_tratamento: a.linha_tratamento,
    status: a.status!,
    reacoes: a.reacoes.map((r) => {
      const causador = causadorDe(r, a)!;
      return {
        reacao_adversa_id: r.reacao_adversa_id!,
        medicamento_id: causador.medicamento_id,
        data_inicio_medicamento: causador.data_inicio,
        data_inicio_reacao: r.sem_data ? null : r.data_inicio_reacao,
        gravidade_observada: r.gravidade_observada!,
        levou_descontinuacao: r.levou_descontinuacao!,
      };
    }),
  };
}

const CAMPOS_ATENDIMENTO = [
  'data_atendimento',
  'faixa_etaria_cod',
  'faixa_imc_cod',
  'tabagismo',
  'cid10_principal',
  'medicamento_id',
  'data_inicio_medicamento',
  'linha_tratamento',
  'status',
];

/**
 * Caminho de erro do servidor -> chave do campo no rascunho enviado.
 * null quando não corresponde a um campo da tela (vira mensagem geral).
 */
export function chaveDoCampoServidor(campo: string, enviado: Rascunho): string | null {
  if (campo === 'paciente.chave_pseudonima') return 'chave';
  if (campo === 'paciente.sexo') return enviado.modo === 'novo' ? 'sexo' : 'chave';
  if (CAMPOS_ATENDIMENTO.includes(campo)) return campo;
  if (/^comorbidades(\.\d+)?$/.test(campo)) return 'comorbidades';
  const m = /^reacoes\.(\d+)\.(\w+)$/.exec(campo);
  const reacao = m ? enviado.reacoes[Number(m[1])] : undefined;
  if (!m || !reacao) return null;
  const nome = m[2] === 'medicamento_id' || m[2] === 'data_inicio_medicamento' ? 'causador' : m[2];
  return nome in ROTULOS ? `r${reacao.id}.${nome}` : null;
}

/** id do elemento DOM do campo: "r7.gravidade_observada" -> "reg-r7-gravidade_observada". */
export function idDom(chave: string): string {
  return `reg-${chave.replace(/\./g, '-')}`;
}

/** Diferença em dias entre duas datas ISO (b - a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
