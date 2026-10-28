import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VisaoGeral } from '../../api/types';
import { insuficiente, montarPainel, proporcao } from '../../lib/teste-paineis';
import VisaoGeralPage from './VisaoGeralPage';

// SINTÉTICO: números de layout, sem significado clínico.
const visao: VisaoGeral = {
  horizonte_dias: 84,
  n_minimo: 20,
  contagens: { n_pacientes: 120, n_atendimentos: 300, n_tratamentos: 150, n_reacoes: 40, n_medicamentos: 2 },
  diagnosticos: [{ codigo: 'F31.3', descricao: 'Diagnóstico sintético', n_pacientes: 60 }],
  medicamentos: [
    { medicamento_id: 2, principio_ativo: 'fármaco b', codigo_atc: 'N0XXX02', n_tratamentos: 90 },
    { medicamento_id: 1, principio_ativo: 'fármaco a', codigo_atc: 'N0XXX01', n_tratamentos: 60 },
  ],
  desfecho: {
    n_tratamentos: 150,
    n_avaliavel: 100,
    n_censurado: 50,
    mantido: proporcao(70, 100, 70, [60, 78]),
    descontinuado: proporcao(30, 100, 30, [22, 40]),
  },
  motivos: [{ ...proporcao(15, 30, 50, [33, 67]), motivo: 'desc_reacao_adversa', rotulo: 'Reação adversa' }],
  classe_por_grupo: {
    dividir_por: 'faixa',
    fixados_por_filtro: [],
    classes: ['Classe sintética'],
    linhas: [{ rotulo: '26 a 35 anos', n_atendimentos: 12, celulas: [{ ...insuficiente(12), classe: 'Classe sintética', n_atendimentos_classe: 12 }] }],
  },
  recentes: [
    {
      chave_pseudonima: 'REG-TESTE01',
      sexo: 'feminino',
      faixa_etaria_cod: '26_35',
      cid10: 'F31.3',
      descricao_cid: 'Diagnóstico sintético',
      n_atendimentos: 2,
      ultimo_atendimento: '2026-09-15',
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe('Visão geral', () => {
  it('toda proporção com n e IC; abaixo do n mínimo, "dados insuficientes" sem percentual', async () => {
    const corpos = montarPainel(<VisaoGeralPage />, { '/paineis/visao-geral': visao });
    expect(await screen.findByRole('img', { name: '70 por cento; n igual a 100; intervalo de confiança de 95 por cento de 60 a 78 por cento' })).toBeTruthy();
    expect(corpos).toEqual([{ caminho: '/paineis/visao-geral', corpo: { filtros: {}, dividir_por: 'faixa' } }]);
    expect(screen.getByText('Apoio à decisão. Não é prescrição.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '26 a 35 anos, Classe sintética: 12 de 12 atendimentos' }));
    expect(screen.getByRole('img', { name: 'dados insuficientes; n igual a 12' })).toBeTruthy();
  });

  it('trocar a divisão refaz o pedido', async () => {
    const corpos = montarPainel(<VisaoGeralPage />, { '/paineis/visao-geral': visao });
    await screen.findByText('Qual classe é prescrita em cada grupo de pacientes?');
    fireEvent.click(screen.getByRole('radio', { name: 'Sexo' }));
    await vi.waitFor(() => expect(corpos.at(-1)?.corpo).toEqual({ filtros: {}, dividir_por: 'sexo' }));
  });
});
