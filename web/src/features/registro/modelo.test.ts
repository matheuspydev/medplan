import { describe, expect, it } from 'vitest';
import { CAUSADOR_ATUAL, chaveDoCampoServidor, montarEntrada, novaReacao, novoRascunho, validar, type Rascunho } from './modelo';

const HOJE = '2026-10-27';

/** Rascunho completo SINTÉTICO (chave e códigos sem significado clínico). */
function completo(patch: Partial<Rascunho> = {}): Rascunho {
  return {
    ...novoRascunho('REG-TESTE01'),
    data_atendimento: '2026-10-20',
    faixa_etaria_cod: '26_35',
    faixa_imc_cod: null,
    tabagismo: 'nunca',
    cid10_principal: 'F31.3',
    comorbidades: ['I10'],
    medicamento_id: 2,
    data_inicio_medicamento: '2026-09-01',
    linha_tratamento: 2,
    status: 'em_uso',
    ...patch,
  };
}

const chaves = (r: Rascunho, encontrado: boolean | null = true) => validar(r, HOJE, encontrado).map((p) => p.chave);

describe('validar', () => {
  it('rascunho vazio: todos os obrigatórios, na ordem do formulário; IMC "não informado" (null) vale como escolha', () => {
    expect(chaves(novoRascunho(null))).toEqual([
      'chave',
      'sexo',
      'data_atendimento',
      'faixa_etaria_cod',
      'faixa_imc_cod',
      'tabagismo',
      'cid10_principal',
      'medicamento_id',
      'data_inicio_medicamento',
      'linha_tratamento',
      'status',
    ]);
    expect(chaves(completo())).toEqual([]);
  });

  it('chave: formato da exportação; no modo "já registrado" precisa existir na base', () => {
    expect(chaves(completo({ chave: 'reg 1' }))).toEqual(['chave']);
    expect(chaves(completo(), false)).toEqual(['chave']);
    expect(chaves(completo(), null)).toEqual([]);
  });

  it('datas: atendimento não pode estar no futuro; início do medicamento não pode ser depois do atendimento', () => {
    expect(chaves(completo({ data_atendimento: '2026-10-28' }))).toEqual(['data_atendimento']);
    expect(chaves(completo({ data_inicio_medicamento: '2026-10-21' }))).toEqual(['data_inicio_medicamento']);
  });

  it('reação: data entre o início do causador e o atendimento, ou "não soube informar"', () => {
    const r = { ...novaReacao(), reacao_adversa_id: 5, causador: CAUSADOR_ATUAL, gravidade_observada: 'leve' as const, levou_descontinuacao: false };
    expect(chaves(completo({ reacoes: [r] }))).toEqual([`r${r.id}.data_inicio_reacao`]);
    expect(chaves(completo({ reacoes: [{ ...r, data_inicio_reacao: '2026-08-31' }] }))).toEqual([`r${r.id}.data_inicio_reacao`]);
    expect(chaves(completo({ reacoes: [{ ...r, data_inicio_reacao: '2026-09-10' }] }))).toEqual([]);
    expect(chaves(completo({ reacoes: [{ ...r, sem_data: true }] }))).toEqual([]);
  });

  it('a mesma reação duas vezes para o mesmo medicamento é recusada', () => {
    const base = { reacao_adversa_id: 5, causador: CAUSADOR_ATUAL, sem_data: true, gravidade_observada: 'leve' as const, levou_descontinuacao: false };
    const a = { ...novaReacao(), ...base };
    const b = { ...novaReacao(), ...base };
    expect(chaves(completo({ reacoes: [a, b] }))).toEqual([`r${b.id}.reacao_adversa_id`]);
  });
});

describe('montarEntrada', () => {
  it('paciente já registrado não envia sexo; primeiro atendimento envia', () => {
    expect(montarEntrada(completo()).paciente).toEqual({ chave_pseudonima: 'REG-TESTE01' });
    expect(montarEntrada(completo({ modo: 'novo', sexo: 'feminino' })).paciente).toEqual({ chave_pseudonima: 'REG-TESTE01', sexo: 'feminino' });
  });

  it('reação de medicamento anterior leva o medicamento e a data de início dele', () => {
    const r = {
      ...novaReacao(),
      reacao_adversa_id: 5,
      causador: '7|2026-03-01',
      data_inicio_reacao: '2026-03-20',
      gravidade_observada: 'moderada' as const,
      levou_descontinuacao: true,
    };
    expect(montarEntrada(completo({ reacoes: [r] })).reacoes).toEqual([
      {
        reacao_adversa_id: 5,
        medicamento_id: 7,
        data_inicio_medicamento: '2026-03-01',
        data_inicio_reacao: '2026-03-20',
        gravidade_observada: 'moderada',
        levou_descontinuacao: true,
      },
    ]);
  });
});

describe('chaveDoCampoServidor', () => {
  it('caminhos do 422 apontam para o campo da tela', () => {
    const r = novaReacao();
    const enviado = completo({ reacoes: [r] });
    expect(chaveDoCampoServidor('paciente.chave_pseudonima', enviado)).toBe('chave');
    expect(chaveDoCampoServidor('faixa_imc_cod', enviado)).toBe('faixa_imc_cod');
    expect(chaveDoCampoServidor('comorbidades.0', enviado)).toBe('comorbidades');
    expect(chaveDoCampoServidor('reacoes.0.medicamento_id', enviado)).toBe(`r${r.id}.causador`);
    expect(chaveDoCampoServidor('reacoes.0.data_inicio_reacao', enviado)).toBe(`r${r.id}.data_inicio_reacao`);
    expect(chaveDoCampoServidor('reacoes.3.gravidade_observada', enviado)).toBeNull();
    expect(chaveDoCampoServidor('nome', enviado)).toBeNull();
  });
});
