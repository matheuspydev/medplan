import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FichaPaciente, ListaPacientes } from '../../api/types';
import { montarPainel } from '../../lib/teste-paineis';
import PacientePage from './PacientePage';
import PacientesPage from './PacientesPage';

// SINTÉTICO: chaves e códigos sem significado clínico.
const lista: ListaPacientes = {
  total: 1,
  pagina: 1,
  por_pagina: 20,
  itens: [
    {
      chave_pseudonima: 'REG-TESTE01',
      sexo: 'feminino',
      faixa_etaria_cod: '26_35',
      cid10: 'F31.3',
      descricao_cid: 'Diagnóstico sintético',
      medicamento_atual: 'fármaco b',
      n_atendimentos: 1,
      ultimo_atendimento: '2026-09-15',
    },
  ],
};

const ficha: FichaPaciente = {
  chave_pseudonima: 'REG-TESTE01',
  sexo: 'feminino',
  primeiro_atendimento: '2026-09-15',
  ultimo_atendimento: '2026-09-15',
  atendimentos: [
    {
      sk_atendimento: 1,
      data: '2026-09-15',
      faixa_etaria_cod: '26_35',
      faixa_imc_cod: null,
      tabagista: false,
      qtd_comorbidades: 0,
      cid10: 'F31.3',
      medicamento_id: 2,
      principio_ativo: 'fármaco b',
      linha_tratamento: 1,
      status: 'em_uso',
      dias_observados: 14,
      reacoes: [],
    },
  ],
  tratamentos: [
    {
      medicamento_id: 2,
      principio_ativo: 'fármaco b',
      linha_tratamento: 1,
      data_inicio: '2026-09-01',
      data_ultima_observacao: '2026-09-15',
      status: 'em_uso',
      encerrado: false,
      n_atendimentos: 1,
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('Pacientes', () => {
  it('a busca vai no corpo do POST (nunca na URL) e a chave abre a ficha pelo fragmento', async () => {
    const corpos = montarPainel(<PacientesPage />, { '/paineis/pacientes': lista });
    const link = await screen.findByRole('link', { name: 'REG-TESTE01' });
    expect(link.getAttribute('href')).toBe('/paciente#chave=REG-TESTE01');

    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar pacientes por chave ou CID-10' }), { target: { value: 'F31' } });
    await vi.waitFor(() => expect(corpos.at(-1)).toEqual({ caminho: '/paineis/pacientes', corpo: { q: 'F31', pagina: 1, por_pagina: 20 } }));
    expect(corpos.every((c) => !c.caminho.includes('?'))).toBe(true);
  });

  it('ficha do paciente: chave lida do fragmento e enviada no corpo; "Registrar atendimento" leva a chave adiante', async () => {
    window.history.replaceState(null, '', '/paciente#chave=REG-TESTE01');
    const corpos = montarPainel(<PacientePage />, { '/paineis/paciente': ficha });
    expect(await screen.findByRole('heading', { name: 'REG-TESTE01' })).toBeTruthy();
    expect(corpos).toEqual([{ caminho: '/paineis/paciente', corpo: { chave_pseudonima: 'REG-TESTE01' } }]);
    expect(screen.getByRole('link', { name: /Registrar atendimento/ }).getAttribute('href')).toBe('/registro#chave=REG-TESTE01');
  });
});
