import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Referencias } from '../api/types';
import { ReferenciasProvider } from '../api/referencias';
import { Combobox } from '../components/Combobox';
import { SegmentedControl } from '../components/SegmentedControl';
import { App } from './App';
import { TemaProvider } from './tema';

// Catálogo mínimo SINTÉTICO, só com a forma do contrato.
const referencias = (sinteticos: boolean): Referencias => ({
  ambiente: { dados_sinteticos: sinteticos, hospital: 'Hospital de Demonstração (dados sintéticos)' },
  clinico_atual: { id: 1, nome: 'Clínico sintético 1', papel: 'medico' },
  limites: { horizonte_padrao_dias: 84, horizonte_min_dias: 28, horizonte_max_dias: 180, n_minimo_padrao: 20, n_minimo_min: 5, n_minimo_max: 100 },
  diagnosticos: [],
  cid10: [],
  faixas_etarias: [],
  faixas_imc: [],
  medicamentos: [],
  reacoes_adversas: [],
  opcoes: {
    sexo: [],
    tabagismo: [],
    gestacao_lactacao: [],
    funcao_renal: [],
    funcao_hepatica: [],
    uso_substancias: [],
    via: [],
    gravidade: [],
    status_tratamento: [],
    unidades_dose: ['mg'],
  },
});

function montar(sinteticos = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(referencias(sinteticos)), { status: 200, headers: { 'Content-Type': 'application/json' } })),
  );
  return render(
    <TemaProvider>
      <ReferenciasProvider>
        <App />
      </ReferenciasProvider>
    </TemaProvider>,
  );
}

describe('shell', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/consulta');
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('data-sem-faixa-sintetica');
  });

  it('mostra a faixa sintética, o hospital e o título com [SINTÉTICO]', async () => {
    montar();
    expect(await screen.findByText('Hospital de Demonstração (dados sintéticos)')).toBeTruthy();
    expect(screen.getByRole('note', { name: 'Dados sintéticos' })).toBeTruthy();
    expect(document.title).toBe('[SINTÉTICO] MedPlan · Consulta');
  });

  it('a faixa só some quando o servidor declara dados reais', async () => {
    montar(false);
    await screen.findByText('Hospital de Demonstração (dados sintéticos)');
    expect(screen.queryByRole('note', { name: 'Dados sintéticos' })).toBeNull();
    expect(document.title).toBe('MedPlan · Consulta');
  });

  it('navega entre abas sem recarregar', async () => {
    montar();
    await screen.findByText('Hospital de Demonstração (dados sintéticos)');
    fireEvent.click(screen.getByRole('link', { name: 'Registro de caso' }));
    expect(window.location.pathname).toBe('/registro');
    expect(document.title).toBe('[SINTÉTICO] MedPlan · Registro de caso');
    expect(screen.getByRole('link', { name: 'Registro de caso' }).getAttribute('aria-current')).toBe('page');
  });

  it('Alt+M abre a Metodologia em drawer modal; Esc fecha e devolve o foco', async () => {
    montar();
    await screen.findByText('Hospital de Demonstração (dados sintéticos)');
    const gatilho = screen.getByRole('button', { name: /Tema/ });
    gatilho.focus();
    fireEvent.keyDown(window, { key: 'm', code: 'KeyM', altKey: true });
    const dialogo = await screen.findByRole('dialog', { name: 'Metodologia' });
    expect(dialogo.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText(/Conjunto exato, não/)).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(gatilho);
  });
});

describe('controles', () => {
  it('SegmentedControl começa sem seleção', () => {
    render(
      <SegmentedControl
        nome="sexo"
        aria-labelledby="x"
        opcoes={[
          { valor: 'feminino', rotulo: 'Feminino' },
          { valor: 'masculino', rotulo: 'Masculino' },
        ]}
        valor={null}
        onChange={() => {}}
      />,
    );
    expect(screen.getAllByRole('radio').every((r) => !(r as HTMLInputElement).checked)).toBe(true);
  });

  it('Combobox: código sem ponto + Enter seleciona; Esc restaura', () => {
    const escolhas: (string | null)[] = [];
    function Teste() {
      const [valor, setValor] = useState<string | null>(null);
      return (
        <Combobox
          id="dx"
          aria-labelledby="dx-rotulo"
          rotuloLista="Diagnósticos"
          semResultado="Nenhum código encontrado."
          opcoes={[
            { valor: 'F31.3', codigo: 'F31.3', rotulo: 'Bipolar sintético', grupo: 'F30-F39' },
            { valor: 'F41.1', codigo: 'F41.1', rotulo: 'Ansiedade sintética', grupo: 'F40-F48' },
          ]}
          valor={valor}
          onChange={(v) => {
            escolhas.push(v);
            setValor(v);
          }}
        />
      );
    }
    render(<Teste />);
    const input = screen.getByRole('combobox') as HTMLInputElement;
    act(() => input.focus());
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.change(input, { target: { value: 'f313' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(escolhas).toEqual(['F31.3']);
    expect(input.value).toBe('F31.3 · Bipolar sintético');

    fireEvent.change(input, { target: { value: 'ansi' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('F31.3 · Bipolar sintético');
    expect(escolhas).toEqual(['F31.3']);

    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByText('Nenhum código encontrado.')).toBeTruthy();
  });
});
