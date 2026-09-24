import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Referencias } from '../../api/types';

// Catálogo SINTÉTICO mínimo, só com a forma do contrato (sem significado clínico).
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
  medicamentos: [{ id: 1, principio_ativo: 'Fármaco A', codigo_atc: 'N0XXX01', classe_terapeutica: 'Classe sintética' }],
  reacoes_adversas: [{ id: 4, termo: 'Termo sintético', soc: 'SOC sintético', gravidade_padrao: 'grave' }],
  opcoes: {
    sexo: [
      { codigo: 'feminino', rotulo: 'Feminino' },
      { codigo: 'masculino', rotulo: 'Masculino' },
    ],
    tabagismo: [{ codigo: 'desconhecido', rotulo: 'Desconhecido' }],
    gestacao_lactacao: [{ codigo: 'nao_aplicavel', rotulo: 'Não se aplica' }],
    funcao_renal: [{ codigo: 'desconhecida', rotulo: 'Desconhecida' }],
    funcao_hepatica: [{ codigo: 'desconhecida', rotulo: 'Desconhecida' }],
    uso_substancias: [{ codigo: 'desconhecido', rotulo: 'Desconhecido' }],
    via: [{ codigo: 'oral', rotulo: 'Oral' }],
    gravidade: [
      { codigo: 'leve', rotulo: 'Leve' },
      { codigo: 'grave', rotulo: 'Grave' },
    ],
    status_tratamento: [
      { codigo: 'em_uso', rotulo: 'Em uso', grupo: 'censura' },
      { codigo: 'concluido_sucesso', rotulo: 'Concluído com resposta adequada', grupo: 'sucesso' },
      { codigo: 'desc_reacao_adversa', rotulo: 'Descontinuado por reação adversa', grupo: 'descontinuacao' },
      { codigo: 'desc_ineficacia', rotulo: 'Descontinuado por ineficácia', grupo: 'descontinuacao' },
      { codigo: 'perdido_seguimento', rotulo: 'Perdido de seguimento', grupo: 'censura' },
    ],
    unidades_dose: ['mg'],
  },
};

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

let respostasPost: Response[] = [];
const corposPost: unknown[] = [];

beforeEach(() => {
  // o rascunho vive em memória no módulo (sobrevive à troca de aba): cada teste começa com módulos novos
  vi.resetModules();
  respostasPost = [];
  corposPost.length = 0;
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/referencias')) return json(referencias);
      if (url.includes('/casos') && init?.method === 'POST') {
        corposPost.push(JSON.parse(String(init.body)));
        return respostasPost.shift()!;
      }
      if (url.includes('/casos')) return json([]);
      return json({ detail: 'não previsto' }, 404);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const grupo = (id: string) => within(document.getElementById(id)!);

function escolherNoCombobox(id: string, texto: string) {
  const input = document.getElementById(id) as HTMLInputElement;
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: texto } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

async function montar() {
  const { ReferenciasProvider } = await import('../../api/referencias');
  const { default: RegistroPage } = await import('./RegistroPage');
  render(
    <ReferenciasProvider>
      <RegistroPage />
    </ReferenciasProvider>,
  );
  await screen.findByText('Diagnóstico principal');
}

function preencherCasoValido() {
  escolherNoCombobox('reg-perfil-cid10_principal', 'f321');
  fireEvent.click(grupo('reg-perfil-sexo').getByRole('radio', { name: 'Feminino' }));
  fireEvent.click(grupo('reg-perfil-faixa_etaria_cod').getByRole('radio', { name: '26 a 35 anos' }));
  fireEvent.change(document.getElementById('reg-perfil-faixa_imc_cod')!, { target: { value: '__desconhecida' } });
  fireEvent.click(grupo('reg-perfil-tabagismo').getByRole('radio', { name: 'Desconhecido' }));
  fireEvent.click(grupo('reg-perfil-gestacao_lactacao').getByRole('radio', { name: 'Não se aplica' }));
  fireEvent.click(grupo('reg-perfil-funcao_renal').getByRole('radio', { name: 'Desconhecida' }));
  fireEvent.click(grupo('reg-perfil-funcao_hepatica').getByRole('radio', { name: 'Desconhecida' }));
  fireEvent.click(grupo('reg-perfil-uso_substancias').getByRole('radio', { name: 'Desconhecido' }));

  const tid = document.querySelector('[id^="reg-t"][id$="-medicamento_id"]')!.id.match(/^reg-t(\d+)-/)![1];
  escolherNoCombobox(`reg-t${tid}-medicamento_id`, 'farmaco');
  fireEvent.change(document.getElementById(`reg-t${tid}-data_inicio`)!, { target: { value: '2025-02-03' } });
  fireEvent.click(grupo(`reg-t${tid}-via`).getByRole('radio', { name: 'Oral' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Descontinuado por ineficácia' }));
  fireEvent.change(document.getElementById(`reg-t${tid}-data_fim`)!, { target: { value: '2025-03-01' } });
  return tid;
}

describe('RegistroPage', () => {
  it('mostra a banda de privacidade e a chave "gerada ao salvar"; nenhum campo identificável', async () => {
    await montar();
    expect(screen.getByRole('note', { name: 'Privacidade' }).textContent).toContain('não pede nome, CPF, prontuário, data de nascimento nem endereço');
    expect(screen.getByRole('note', { name: 'Privacidade' }).textContent).toContain('registre apenas casos fictícios');
    expect(screen.getByText('gerada ao salvar')).toBeTruthy();
    expect(document.querySelector('textarea')).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d\s*%/);
  });

  it('sem pré-seleção: nenhum rádio marcado e gravidade não vem do catálogo', async () => {
    await montar();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar reação' }));
    expect(document.querySelectorAll('input[type="radio"]:checked')).toHaveLength(0);
  });

  it('obrigatórios só aparecem ao salvar; pendências viram links que focam o campo', async () => {
    await montar();
    expect(screen.queryByText("Escolha o sexo; 'não informado' é uma opção válida.")).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Salvar caso/ }));
    expect(screen.getByText("Escolha o sexo; 'não informado' é uma opção válida.")).toBeTruthy();
    expect(screen.getByText('13 pendências')).toBeTruthy();
    expect(document.activeElement?.id).toBe('reg-pendencias');

    fireEvent.click(screen.getByRole('button', { name: 'Perfil · Faixa de IMC: obrigatório' }));
    expect(document.activeElement?.id).toBe('reg-perfil-faixa_imc_cod');
    expect(fetch).toHaveBeenCalledTimes(1); // só /referencias: nada foi enviado
  });

  it('em uso limpa e desabilita a data de fim, com Desfazer', async () => {
    await montar();
    const tid = preencherCasoValido();
    const dataFim = () => document.getElementById(`reg-t${tid}-data_fim`) as HTMLInputElement;
    fireEvent.click(screen.getByRole('radio', { name: 'Em uso' }));
    expect(dataFim().disabled).toBe(true);
    expect(dataFim().value).toBe('');
    expect(screen.getByText('Não se aplica a este status.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(dataFim().value).toBe('2025-03-01');
    expect((screen.getByRole('radio', { name: 'Descontinuado por ineficácia' }) as HTMLInputElement).checked).toBe(true);
  });

  it('remover pede confirmação inline e deixa "T2 removido · Desfazer" sem temporizador', async () => {
    await montar();
    fireEvent.click(screen.getByRole('button', { name: /Adicionar tratamento/ }));
    expect(document.querySelectorAll('.bloco-tratamento')).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: 'Remover' })[1]);
    const confirmacao = screen.getByRole('group', { name: 'Confirmar remoção de T2' });
    expect(confirmacao.textContent).toContain('Remover T2?');
    expect(document.activeElement?.textContent).toBe('Cancelar');
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Remover' }));

    expect(document.querySelectorAll('.bloco-tratamento')).toHaveLength(1);
    expect(screen.getByText(/T2 removido/)).toBeTruthy();
    expect(document.activeElement?.id).toMatch(/^reg-t\d+-cabecalho$/);
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(document.querySelectorAll('.bloco-tratamento')).toHaveLength(2);
    expect(screen.queryByText(/T2 removido/)).toBeNull();
  });

  it('rascunho sobrevive à troca de tela dentro do app (memória, nada em localStorage)', async () => {
    await montar();
    fireEvent.click(grupo('reg-perfil-sexo').getByRole('radio', { name: 'Masculino' }));
    cleanup();
    expect(document.getElementById('reg-perfil-sexo')).toBeNull();
    await montar();
    expect((grupo('reg-perfil-sexo').getByRole('radio', { name: 'Masculino' }) as HTMLInputElement).checked).toBe(true);
    expect(window.localStorage.length).toBe(0);
  });

  it('contradição levou à descontinuação x em uso bloqueia; outro motivo só avisa', async () => {
    await montar();
    const tid = preencherCasoValido();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar reação' }));
    const rid = document.querySelector(`[id^="reg-t${tid}-r"][id$="-levou_descontinuacao"]`)!.id;
    fireEvent.click(grupo(rid).getByRole('radio', { name: 'Sim' }));
    expect(screen.getByText('A reação foi marcada como causa da descontinuação, mas o motivo registrado não é reação adversa.')).toBeTruthy();

    fireEvent.click(screen.getByRole('radio', { name: 'Em uso' }));
    expect(screen.getByText('A reação foi marcada como causa de descontinuação, mas o status do tratamento indica que não houve descontinuação.')).toBeTruthy();
  });

  it('422 do servidor vai para o campo; 201 troca o formulário pela confirmação', async () => {
    await montar();
    const tid = preencherCasoValido();

    respostasPost.push(json({ detail: [{ campo: 'tratamentos.0.desfecho.data_fim', mensagem: 'A data de fim não pode estar no futuro.' }] }, 422));
    await act(async () => {
      fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    });
    expect(await screen.findByText('A data de fim não pode estar no futuro.')).toBeTruthy();
    expect(document.getElementById(`reg-t${tid}-data_fim`)!.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('button', { name: 'T1 · Data de fim' })).toBeTruthy();
    // valores preservados
    expect((document.getElementById(`reg-t${tid}-data_inicio`) as HTMLInputElement).value).toBe('2025-02-03');

    respostasPost.push(
      json(
        {
          id: 6001,
          chave_pseudonima: 'REG-7F3A9C2K',
          tratamentos: 1,
          reacoes: 0,
          criado_em: '2026-09-14T17:36:00+00:00',
          alertas: [],
        },
        201,
      ),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Salvar caso/ }));
    });
    const titulo = await screen.findByRole('heading', { name: 'Caso registrado' });
    expect(document.activeElement).toBe(titulo);
    expect(screen.getAllByText('REG-7F3A9C2K').length).toBeGreaterThan(0);
    expect(screen.getByText('Caso REG-7F3A9C2K registrado.')).toBeTruthy();
    expect(await screen.findByText('Nenhum caso registrado nesta base ainda.')).toBeTruthy();

    expect(corposPost[1]).toStrictEqual({
      perfil: {
        sexo: 'feminino',
        faixa_etaria_cod: '26_35',
        cid10_principal: 'F32.1',
        comorbidades: [],
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
          data_inicio: '2025-02-03',
          dose_inicial: null,
          dose_manutencao: null,
          unidade_dose: null,
          via: 'oral',
          linha_tratamento: null,
          desfecho: { status: 'desc_ineficacia', data_fim: '2025-03-01', data_ultima_observacao: '2025-03-01', efetividade_percebida: null },
          reacoes: [],
        },
      ],
    });
  });
});
