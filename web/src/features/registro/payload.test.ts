import { describe, expect, it } from 'vitest';
import { chavePerfil, chaveDoCampoServidor, chaveReacao, chaveTratamento, descreverChave, novaReacao, novoRascunho, novoTratamento, type Rascunho } from './modelo';
import { fragmentoConsulta, montarPayload } from './payload';

// Dados SINTÉTICOS de forma (sem significado clínico).
function rascunhoCompleto(): Rascunho {
  const r = novoRascunho();
  r.perfil = {
    cid10_principal: 'F32.1',
    sexo: 'feminino',
    faixa_etaria_cod: '26_35',
    comorbidades: ['E03.9'],
    faixa_imc_cod: undefined,
    tabagismo: 'desconhecido',
    gestacao_lactacao: 'nao_aplicavel',
    funcao_renal: 'desconhecida',
    funcao_hepatica: 'desconhecida',
    uso_substancias: 'desconhecido',
  };
  r.perfil.faixa_imc_cod = null;
  Object.assign(r.tratamentos[0], {
    medicamento_id: 1,
    data_inicio: '2026-03-02',
    dose_inicial: 50,
    dose_manutencao: 100,
    unidade_dose: 'mg',
    via: 'oral',
    linha_tratamento: 1,
    status: 'desc_reacao_adversa',
    data_fim: '2026-03-20',
    data_ultima_observacao: null,
    efetividade_percebida: 2,
    reacoes: [{ ...novaReacao(), reacao_adversa_id: 4, dias_ate_inicio: 5, gravidade_observada: 'moderada', levou_descontinuacao: true }],
  });
  return r;
}

describe('montarPayload', () => {
  it('produz exatamente a forma do contrato (CONTRATO_API.md, POST /casos)', () => {
    const payload = montarPayload(rascunhoCompleto());
    // toStrictEqual falha com qualquer chave a mais ou a menos (inclusive id interno do rascunho)
    expect(payload).toStrictEqual({
      perfil: {
        sexo: 'feminino',
        faixa_etaria_cod: '26_35',
        cid10_principal: 'F32.1',
        comorbidades: ['E03.9'],
        faixa_imc_cod: null,
        tabagismo: 'desconhecido',
        gestacao_lactacao: 'nao_aplicavel',
        funcao_renal: 'desconhecida',
        funcao_hepatica: 'desconhecida',
        uso_substancias: 'desconhecido',
      },
      tratamentos: [
        {
          medicamento_id: 1,
          data_inicio: '2026-03-02',
          dose_inicial: 50,
          dose_manutencao: 100,
          unidade_dose: 'mg',
          via: 'oral',
          linha_tratamento: 1,
          desfecho: { status: 'desc_reacao_adversa', data_fim: '2026-03-20', data_ultima_observacao: '2026-03-20', efetividade_percebida: 2 },
          reacoes: [{ reacao_adversa_id: 4, dias_ate_inicio: 5, gravidade_observada: 'moderada', levou_descontinuacao: true }],
        },
      ],
    });
  });

  it('nunca carrega campo de identificação ou texto livre', () => {
    const texto = JSON.stringify(montarPayload(rascunhoCompleto()));
    for (const proibido of ['nome', 'cpf', 'prontuario', 'nascimento', 'endereco', 'observacoes', '"id"', 'aberto']) {
      expect(texto).not.toContain(proibido);
    }
  });

  it('encerrado: última observação explícita prevalece; senão vai a data de fim', () => {
    const r = rascunhoCompleto();
    r.tratamentos[0].data_ultima_observacao = '2026-04-01';
    expect(montarPayload(r).tratamentos[0].desfecho.data_ultima_observacao).toBe('2026-04-01');
  });

  it('em uso: data de fim null e última observação como digitada; opcionais vazios saem null', () => {
    const r = rascunhoCompleto();
    Object.assign(r.tratamentos[0], {
      status: 'em_uso',
      data_fim: null,
      data_ultima_observacao: '2026-05-01',
      dose_inicial: null,
      dose_manutencao: null,
      unidade_dose: null,
      linha_tratamento: null,
      efetividade_percebida: null,
      reacoes: [],
    });
    const t = montarPayload(r).tratamentos[0];
    expect(t.desfecho).toStrictEqual({ status: 'em_uso', data_fim: null, data_ultima_observacao: '2026-05-01', efetividade_percebida: null });
    expect([t.dose_inicial, t.dose_manutencao, t.unidade_dose, t.linha_tratamento]).toEqual([null, null, null, null]);
    expect(t.reacoes).toEqual([]);
  });

  it('faixa de IMC escolhida sai como código', () => {
    const r = rascunhoCompleto();
    r.perfil.faixa_imc_cod = 'eutrofico';
    expect(montarPayload(r).perfil.faixa_imc_cod).toBe('eutrofico');
  });
});

describe('fragmentoConsulta', () => {
  it('leva CID, sexo, faixa e comorbidades no fragmento', () => {
    const perfil = montarPayload(rascunhoCompleto()).perfil;
    expect(fragmentoConsulta({ ...perfil, comorbidades: ['F41.1', 'I10'] })).toBe('#dx=F32.1&sexo=feminino&faixa=26_35&com=F41.1,I10');
    expect(fragmentoConsulta({ ...perfil, comorbidades: [] })).toBe('#dx=F32.1&sexo=feminino&faixa=26_35');
    expect(new URLSearchParams(fragmentoConsulta(perfil).slice(1)).get('com')).toBe('E03.9');
  });
});

describe('chaveDoCampoServidor (422 -> campo da tela)', () => {
  const r = rascunhoCompleto();
  const segundo = novoTratamento();
  const reacoes = [novaReacao(), novaReacao()];
  segundo.reacoes = reacoes;
  r.tratamentos.push(segundo);
  const [t1, t2] = r.tratamentos;

  it.each([
    ['perfil.sexo', chavePerfil('sexo')],
    ['perfil.faixa_imc_cod', chavePerfil('faixa_imc_cod')],
    ['perfil.comorbidades.0', chavePerfil('comorbidades')],
    ['perfil.comorbidades', chavePerfil('comorbidades')],
    ['tratamentos.0.medicamento_id', chaveTratamento(t1.id, 'medicamento_id')],
    ['tratamentos.0.unidade_dose', chaveTratamento(t1.id, 'unidade_dose')],
    ['tratamentos.1.data_inicio', chaveTratamento(t2.id, 'data_inicio')],
    ['tratamentos.0.desfecho.data_fim', chaveTratamento(t1.id, 'data_fim')],
    ['tratamentos.1.desfecho.data_ultima_observacao', chaveTratamento(t2.id, 'data_ultima_observacao')],
    ['tratamentos.1.desfecho.status', chaveTratamento(t2.id, 'status')],
    ['tratamentos.1.reacoes', chaveTratamento(t2.id, 'reacoes')],
    ['tratamentos.1.reacoes.1.levou_descontinuacao', chaveReacao(t2.id, reacoes[1].id, 'levou_descontinuacao')],
    ['tratamentos.0.reacoes.0.dias_ate_inicio', chaveReacao(t1.id, t1.reacoes[0].id, 'dias_ate_inicio')],
  ])('%s', (campo, esperado) => {
    expect(chaveDoCampoServidor(campo, r)).toBe(esperado);
  });

  it.each([
    'corpo',
    '',
    'tratamentos',
    'tratamentos.5.via',
    'tratamentos.0.reacoes.9.gravidade_observada',
    'tratamentos.0.desfecho',
    'tratamentos.0.nome',
    'perfil.cpf',
    'perfil',
  ])('sem campo na tela: %s -> null (mensagem geral)', (campo) => {
    expect(chaveDoCampoServidor(campo, r)).toBeNull();
  });

  it('descreve a chave pela posição atual', () => {
    expect(descreverChave(chaveReacao(t2.id, reacoes[1].id, 'gravidade_observada'), r)).toBe('T2 · reação 2 · Gravidade observada');
    expect(descreverChave(chaveTratamento(t1.id, 'data_fim'), r)).toBe('T1 · Data de fim');
    expect(descreverChave(chavePerfil('sexo'), r)).toBe('Perfil · Sexo');
  });
});
