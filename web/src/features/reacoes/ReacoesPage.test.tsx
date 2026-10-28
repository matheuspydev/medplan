import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PesoPorImc, ResumoReacoes } from '../../api/types';
import { insuficiente, montarPainel, proporcao, REFERENCIAS_PAINEIS } from '../../lib/teste-paineis';
import ReacoesPage from './ReacoesPage';

// SINTÉTICO: números de layout, sem significado clínico.
const resumo: ResumoReacoes = {
  n_minimo: 20,
  contagens: {
    n_reacoes: 40,
    n_tratamentos: 150,
    tratamentos_com_reacao: proporcao(36, 150, 24, [18, 31]),
    levaram_descontinuacao: proporcao(10, 40, 25, [14, 40]),
    dias_ate_inicio: { n: 30, mediana: 14, q1: 7, q3: 28 },
  },
  por_soc: [{ soc: 'SOC sintético', n: 40, termos: [{ termo: 'Termo sintético', n: 40 }] }],
  gravidade: [
    { ...proporcao(32, 40, 80, [65, 90]), gravidade: 'leve', rotulo: 'Leve' },
    { ...proporcao(8, 40, 20, [10, 35]), gravidade: 'grave', rotulo: 'Grave' },
  ],
  descontinuacao_por_gravidade: [
    { ...proporcao(4, 32, 13, [5, 28]), gravidade: 'leve', rotulo: 'Leve' },
    { ...insuficiente(8), gravidade: 'grave', rotulo: 'Grave' },
  ],
  dias_por_faixa: [{ rotulo: '0 a 7 dias', n: 12 }],
  reacao_x_medicamento: {
    medicamentos: [{ medicamento_id: 2, principio_ativo: 'fármaco b', n_tratamentos: 90 }],
    linhas: [
      {
        reacao_adversa_id: 4,
        termo: 'Termo sintético',
        celulas: [{ ...proporcao(27, 90, 30, [21, 40]), medicamento_id: 2, n_tratamentos_com_reacao: 27 }],
      },
    ],
  },
};

const peso: PesoPorImc = {
  medicamento: REFERENCIAS_PAINEIS.medicamentos[1],
  n_minimo: 20,
  linhas: [{ faixa_imc_cod: 'sobrepeso', rotulo: 'Sobrepeso', n_tratamentos: 9, ganho_de_peso: insuficiente(9), perda_de_peso: insuficiente(9) }],
};

afterEach(() => vi.unstubAllGlobals());

describe('Reações adversas', () => {
  it('proporções com n e IC; recorte pequeno vira "dados insuficientes"; célula do mapa mostra a taxa', async () => {
    const corpos = montarPainel(<ReacoesPage />, { '/paineis/reacoes': resumo, '/paineis/peso-por-imc': peso });
    expect(await screen.findByRole('img', { name: '24 por cento; n igual a 150; intervalo de confiança de 95 por cento de 18 a 31 por cento' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'dados insuficientes; n igual a 8' })).toBeTruthy();
    await screen.findByText('Sobrepeso');
    expect(corpos).toEqual([
      { caminho: '/paineis/reacoes', corpo: { filtros: {} } },
      { caminho: '/paineis/peso-por-imc', corpo: { medicamento_id: 1, filtros: {} } },
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Termo sintético com Fármaco b: 27 tratamentos' }));
    expect(screen.getByRole('img', { name: '30 por cento; n igual a 90; intervalo de confiança de 95 por cento de 21 a 40 por cento' })).toBeTruthy();
  });

  it('filtros da tela (medicamento e linha) vão no corpo do pedido', async () => {
    const corpos = montarPainel(<ReacoesPage />, { '/paineis/reacoes': resumo, '/paineis/peso-por-imc': peso });
    await screen.findByText('Termos mais frequentes');
    fireEvent.change(screen.getByRole('combobox', { name: 'Medicamento' }), { target: { value: '2' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Linha de tratamento' }), { target: { value: '3+' } });
    await vi.waitFor(() => expect(corpos.at(-1)).toEqual({ caminho: '/paineis/reacoes', corpo: { filtros: {}, medicamento_id: 2, linha: '3+' } }));
  });
});
