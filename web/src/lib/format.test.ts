import { describe, expect, it } from 'vitest';
import { ladoQuadrado } from '../components/FaixaIC';
import { filtrarOpcoes } from '../components/comboboxComum';
import { normalizarDetalhe } from '../api/client';
import {
  formatarData,
  formatarDias,
  formatarHorizonte,
  formatarInteiro,
  formatarMedianaDias,
  hojeIso,
  NBSP,
  plural,
} from './format';
import { normalizar, normalizarCodigo, trechoCasado } from './normalizar';

describe('format.ts', () => {
  it('inteiros pt-BR com ponto de milhar', () => {
    expect(formatarInteiro(7)).toBe('7');
    expect(formatarInteiro(1234)).toBe('1.234');
    expect(formatarInteiro(6000)).toBe('6.000');
    expect(formatarInteiro(1234567)).toBe('1.234.567');
  });

  it('datas dd/mm/aaaa sem fuso', () => {
    expect(formatarData('2026-09-14')).toBe('14/09/2026');
    expect(formatarData('2025-02-03T00:00:00-03:00')).toBe('03/02/2025');
    expect(hojeIso(new Date(2026, 8, 4))).toBe('2026-09-04');
  });

  it('horizonte com semanas só quando divisível por 7, NBSP entre número e unidade', () => {
    expect(formatarHorizonte(84)).toBe(`84${NBSP}dias = 12${NBSP}semanas`);
    expect(formatarHorizonte(28)).toBe(`28${NBSP}dias = 4${NBSP}semanas`);
    expect(formatarHorizonte(90)).toBe(`90${NBSP}dias`);
    expect(formatarHorizonte(180)).toBe(`180${NBSP}dias`);
    expect(NBSP).toBe(' ');
  });

  it('mediana de dias com vírgula só quando não é inteira', () => {
    expect(formatarMedianaDias(12)).toBe(`12${NBSP}d`);
    expect(formatarMedianaDias(14.5)).toBe(`14,5${NBSP}d`);
    expect(formatarDias(84)).toBe(`84${NBSP}d`);
  });

  it('pluraliza contagens', () => {
    expect(plural(1, 'tratamento', 'tratamentos')).toBe('1 tratamento');
    expect(plural(22, 'tratamento', 'tratamentos')).toBe('22 tratamentos');
  });
});

describe('normalizar.ts e busca de catálogo', () => {
  const opcoes = [
    { valor: 'F32.1', codigo: 'F32.1', rotulo: 'Episódio depressivo moderado', grupo: 'F30-F39' },
    { valor: 'F31.3', codigo: 'F31.3', rotulo: 'Transtorno afetivo bipolar, episódio atual depressivo', grupo: 'F30-F39' },
    { valor: 'F41.1', codigo: 'F41.1', rotulo: 'Ansiedade generalizada', grupo: 'F40-F48' },
  ];

  it('sem acento, sem caixa, ponto opcional', () => {
    expect(normalizar('Depressão')).toBe('depressao');
    expect(normalizarCodigo('F31.3')).toBe('f313');
    expect(filtrarOpcoes(opcoes, 'f313').map((o) => o.valor)).toEqual(['F31.3']);
    expect(filtrarOpcoes(opcoes, 'BIPOLAR').map((o) => o.valor)).toEqual(['F31.3']);
    expect(filtrarOpcoes(opcoes, 'depressivo').map((o) => o.valor)).toEqual(['F32.1', 'F31.3']);
    expect(filtrarOpcoes(opcoes, '').length).toBe(3);
  });

  it('prefixo de código vem antes de trecho na descrição', () => {
    const lista = [
      { valor: 'x', rotulo: 'contém f4 no texto' },
      { valor: 'F41.1', codigo: 'F41.1', rotulo: 'Ansiedade generalizada' },
    ];
    expect(filtrarOpcoes(lista, 'f4').map((o) => o.valor)).toEqual(['F41.1', 'x']);
  });

  it('localiza o trecho casado no texto original', () => {
    expect(trechoCasado('Episódio depressivo', 'episodio')).toEqual([0, 8]);
    expect(trechoCasado('F31.3', 'f313', true)).toEqual([0, 5]);
    expect(trechoCasado('F31.3', 'xyz', true)).toBeNull();
  });
});

describe('FaixaIC: lado do quadrado', () => {
  it('vai de 6 a 12px, proporcional a raiz de n / n máximo', () => {
    expect(ladoQuadrado(37, 37)).toBe(12);
    expect(ladoQuadrado(0, 37)).toBe(6);
    expect(ladoQuadrado(9, 36)).toBe(9);
  });
});

describe('client: normalização de erro 422', () => {
  it('aceita o formato do contrato', () => {
    expect(normalizarDetalhe([{ campo: 'tratamentos.0.desfecho.data_fim', mensagem: 'Informe a data de fim.' }], 422)).toEqual([
      { campo: 'tratamentos.0.desfecho.data_fim', mensagem: 'Informe a data de fim.' },
    ]);
  });

  it('aceita o formato padrão do FastAPI e descarta o valor enviado', () => {
    const erros = normalizarDetalhe([{ loc: ['body', 'perfil', 'sexo'], msg: 'Field required', input: { segredo: 'x' } }], 422);
    expect(erros).toEqual([{ campo: 'perfil.sexo', mensagem: 'Field required' }]);
    expect(JSON.stringify(erros)).not.toContain('segredo');
  });

  it('sem detalhe utilizável, devolve mensagem genérica', () => {
    expect(normalizarDetalhe(undefined, 500)[0].mensagem).toContain('HTTP 500');
  });
});
