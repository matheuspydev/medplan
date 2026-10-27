import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReferenciasProvider } from '../../api/referencias';
import type { FichaPaciente, Referencias } from '../../api/types';
import RegistroPage from './RegistroPage';

// Catálogo e ficha SINTÉTICOS, só com a forma do contrato (sem significado clínico).
const referencias: Referencias = {
  ambiente: { dados_sinteticos: true, hospital: 'Hospital de Demonstração (dados sintéticos)' },
  clinico_atual: { id: 1, nome: 'Clínico sintético 1', papel: 'medico' },
  limites: { horizonte_padrao_dias: 84, horizonte_min_dias: 28, horizonte_max_dias: 180, n_minimo_padrao: 20, n_minimo_min: 5, n_minimo_max: 100 },
  diagnosticos: [{ codigo: 'F32.1', descricao: 'Diagnóstico sintético A', grupo: 'F30-F39', n_perfis: 10 }],
  cid10: [
    { codigo: 'F32.1', descricao: 'Diagnóstico sintético A', grupo: 'F30-F39', tipo: 'psiquiatrica' },
    { codigo: 'E03.9', descricao: 'Comorbidade sintética B', grupo: 'E00-E07', tipo: 'clinica' },
  ],
  faixas_etarias: [{ codigo: '26_35', rotulo: '26 a 35 anos', ordem: 3 }],
  faixas_imc: [{ codigo: 'faixa_a', rotulo: 'Faixa sintética A', ordem: 1 }],
  medicamentos: [
    { id: 1, principio_ativo: 'fármaco a', codigo_atc: 'N0XXX01', classe_terapeutica: 'Classe sintética' },
    { id: 2, principio_ativo: 'fármaco b', codigo_atc: 'N0XXX02', classe_terapeutica: 'Classe sintética' },
  ],
  reacoes_adversas: [{ id: 4, termo: 'Termo sintético', soc: 'SOC sintético', gravidade_padrao: 'grave' }],
  opcoes: {
    sexo: [
      { codigo: 'feminino', rotulo: 'Feminino' },
      { codigo: 'masculino', rotulo: 'Masculino' },
    ],
    tabagismo: [
      { codigo: 'nunca', rotulo: 'Nunca fumou' },
      { codigo: 'atual', rotulo: 'Fumante atual' },
    ],
    gestacao_lactacao: [],
    funcao_renal: [],
    funcao_hepatica: [],
    uso_substancias: [],
    via: [],
    gravidade: [
      { codigo: 'leve', rotulo: 'Leve' },
      { codigo: 'grave', rotulo: 'Grave' },
    ],
    status_tratamento: [
      { codigo: 'em_uso', rotulo: 'Em uso', grupo: 'censura' },
      { codigo: 'desc_reacao_adversa', rotulo: 'Descontinuado por reação adversa', grupo: 'descontinuacao' },
    ],
    unidades_dose: ['mg'],
  },
};

const ficha: FichaPaciente = {
  chave_pseudonima: 'REG-TESTE01',
  sexo: 'feminino',
  primeiro_atendimento: '2026-01-10',
  ultimo_atendimento: '2026-09-15',
  atendimentos: [
    {
      sk_atendimento: 2,
      data: '2026-09-15',
      faixa_etaria_cod: '26_35',
      faixa_imc_cod: 'faixa_a',
      tabagista: true,
      qtd_comorbidades: 1,
      cid10: 'F32.1',
      medicamento_id: 2,
      principio_ativo: 'fármaco b',
      linha_tratamento: 2,
      status: 'em_uso',
      dias_observados: 14,
      reacoes: [],
    },
  ],
  tratamentos: [
    {
      medicamento_id: 1,
      principio_ativo: 'fármaco a',
      linha_tratamento: 1,
      data_inicio: '2026-01-10',
      data_ultima_observacao: '2026-08-30',
      status: 'desc_reacao_adversa',
      encerrado: true,
      n_atendimentos: 1,
    },
    {
      medicamento_id: 2,
      principio_ativo: 'fármaco b',
      linha_tratamento: 2,
      data_inicio: '2026-09-01',
      data_ultima_observacao: '2026-09-15',
      status: 'em_uso',
      encerrado: false,
      n_atendimentos: 1,
    },
  ],
};

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

let respostasPost: Response[] = [];
const corpos: { url: string; corpo: unknown }[] = [];

beforeEach(() => {
  respostasPost = [];
  corpos.length = 0;
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/referencias')) return json(referencias);
      corpos.push({ url, corpo: JSON.parse(String(init?.body)) });
      if (url.endsWith('/paineis/paciente')) return json(ficha);
      if (url.endsWith('/atendimentos')) return respostasPost.shift()!;
      return json({ detail: 'não previsto' }, 404);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

const campo = (id: string) => document.getElementById(id) as HTMLInputElement;
const grupo = (id: string) => within(campo(id));

function escolherNoCombobox(id: string, texto: string) {
  fireEvent.focus(campo(id));
  fireEvent.change(campo(id), { target: { value: texto } });
  fireEvent.keyDown(campo(id), { key: 'Enter' });
}

async function montar(hash = '') {
  window.history.replaceState(null, '', `/registro${hash}`);
  render(
    <ReferenciasProvider>
      <RegistroPage />
    </ReferenciasProvider>,
  );
  await screen.findByRole('heading', { name: 'Registrar atendimento' });
}

function preencherAtendimento() {
  fireEvent.change(campo('reg-data_atendimento'), { target: { value: '2026-10-20' } });
  fireEvent.change(campo('reg-faixa_etaria_cod'), { target: { value: '26_35' } });
  fireEvent.change(campo('reg-faixa_imc_cod'), { target: { value: '__nao_informado' } });
  fireEvent.click(grupo('reg-tabagismo').getByRole('radio', { name: 'Nunca fumou' }));
  escolherNoCombobox('reg-cid10_principal', 'f321');
  escolherNoCombobox('reg-medicamento_id', 'farmaco a');
  fireEvent.change(campo('reg-data_inicio_medicamento'), { target: { value: '2026-10-01' } });
  fireEvent.click(grupo('reg-linha_tratamento').getByRole('radio', { name: '1ª' }));
  fireEvent.change(campo('reg-status'), { target: { value: 'em_uso' } });
}

describe('Registrar atendimento', () => {
  it('primeiro atendimento: chave da origem + sexo; sem campo identificável; Ctrl+S vazio lista pendências e não envia', async () => {
    await montar();
    expect(screen.getByRole('radio', { name: 'Primeiro atendimento' })).toHaveProperty('checked', true);
    expect(screen.getByText(/registre apenas pacientes fictícios/)).toBeTruthy();
    expect(screen.queryByLabelText(/nome|CPF|prontuário|nascimento/i)).toBeNull();

    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(screen.getByRole('alert').textContent).toContain('Faltam 11 campos para salvar');
    const resumo = within(screen.getByRole('complementary', { name: 'Resumo' }));
    expect(resumo.getByText('Falta preencher (11)')).toBeTruthy();
    expect(document.activeElement).toBe(campo('reg-chave'));
    expect(corpos).toEqual([]);
  });

  it('paciente da ficha: busca pela chave no corpo (nunca na URL), copia o anterior e mantém o medicamento', async () => {
    await montar('#chave=REG-TESTE01');
    await screen.findByText('Último atendimento');
    expect(corpos).toEqual([{ url: '/api/v1/paineis/paciente', corpo: { chave_pseudonima: 'REG-TESTE01' } }]);
    expect(screen.getByText('2º deste paciente')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Copiar do atendimento anterior' }));
    expect(campo('reg-faixa_etaria_cod').value).toBe('26_35');
    expect(campo('reg-faixa_imc_cod').value).toBe('faixa_a');
    expect(grupo('reg-tabagismo').getByRole('radio', { name: 'Fumante atual' })).toHaveProperty('checked', true);
    expect(screen.getByRole('status').textContent).toContain('(1 no anterior): escolha os códigos de novo');

    fireEvent.click(screen.getByRole('button', { name: 'Manter Fármaco b' }));
    expect(campo('reg-medicamento_id').value).toContain('Fármaco b');
    expect(campo('reg-data_inicio_medicamento').value).toBe('2026-09-01');

    // causador: o prescrito agora ou um anterior; o mantido não aparece duas vezes
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar reação' }));
    const causador = document.querySelector<HTMLSelectElement>('[id$="-causador"]')!;
    expect([...causador.options].map((o) => o.text)).toEqual([
      'Selecione…',
      'Prescrito neste atendimento (Fármaco b)',
      'Fármaco a (anterior, de 10/01/2026 a 30/08/2026)',
    ]);
  });

  it('422 do servidor vai para o campo; 201 abre a ficha do paciente', async () => {
    await montar();
    fireEvent.change(campo('reg-chave'), { target: { value: 'reg-novo01' } });
    fireEvent.click(grupo('reg-sexo').getByRole('radio', { name: 'Feminino' }));
    preencherAtendimento();

    respostasPost.push(json({ detail: [{ campo: 'data_inicio_medicamento', mensagem: 'Mensagem sintética do servidor.' }] }, 422));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Salvar atendimento/ })));
    expect(corpos[0].corpo).toMatchObject({
      paciente: { chave_pseudonima: 'REG-NOVO01', sexo: 'feminino' },
      faixa_imc_cod: null,
      tabagismo: 'nunca',
      medicamento_id: 1,
      linha_tratamento: 1,
      status: 'em_uso',
      reacoes: [],
    });
    expect(screen.getByText('Mensagem sintética do servidor.')).toBeTruthy();
    expect(campo('reg-data_inicio_medicamento').getAttribute('aria-invalid')).toBe('true');

    respostasPost.push(json({ chave_pseudonima: 'REG-NOVO01', sk_atendimento: 9, prescricao_id: 3, n_atendimentos_paciente: 1, primeiro_atendimento: true }, 201));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Salvar atendimento/ })));
    expect(window.location.pathname).toBe('/paciente');
    expect(window.location.hash).toBe('#chave=REG-NOVO01');
  });
});
