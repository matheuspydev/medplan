/**
 * Validação do Registro de caso — função pura, espelho das regras do servidor
 * (medplan/registro.py e CONTRATO_API.md, REVISÃO 2 item 8) mais os obrigatórios da UI.
 *
 * - `erros` BLOQUEIAM o envio. `tipo: 'obrigatorio'` só aparece no campo depois da tentativa de
 *   salvar; `tipo: 'formato'` (formato, ordem de datas, data futura, contradição) aparece já no blur.
 * - `alertas` NÃO bloqueiam (ocre, TriangleAlert). As três regras são pendentes de validação da médica.
 *
 * Mensagens idênticas às do servidor onde a regra é a mesma. Nenhuma mensagem repete valor do perfil
 * (as datas citadas são de referência do próprio formulário, como na spec).
 */
import { validarData } from '../../components/DateField';
import {
  chavePerfil,
  chaveReacao,
  chaveTratamento,
  diasEntre,
  ehCensura,
  ehDescontinuacao,
  ehEncerrado,
  type CampoPerfil,
  type Rascunho,
} from './modelo';

export interface Problema {
  chave: string;
  mensagem: string;
  tipo: 'obrigatorio' | 'formato';
}

export interface ResultadoValidacao {
  erros: Problema[];
  alertas: Problema[];
}

export interface ContextoValidacao {
  /** ISO aaaa-mm-dd; nenhuma data pode passar dele. */
  hoje: string;
  /** Chaves com texto que não forma valor (data incompleta, número inválido). */
  entradasInvalidas?: ReadonlySet<string>;
}

export const MSG = {
  diagnostico: 'Escolha o diagnóstico principal.',
  sexo: "Escolha o sexo; 'não informado' é uma opção válida.",
  faixaEtaria: 'Escolha a faixa etária.',
  comorbidadePrincipal: 'A comorbidade não pode ser o próprio diagnóstico principal.',
  faixaImc: "Escolha a faixa de IMC; 'desconhecida' é uma opção válida.",
  tabagismo: "Escolha o tabagismo; 'desconhecido' é uma opção válida.",
  gestacao: "Escolha gestação/lactação; 'não se aplica' e 'desconhecido' são opções válidas.",
  funcaoRenal: "Escolha a função renal; 'desconhecida' é uma opção válida.",
  funcaoHepatica: "Escolha a função hepática; 'desconhecida' é uma opção válida.",
  substancias: "Escolha o uso de substâncias; 'desconhecido' é uma opção válida.",
  medicamento: 'Escolha o medicamento.',
  dataInicio: 'Informe a data de início.',
  linha: 'Informe a linha de tratamento como número inteiro a partir de 1.',
  via: 'Escolha a via.',
  doseFormato: 'Informe a dose como número com até 2 casas decimais.',
  doseZero: 'A dose deve ser maior que zero.',
  unidade: 'Informe a unidade da dose.',
  status: 'Escolha o status do tratamento.',
  dataFim: 'Informe a data de fim: obrigatória quando o tratamento foi encerrado ou descontinuado.',
  ultimaObs: 'Informe a data da última observação: é o que define a censura.',
  termo: 'Escolha o termo da reação.',
  dias: 'Informe os dias até o início como número inteiro a partir de 0.',
  gravidade: 'Escolha a gravidade observada.',
  levou: 'Informe se a reação levou à descontinuação.',
  // Bloqueante (REVISÃO 2 §8): contradição lógica.
  levouSemDescontinuacao:
    'A reação foi marcada como causa de descontinuação, mas o status do tratamento indica que não houve descontinuação.',
  // Não bloqueantes (REVISÃO 2 §8), mesmas mensagens do servidor.
  alertaLevouOutroMotivo: 'A reação foi marcada como causa da descontinuação, mas o motivo registrado não é reação adversa.',
  alertaSemCausa: 'Descontinuado por reação adversa, mas nenhuma reação foi marcada como causa da descontinuação.',
  alertaDias: 'Os dias até o início da reação ultrapassam o período observado do tratamento.',
} as const;

const OBRIGATORIOS_PERFIL: [CampoPerfil, string][] = [
  ['cid10_principal', MSG.diagnostico],
  ['sexo', MSG.sexo],
  ['faixa_etaria_cod', MSG.faixaEtaria],
  ['faixa_imc_cod', MSG.faixaImc],
  ['tabagismo', MSG.tabagismo],
  ['gestacao_lactacao', MSG.gestacao],
  ['funcao_renal', MSG.funcaoRenal],
  ['funcao_hepatica', MSG.funcaoHepatica],
  ['uso_substancias', MSG.substancias],
];

/** Campos obrigatórios do perfil, na ordem da tela (para a contagem "n de 9" no resumo). */
export const CAMPOS_OBRIGATORIOS_PERFIL: readonly CampoPerfil[] = OBRIGATORIOS_PERFIL.map(([c]) => c);

export function validarRascunho(rascunho: Rascunho, contexto: ContextoValidacao): ResultadoValidacao {
  const { hoje } = contexto;
  const invalidas = contexto.entradasInvalidas ?? new Set<string>();
  const erros: Problema[] = [];
  const alertas: Problema[] = [];
  const erro = (chave: string, mensagem: string, tipo: Problema['tipo']) => erros.push({ chave, mensagem, tipo });
  const alerta = (chave: string, mensagem: string) => alertas.push({ chave, mensagem, tipo: 'formato' });

  /** Data: incompleta/futura/ordem (formato) ou ausente quando obrigatória. */
  function data(chave: string, iso: string | null, nome: string, obrigatoria: string | null, mins: { iso: string | null; rotulo: string }[] = []) {
    const incompleta = invalidas.has(chave) && !iso;
    if (!iso && !incompleta) {
      if (obrigatoria) erro(chave, obrigatoria, 'obrigatorio');
      return;
    }
    for (const min of [undefined, ...mins]) {
      if (min && !min.iso) continue;
      const mensagem = validarData({ iso, incompleta }, nome, { max: hoje, min: min ? { iso: min.iso!, rotulo: min.rotulo } : undefined });
      if (mensagem) {
        erro(chave, mensagem, 'formato');
        return;
      }
    }
  }

  // --- perfil ---------------------------------------------------------------
  const p = rascunho.perfil;
  for (const [campo, mensagem] of OBRIGATORIOS_PERFIL) {
    const valor = p[campo];
    const vazio = campo === 'faixa_imc_cod' ? valor === undefined : valor === null;
    if (vazio) erro(chavePerfil(campo), mensagem, 'obrigatorio');
  }
  if (p.cid10_principal && p.comorbidades.includes(p.cid10_principal)) {
    erro(chavePerfil('comorbidades'), MSG.comorbidadePrincipal, 'formato');
  }

  // --- tratamentos ------------------------------------------------------------
  for (const t of rascunho.tratamentos) {
    const k = (campo: Parameters<typeof chaveTratamento>[1]) => chaveTratamento(t.id, campo);

    if (t.medicamento_id === null) erro(k('medicamento_id'), MSG.medicamento, 'obrigatorio');
    data(k('data_inicio'), t.data_inicio, 'data de início', MSG.dataInicio);
    if (invalidas.has(k('linha_tratamento')) || (t.linha_tratamento !== null && t.linha_tratamento < 1)) {
      erro(k('linha_tratamento'), MSG.linha, 'formato');
    }
    if (t.via === null) erro(k('via'), MSG.via, 'obrigatorio');

    for (const campo of ['dose_inicial', 'dose_manutencao'] as const) {
      if (invalidas.has(k(campo))) erro(k(campo), MSG.doseFormato, 'formato');
      else if (t[campo] !== null && t[campo]! <= 0) erro(k(campo), MSG.doseZero, 'formato');
    }
    const temDose = t.dose_inicial !== null || t.dose_manutencao !== null || invalidas.has(k('dose_inicial')) || invalidas.has(k('dose_manutencao'));
    if (temDose && t.unidade_dose === null) erro(k('unidade_dose'), MSG.unidade, 'obrigatorio');

    if (t.status === null) erro(k('status'), MSG.status, 'obrigatorio');
    const inicio = { iso: t.data_inicio, rotulo: 'data de início' };
    if (!ehCensura(t.status)) {
      data(k('data_fim'), t.data_fim, 'data de fim', ehEncerrado(t.status) ? MSG.dataFim : null, [inicio]);
    }
    data(k('data_ultima_observacao'), t.data_ultima_observacao, 'data da última observação', ehCensura(t.status) ? MSG.ultimaObs : null, [
      inicio,
      ...(ehEncerrado(t.status) ? [{ iso: t.data_fim, rotulo: 'data de fim' }] : []),
    ]);

    // Dias observados como no motor: (data_fim ou última observação) - início.
    const fim = t.data_fim ?? t.data_ultima_observacao;
    const diasObservados = t.data_inicio && fim ? diasEntre(t.data_inicio, fim) : null;

    for (const r of t.reacoes) {
      const kr = (campo: Parameters<typeof chaveReacao>[2]) => chaveReacao(t.id, r.id, campo);
      if (r.reacao_adversa_id === null) erro(kr('reacao_adversa_id'), MSG.termo, 'obrigatorio');
      if (invalidas.has(kr('dias_ate_inicio'))) erro(kr('dias_ate_inicio'), MSG.dias, 'formato');
      else if (r.dias_ate_inicio !== null && diasObservados !== null && r.dias_ate_inicio > diasObservados) {
        alerta(kr('dias_ate_inicio'), MSG.alertaDias);
      }
      if (r.gravidade_observada === null) erro(kr('gravidade_observada'), MSG.gravidade, 'obrigatorio');
      if (r.levou_descontinuacao === null) erro(kr('levou_descontinuacao'), MSG.levou, 'obrigatorio');
      else if (r.levou_descontinuacao && t.status !== null && !ehDescontinuacao(t.status)) {
        erro(kr('levou_descontinuacao'), MSG.levouSemDescontinuacao, 'formato');
      } else if (r.levou_descontinuacao && ehDescontinuacao(t.status) && t.status !== 'desc_reacao_adversa') {
        alerta(kr('levou_descontinuacao'), MSG.alertaLevouOutroMotivo);
      }
    }
    if (t.status === 'desc_reacao_adversa' && !t.reacoes.some((r) => r.levou_descontinuacao === true)) {
      alerta(k('reacoes'), MSG.alertaSemCausa);
    }
  }

  return { erros, alertas };
}
