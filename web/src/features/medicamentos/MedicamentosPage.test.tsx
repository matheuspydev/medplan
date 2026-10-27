import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FichaMedicamento, VisaoGeral } from '../../api/types';
import { insuficiente, montarPainel, proporcao, REFERENCIAS_PAINEIS } from '../../lib/teste-paineis';
import CompararPage from './CompararPage';
import MedicamentosPage from './MedicamentosPage';

// SINTÉTICO: números de layout, sem significado clínico.
const [farmacoB, farmacoA] = REFERENCIAS_PAINEIS.medicamentos;

const volume = {
  horizonte_dias: 84,
  n_minimo: 20,
  medicamentos: [
    { medicamento_id: 2, principio_ativo: 'fármaco b', codigo_atc: 'N0XXX02', n_tratamentos: 90 },
    { medicamento_id: 1, principio_ativo: 'fármaco a', codigo_atc: 'N0XXX01', n_tratamentos: 12 },
  ],
} as VisaoGeral;

function ficha(medicamento: typeof farmacoA, suficiente: boolean): FichaMedicamento {
  const p = (n: number, base: number, pct: number, ic: [number, number]) => (suficiente ? proporcao(n, base, pct, ic) : insuficiente(base));
  return {
    medicamento,
    horizonte_dias: 84,
    n_minimo: 20,
    contabilidade: suficiente
      ? { n_tratamentos: 90, n_avaliavel: 60, n_retidos: 42, n_descontinuados: 18, n_censurado: 30 }
      : { n_tratamentos: 12, n_avaliavel: 8, n_retidos: 5, n_descontinuados: 3, n_censurado: 4 },
    permanencia: p(42, 60, 70, [57, 80]),
    descontinuacao_por_motivo: [
      { ...p(6, 60, 10, [5, 20]), motivo: 'desc_reacao_adversa', rotulo: 'Reação adversa' },
      { ...p(6, 60, 10, [5, 20]), motivo: 'desc_ineficacia', rotulo: 'Ineficácia' },
      { ...p(3, 60, 5, [2, 14]), motivo: 'desc_nao_adesao', rotulo: 'Não adesão' },
      { ...p(3, 60, 5, [2, 14]), motivo: 'desc_outro', rotulo: 'Outro' },
    ],
    curva: null,
    recebem: { sexos: [{ codigo: 'feminino', rotulo: 'Feminino' }], linhas: [{ faixa_etaria_cod: '26_35', rotulo: '26 a 35 anos', n_por_sexo: [9] }] },
    reacoes: [],
    por_linha: [{ linha: '1', rotulo: '1ª linha', n_tratamentos: 9, permanencia: insuficiente(9) }],
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('Medicamentos', () => {
  it('grade em ordem alfabética, sem destaque; a ficha vem do recorte e mostra n e IC', async () => {
    const corpos = montarPainel(<MedicamentosPage />, { '/paineis/visao-geral': volume, '/paineis/medicamento': ficha(farmacoB, true) });
    const grade = within(await screen.findByRole('group', { name: 'Escolher medicamento' }));
    expect(grade.getAllByRole('button').map((b) => b.querySelector('.cartao-medicamento__nome')?.textContent)).toEqual(['Fármaco a', 'Fármaco b']);
    await screen.findByText('90 tratamentos');

    fireEvent.click(grade.getByRole('button', { name: /Fármaco b/ }));
    expect(await screen.findAllByRole('img', { name: '70 por cento; n igual a 60; intervalo de confiança de 95 por cento de 57 a 80 por cento' })).toHaveLength(1);
    expect(corpos.at(-1)).toEqual({ caminho: '/paineis/medicamento', corpo: { medicamento_id: 2, filtros: {} } });
    expect(screen.getByText('Curva não exibida: menos de 20 tratamentos no recorte.')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'dados insuficientes; n igual a 9' })).toBeTruthy();
  });
});

describe('Comparar', () => {
  it('começa pelos dois mais usados do recorte e pede a ficha de cada um', async () => {
    const corpos = montarPainel(<CompararPage />, {
      '/paineis/visao-geral': volume,
      '/paineis/medicamento': (corpo: Record<string, unknown>) => ficha(corpo.medicamento_id === 2 ? farmacoB : farmacoA, corpo.medicamento_id === 2),
    });
    await screen.findByRole('table', { name: 'Métricas lado a lado' });
    const fichas = corpos.filter((c) => c.caminho === '/paineis/medicamento').map((c) => c.corpo);
    expect(fichas).toEqual([
      { medicamento_id: 2, filtros: {} },
      { medicamento_id: 1, filtros: {} },
    ]);
    // Fármaco a tem poucos tratamentos: "dados insuficientes" na coluna dele, n e IC na do outro
    expect(screen.getAllByRole('img', { name: 'dados insuficientes; n igual a 60' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: /^70 por cento; n igual a 60/ }).length).toBeGreaterThan(0);
  });
});
