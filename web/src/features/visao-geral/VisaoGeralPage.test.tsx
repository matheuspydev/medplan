import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VisaoGeral } from '../../api/types';
import { montarPainel, proporcao } from '../../lib/teste-paineis';
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
  tempo_entre_atendimentos: { n_intervalos: 180, n_pacientes: 90, media_dias: 30.5, ic_inferior_dias: 28.2, ic_superior_dias: 32.8 },
  pacientes_por_faixa: [
    { codigo: '18_25', rotulo: '18 a 25 anos', n_pacientes: 50 },
    { codigo: '26_35', rotulo: '26 a 35 anos', n_pacientes: 70 },
  ],
  pacientes_por_imc: [
    { codigo: 'eutrofico', rotulo: 'Eutrófico (18,5 a 24,9)', n_pacientes: 80 },
    { codigo: null, rotulo: 'IMC não informado', n_pacientes: 40 },
  ],
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
    expect(corpos).toEqual([{ caminho: '/paineis/visao-geral', corpo: { filtros: {} } }]);
    expect(screen.getByText('Apoio à decisão. Não é prescrição.')).toBeTruthy();
    expect(screen.queryByText('Qual classe é prescrita em cada grupo de pacientes?')).toBeNull();
  });

  it('gráficos de pacientes por faixa etária e por IMC, na ordem recebida', async () => {
    montarPainel(<VisaoGeralPage />, { '/paineis/visao-geral': visao });
    const faixas = await screen.findByRole('list', { name: 'Pacientes por faixa etária' });
    expect(within(faixas).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['18 a 25 anos50', '26 a 35 anos70']);
    const imc = screen.getByRole('list', { name: 'Pacientes por faixa de IMC' });
    expect(within(imc).getByText('IMC não informado')).toBeTruthy();
  });

  it('tempo médio entre atendimentos com n e IC; abaixo do n mínimo, sem média', async () => {
    montarPainel(<VisaoGeralPage />, { '/paineis/visao-geral': visao });
    expect(await screen.findByText('30,5 d')).toBeTruthy();
    expect(screen.getByText(/n=180 intervalos, IC95% 28,2 d a 32,8 d/)).toBeTruthy();
    expect(screen.queryByText('Tratamentos')).toBeNull();
  });

  it('tempo médio abaixo do n mínimo mostra "dados insuficientes"', async () => {
    const pouco = { ...visao, tempo_entre_atendimentos: { n_intervalos: 7, n_pacientes: 5, media_dias: null } };
    montarPainel(<VisaoGeralPage />, { '/paineis/visao-geral': pouco });
    expect(await screen.findByText('dados insuficientes')).toBeTruthy();
    expect(screen.getByText('n=7 intervalos (mínimo 20)')).toBeTruthy();
  });
});
