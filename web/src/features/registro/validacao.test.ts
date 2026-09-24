import { describe, expect, it } from 'vitest';
import { chavePerfil, chaveReacao, chaveTratamento, novaReacao, novoRascunho, type Rascunho, type RascunhoReacao, type RascunhoTratamento } from './modelo';
import { MSG, validarRascunho, type ContextoValidacao } from './validacao';

// Dados SINTÉTICOS de forma: códigos e ids não descrevem paciente nem medicamento real.
const HOJE = '2026-09-14';
const ctx: ContextoValidacao = { hoje: HOJE };

function reacaoCompleta(extra: Partial<RascunhoReacao> = {}): RascunhoReacao {
  return { ...novaReacao(), reacao_adversa_id: 4, gravidade_observada: 'moderada', levou_descontinuacao: false, ...extra };
}

function rascunhoValido(tratamento: Partial<RascunhoTratamento> = {}): Rascunho {
  const r = novoRascunho();
  r.perfil = {
    cid10_principal: 'F32.1',
    sexo: 'feminino',
    faixa_etaria_cod: '26_35',
    comorbidades: ['E03.9'],
    faixa_imc_cod: null,
    tabagismo: 'desconhecido',
    gestacao_lactacao: 'nao_aplicavel',
    funcao_renal: 'desconhecida',
    funcao_hepatica: 'desconhecida',
    uso_substancias: 'desconhecido',
  };
  Object.assign(r.tratamentos[0], {
    medicamento_id: 1,
    data_inicio: '2026-03-02',
    via: 'oral',
    status: 'desc_ineficacia',
    data_fim: '2026-03-20',
    ...tratamento,
  });
  return r;
}

const tid = (r: Rascunho) => r.tratamentos[0].id;
const chaves = (lista: { chave: string }[]) => lista.map((p) => p.chave);
const achar = (lista: { chave: string; mensagem: string; tipo: string }[], chave: string) => lista.find((p) => p.chave === chave);

describe('validarRascunho: caso completo', () => {
  it('não tem erro nem alerta', () => {
    expect(validarRascunho(rascunhoValido(), ctx)).toEqual({ erros: [], alertas: [] });
  });
});

describe('validarRascunho: obrigatórios (só no submit)', () => {
  it('rascunho vazio exige todos os campos do perfil, sem pré-seleção', () => {
    const r = novoRascunho();
    const { erros } = validarRascunho(r, ctx);
    const t = tid(r);
    expect(chaves(erros)).toEqual([
      chavePerfil('cid10_principal'),
      chavePerfil('sexo'),
      chavePerfil('faixa_etaria_cod'),
      chavePerfil('faixa_imc_cod'),
      chavePerfil('tabagismo'),
      chavePerfil('gestacao_lactacao'),
      chavePerfil('funcao_renal'),
      chavePerfil('funcao_hepatica'),
      chavePerfil('uso_substancias'),
      chaveTratamento(t, 'medicamento_id'),
      chaveTratamento(t, 'data_inicio'),
      chaveTratamento(t, 'via'),
      chaveTratamento(t, 'status'),
    ]);
    expect(erros.every((e) => e.tipo === 'obrigatorio')).toBe(true);
    expect(achar(erros, chavePerfil('sexo'))?.mensagem).toBe(MSG.sexo);
  });

  it('faixa de IMC: undefined = não escolhida (erro); null = desconhecida (válida)', () => {
    const r = rascunhoValido();
    r.perfil.faixa_imc_cod = undefined;
    expect(chaves(validarRascunho(r, ctx).erros)).toEqual([chavePerfil('faixa_imc_cod')]);
    r.perfil.faixa_imc_cod = 'eutrofico';
    expect(validarRascunho(r, ctx).erros).toEqual([]);
  });

  it('comorbidade igual ao diagnóstico principal bloqueia', () => {
    const r = rascunhoValido();
    r.perfil.comorbidades = ['F32.1'];
    expect(validarRascunho(r, ctx).erros).toEqual([{ chave: chavePerfil('comorbidades'), mensagem: MSG.comorbidadePrincipal, tipo: 'formato' }]);
  });

  it('unidade obrigatória só quando há dose', () => {
    const r = rascunhoValido({ dose_inicial: 50 });
    expect(validarRascunho(r, ctx).erros).toEqual([{ chave: chaveTratamento(tid(r), 'unidade_dose'), mensagem: MSG.unidade, tipo: 'obrigatorio' }]);
    r.tratamentos[0].unidade_dose = 'mg';
    expect(validarRascunho(r, ctx).erros).toEqual([]);
    const semDose = rascunhoValido({ dose_manutencao: null });
    expect(validarRascunho(semDose, ctx).erros).toEqual([]);
  });

  it('dose: texto inválido, zero; nenhuma faixa "plausível"', () => {
    const r = rascunhoValido({ dose_inicial: 0, unidade_dose: 'mg' });
    expect(achar(validarRascunho(r, ctx).erros, chaveTratamento(tid(r), 'dose_inicial'))?.mensagem).toBe(MSG.doseZero);
    const invalida = rascunhoValido({ unidade_dose: 'mg' });
    const k = chaveTratamento(tid(invalida), 'dose_manutencao');
    expect(validarRascunho(invalida, { hoje: HOJE, entradasInvalidas: new Set([k]) }).erros).toEqual([{ chave: k, mensagem: MSG.doseFormato, tipo: 'formato' }]);
    // valor enorme continua válido: sem mínimo/máximo clínico inventado
    expect(validarRascunho(rascunhoValido({ dose_inicial: 99999.99, unidade_dose: 'mg' }), ctx).erros).toEqual([]);
  });

  it('linha de tratamento opcional, inteiro >= 1', () => {
    expect(validarRascunho(rascunhoValido({ linha_tratamento: null }), ctx).erros).toEqual([]);
    expect(validarRascunho(rascunhoValido({ linha_tratamento: 1 }), ctx).erros).toEqual([]);
    const r = rascunhoValido({ linha_tratamento: 0 });
    expect(validarRascunho(r, ctx).erros).toEqual([{ chave: chaveTratamento(tid(r), 'linha_tratamento'), mensagem: MSG.linha, tipo: 'formato' }]);
  });

  it('reação exige termo, gravidade e levou à descontinuação; dias é opcional', () => {
    const r = rascunhoValido();
    const reacao = novaReacao();
    r.tratamentos[0].reacoes = [reacao];
    const t = tid(r);
    expect(validarRascunho(r, ctx).erros).toEqual([
      { chave: chaveReacao(t, reacao.id, 'reacao_adversa_id'), mensagem: MSG.termo, tipo: 'obrigatorio' },
      { chave: chaveReacao(t, reacao.id, 'gravidade_observada'), mensagem: MSG.gravidade, tipo: 'obrigatorio' },
      { chave: chaveReacao(t, reacao.id, 'levou_descontinuacao'), mensagem: MSG.levou, tipo: 'obrigatorio' },
    ]);
  });

  it('dias até início: texto inválido é erro de formato', () => {
    const r = rascunhoValido();
    const reacao = reacaoCompleta();
    r.tratamentos[0].reacoes = [reacao];
    const k = chaveReacao(tid(r), reacao.id, 'dias_ate_inicio');
    expect(validarRascunho(r, { hoje: HOJE, entradasInvalidas: new Set([k]) }).erros).toEqual([{ chave: k, mensagem: MSG.dias, tipo: 'formato' }]);
  });
});

describe('validarRascunho: datas', () => {
  it('data de fim obrigatória quando encerrado ou descontinuado', () => {
    for (const status of ['concluido_sucesso', 'desc_reacao_adversa', 'desc_ineficacia', 'desc_nao_adesao', 'desc_outro'] as const) {
      const r = rascunhoValido({ status, data_fim: null, reacoes: status === 'desc_reacao_adversa' ? [reacaoCompleta({ levou_descontinuacao: true })] : [] });
      expect(validarRascunho(r, ctx).erros).toEqual([{ chave: chaveTratamento(tid(r), 'data_fim'), mensagem: MSG.dataFim, tipo: 'obrigatorio' }]);
    }
  });

  it('em uso / perdido: data de fim não é exigida; última observação é', () => {
    for (const status of ['em_uso', 'perdido_seguimento'] as const) {
      const r = rascunhoValido({ status, data_fim: null });
      expect(validarRascunho(r, ctx).erros).toEqual([{ chave: chaveTratamento(tid(r), 'data_ultima_observacao'), mensagem: MSG.ultimaObs, tipo: 'obrigatorio' }]);
      r.tratamentos[0].data_ultima_observacao = '2026-05-01';
      expect(validarRascunho(r, ctx).erros).toEqual([]);
    }
  });

  it('encerrado sem última observação é válido (vale a data de fim)', () => {
    expect(validarRascunho(rascunhoValido({ data_ultima_observacao: null }), ctx).erros).toEqual([]);
  });

  it('nenhuma data no futuro', () => {
    const r = rascunhoValido({ data_inicio: '2026-09-15', data_fim: '2026-09-16' });
    const t = tid(r);
    expect(validarRascunho(r, ctx).erros).toEqual([
      { chave: chaveTratamento(t, 'data_inicio'), mensagem: 'A data de início está no futuro; use uma data até 14/09/2026.', tipo: 'formato' },
      { chave: chaveTratamento(t, 'data_fim'), mensagem: 'A data de fim está no futuro; use uma data até 14/09/2026.', tipo: 'formato' },
    ]);
    const obs = rascunhoValido({ status: 'em_uso', data_fim: null, data_ultima_observacao: '2026-09-15' });
    expect(achar(validarRascunho(obs, ctx).erros, chaveTratamento(tid(obs), 'data_ultima_observacao'))?.mensagem).toBe(
      'A data da última observação está no futuro; use uma data até 14/09/2026.',
    );
    // hoje é permitido
    expect(validarRascunho(rascunhoValido({ data_fim: HOJE }), ctx).erros).toEqual([]);
  });

  it('data de fim anterior à data de início', () => {
    const r = rascunhoValido({ data_inicio: '2025-02-03', data_fim: '2025-02-01' });
    expect(validarRascunho(r, ctx).erros).toEqual([
      { chave: chaveTratamento(tid(r), 'data_fim'), mensagem: 'A data de fim é anterior à data de início (03/02/2025).', tipo: 'formato' },
    ]);
    // mesmo dia é válido
    expect(validarRascunho(rascunhoValido({ data_inicio: '2025-02-03', data_fim: '2025-02-03' }), ctx).erros).toEqual([]);
  });

  it('última observação: >= início e, se encerrado, >= data de fim', () => {
    const antesInicio = rascunhoValido({ status: 'em_uso', data_fim: null, data_ultima_observacao: '2026-03-01' });
    expect(achar(validarRascunho(antesInicio, ctx).erros, chaveTratamento(tid(antesInicio), 'data_ultima_observacao'))?.mensagem).toBe(
      'A data da última observação é anterior à data de início (02/03/2026).',
    );
    const antesFim = rascunhoValido({ data_ultima_observacao: '2026-03-10' });
    expect(validarRascunho(antesFim, ctx).erros).toEqual([
      {
        chave: chaveTratamento(tid(antesFim), 'data_ultima_observacao'),
        mensagem: 'A data da última observação é anterior à data de fim (20/03/2026).',
        tipo: 'formato',
      },
    ]);
  });

  it('data incompleta no blur vira erro de formato, não de obrigatório', () => {
    const r = rascunhoValido({ data_inicio: null });
    const k = chaveTratamento(tid(r), 'data_inicio');
    expect(validarRascunho(r, { hoje: HOJE, entradasInvalidas: new Set([k]) }).erros[0]).toEqual({
      chave: k,
      mensagem: 'Complete a data de início no formato dd/mm/aaaa.',
      tipo: 'formato',
    });
  });
});

describe('validarRascunho: consistência (REVISÃO 2 §8)', () => {
  it('BLOQUEIA: levou à descontinuação = sim com em uso, concluído ou perdido', () => {
    for (const status of ['em_uso', 'concluido_sucesso', 'perdido_seguimento'] as const) {
      const reacao = reacaoCompleta({ levou_descontinuacao: true });
      const r = rascunhoValido({ status, data_fim: status === 'concluido_sucesso' ? '2026-03-20' : null, data_ultima_observacao: '2026-04-01', reacoes: [reacao] });
      const { erros, alertas } = validarRascunho(r, ctx);
      expect(erros).toEqual([{ chave: chaveReacao(tid(r), reacao.id, 'levou_descontinuacao'), mensagem: MSG.levouSemDescontinuacao, tipo: 'formato' }]);
      expect(alertas).toEqual([]);
    }
  });

  it('NÃO bloqueia: levou = sim com outro motivo de descontinuação', () => {
    for (const status of ['desc_ineficacia', 'desc_nao_adesao', 'desc_outro'] as const) {
      const reacao = reacaoCompleta({ levou_descontinuacao: true });
      const r = rascunhoValido({ status, reacoes: [reacao] });
      const { erros, alertas } = validarRascunho(r, ctx);
      expect(erros).toEqual([]);
      expect(alertas).toEqual([{ chave: chaveReacao(tid(r), reacao.id, 'levou_descontinuacao'), mensagem: MSG.alertaLevouOutroMotivo, tipo: 'formato' }]);
    }
  });

  it('levou = sim com desc. por reação adversa: nem erro nem alerta', () => {
    const r = rascunhoValido({ status: 'desc_reacao_adversa', reacoes: [reacaoCompleta({ levou_descontinuacao: true })] });
    expect(validarRascunho(r, ctx)).toEqual({ erros: [], alertas: [] });
  });

  it('NÃO bloqueia: desc. por reação adversa sem nenhuma reação marcada como causa', () => {
    for (const reacoes of [[], [reacaoCompleta({ levou_descontinuacao: false })]]) {
      const r = rascunhoValido({ status: 'desc_reacao_adversa', reacoes });
      const { erros, alertas } = validarRascunho(r, ctx);
      expect(erros).toEqual([]);
      expect(alertas).toEqual([{ chave: chaveTratamento(tid(r), 'reacoes'), mensagem: MSG.alertaSemCausa, tipo: 'formato' }]);
    }
  });

  it('NÃO bloqueia: dias até início maior que os dias observados (fim ou última observação)', () => {
    // 02/03 a 20/03 = 18 dias observados
    const igual = rascunhoValido({ reacoes: [reacaoCompleta({ dias_ate_inicio: 18 })] });
    expect(validarRascunho(igual, ctx).alertas).toEqual([]);
    const reacao = reacaoCompleta({ dias_ate_inicio: 19 });
    const maior = rascunhoValido({ reacoes: [reacao] });
    expect(validarRascunho(maior, ctx)).toEqual({
      erros: [],
      alertas: [{ chave: chaveReacao(tid(maior), reacao.id, 'dias_ate_inicio'), mensagem: MSG.alertaDias, tipo: 'formato' }],
    });
    // em uso: conta até a última observação
    const emUso = rascunhoValido({ status: 'em_uso', data_fim: null, data_ultima_observacao: '2026-03-12', reacoes: [reacaoCompleta({ dias_ate_inicio: 11 })] });
    expect(validarRascunho(emUso, ctx).alertas).toHaveLength(1);
    // sem datas suficientes: não há como comparar
    const semDatas = rascunhoValido({ status: 'em_uso', data_fim: null, data_ultima_observacao: null, reacoes: [reacaoCompleta({ dias_ate_inicio: 500 })] });
    expect(validarRascunho(semDatas, ctx).alertas).toEqual([]);
  });
});
