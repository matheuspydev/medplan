import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReferenciasProvider } from '../../api/referencias';
import type { AnaliseResposta, DegrauEscada, LinhaRecomendada } from '../../api/types';
import { AVISO_VIES_INDICACAO } from '../metodologia/ConteudoMetodologia';
import ConsultaPage from './ConsultaPage';
import { REFERENCIAS_TESTE } from './teste-fixtures';

// Resposta SINTÉTICA com a forma do contrato. Nomes são placeholders; proporções conferidas com ic_wilson
// (valores de layout da spec, sem significado clínico).
const substituicoes = [
  { criterio: 'comorbidades clínicas', valor_informado: 'nenhuma', valor_usado: 'não filtradas' },
  { criterio: 'comorbidades psiquiátricas', valor_informado: 'nenhuma', valor_usado: 'não filtradas' },
  { criterio: 'faixa etária', valor_informado: '26 a 35 anos', valor_usado: '18 a 50 anos' },
  { criterio: 'sexo', valor_informado: 'feminino', valor_usado: 'todos' },
  {
    criterio: 'código CID-10',
    valor_informado: 'F31.3',
    valor_usado: 'grupo F30-F39',
    codigos_grupo: ['F31.1', 'F31.3', 'F31.9', 'F32.1', 'F32.2', 'F33.1', 'F33.2'],
    grupo_amplia: true,
  },
];

const ROTULOS = ['Perfil completo', 'Comorbidades clínicas ignoradas', 'Comorbidades ignoradas', 'Faixa etária ampliada para as adjacentes', 'Sexo ignorado', 'Grupo diagnóstico em vez do código exato'];

function escada(parou: number, maiorN: number[]): DegrauEscada[] {
  return ROTULOS.map((rotulo, ordem) => ({
    ordem,
    rotulo,
    criterios_relaxados: substituicoes.slice(0, ordem).map((s) => s.criterio),
    substituicoes: substituicoes.slice(0, ordem),
    n_perfis: 10 * (ordem + 1),
    n_medicamentos: 3,
    melhor_n_avaliavel: maiorN[ordem],
    atingiu_n_minimo: maiorN[ordem] >= 20,
    selecionado: ordem === parou,
  }));
}

function linha(posicao: number, nome: string, retidos: number, n: number, pct: number, inf: number, sup: number): LinhaRecomendada {
  return {
    posicao,
    medicamento_id: posicao,
    principio_ativo: nome,
    classe_terapeutica: 'Classe sintética',
    codigo_atc: 'N0XXX00',
    n_episodios: n + 4,
    permanencia: {
      taxa: retidos / n,
      ic_inferior: inf / 100,
      ic_superior: sup / 100,
      pct,
      ic_inferior_pct: inf,
      ic_superior_pct: sup,
      n_avaliavel: n,
      n_retidos: retidos,
      n_censurado: 4,
    },
    descontinuacao_por_motivo: (['desc_reacao_adversa', 'desc_ineficacia', 'desc_nao_adesao', 'desc_outro'] as const).map((motivo) => ({
      motivo,
      rotulo: motivo,
      n: 0,
      n_base: n,
      taxa: 0,
      ic_inferior: 0,
      ic_superior: 0.1,
      pct: 0,
      ic_inferior_pct: 0,
      ic_superior_pct: 10,
    })),
    reacoes: [],
  };
}

function resposta(parcial: Partial<AnaliseResposta> = {}): AnaliseResposta {
  return {
    perfil: { sexo: 'feminino', faixa_etaria_cod: '26_35', cid10_principal: 'F31.3', comorbidades: [] },
    horizonte_dias: 84,
    n_minimo: 20,
    nivel: { ordem: 3, rotulo: ROTULOS[3], criterios_relaxados: substituicoes.slice(0, 3).map((s) => s.criterio), substituicoes: substituicoes.slice(0, 3) },
    n_perfis: 40,
    dados_insuficientes: false,
    escada: escada(3, [1, 2, 5, 37, 40, 90]),
    avisos: [{ tipo: 'vies_indicacao', texto: AVISO_VIES_INDICACAO }],
    total_censurado: 22,
    proveniencia: { sintetico: true, n_perfis_base: 6000, calculado_em: '2026-09-14T14:32:05-03:00' },
    recomendados: [linha(1, 'Fármaco A', 26, 37, 70, 54, 83), linha(2, 'Fármaco B', 22, 34, 65, 48, 79), linha(3, 'Fármaco C', 19, 29, 66, 47, 80)],
    sem_dados_suficientes: [{ medicamento_id: 9, principio_ativo: 'Fármaco D', classe_terapeutica: 'Classe sintética', codigo_atc: 'N0XXX00', n_episodios: 15, n_avaliavel: 12, n_censurado: 3 }],
    ...parcial,
  };
}

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

function montar(respostas: (() => Response)[]) {
  const analises: unknown[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/referencias')) return json(REFERENCIAS_TESTE);
    if (url.endsWith('/analises')) {
      analises.push(JSON.parse(String(init?.body)));
      const proxima = respostas.shift();
      return proxima ? proxima() : json({ detail: 'sem resposta' }, 500);
    }
    return json({}, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  render(
    <ReferenciasProvider>
      <ConsultaPage />
    </ReferenciasProvider>,
  );
  return { analises };
}

describe('<ConsultaPage>', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/consulta');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('antes da leitura: disclaimer + prévia; submit incompleto marca e foca o diagnóstico, sem chamar a API', async () => {
    const { analises } = montar([]);
    expect(await screen.findByText('Se faltarem casos, o sistema ignora nesta ordem')).toBeTruthy();
    expect(screen.getAllByRole('note').some((n) => n.textContent?.includes('Apoio à decisão — não é prescrição.'))).toBe(true);
    // sexo e faixa sem pré-seleção
    expect(screen.getAllByRole('radio').every((r) => !(r as HTMLInputElement).checked)).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Analisar coorte/ }));
    expect(screen.getByText('Escolha o diagnóstico principal (CID-10).')).toBeTruthy();
    expect(screen.getByText('Escolha o sexo; "não informado" é uma opção válida.')).toBeTruthy();
    expect(document.activeElement?.id).toBe('consulta-dx');
    expect(analises).toHaveLength(0);
  });

  it('prévia derivada do catálogo para o perfil do fragmento', async () => {
    window.history.replaceState(null, '', '/consulta#dx=F31.3&faixa=26_35');
    montar([]);
    const previa = await screen.findByRole('region', { name: 'Se faltarem casos, o sistema ignora nesta ordem' });
    expect(previa.textContent).toContain('26 a 35 anos passa a 18 a 50 anos'); // a seta é SVG; o texto oculto diz "passa a"
    expect(previa.textContent).toContain('F31.1 F31.3 F31.9 F32.1 F32.2 F33.1 F33.2');
  });

  it('fragmento completo refaz a leitura: readouts com n e IC, viés literal, critérios ignorados, nota de inversão, seção 03', async () => {
    window.history.replaceState(null, '', '/consulta#dx=F31.3&sexo=feminino&faixa=26_35&h=84&nmin=20');
    const { analises } = montar([() => json(resposta())]);

    expect(await screen.findByRole('img', { name: '70 por cento; n igual a 37; intervalo de confiança de 95 por cento de 54 a 83 por cento' })).toBeTruthy();
    expect(analises).toEqual([{ sexo: 'feminino', faixa_etaria_cod: '26_35', cid10_principal: 'F31.3', comorbidades: [], horizonte_dias: 84, n_minimo: 20 }]);

    expect(screen.getByText(AVISO_VIES_INDICACAO)).toBeTruthy();
    expect(screen.getByRole('button', { name: '3 critérios ignorados' })).toBeTruthy();
    const caixa = screen.getByRole('region', { name: /Critérios ignorados para atingir n mínimo 20/ });
    expect(caixa.querySelectorAll('s')).toHaveLength(3);
    expect(caixa.textContent).toContain('A coorte abaixo não corresponde exatamente ao perfil informado.');
    expect(screen.getByText('Parou aqui')).toBeTruthy();
    expect(screen.getAllByText('não necessário')).toHaveLength(2);
    expect(screen.getByText('Taxa pontual maior que a de Fármaco B, mas limite inferior do IC95% menor: n menor (29 vs. 34).')).toBeTruthy();
    expect(screen.getByText('22 tratamentos fora do denominador por seguimento menor que 84 dias.', { exact: false })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'dados insuficientes; n igual a 12' }).textContent).toBe('dados insuficientes (n=12)');
    expect(screen.getByText(/Coorte calculada no nível 3 de 5: 40 perfis, 3 medicamentos com dados suficientes, 3 critérios ignorados\./)).toBeTruthy();
    // linhas ocre no rail
    expect(screen.getByText('ignorado no nível 3 · coorte usou 18 a 50 anos')).toBeTruthy();
    // nada abre sozinho
    expect(screen.getAllByRole('button', { name: /^Fármaco/, expanded: false })).toHaveLength(3);
  });

  it('disclosure com roving tabindex: seta abaixo move, seta direita expande, seta esquerda recolhe', async () => {
    window.history.replaceState(null, '', '/consulta#dx=F31.3&sexo=feminino&faixa=26_35');
    montar([() => json(resposta())]);
    const a = await screen.findByRole('button', { name: 'Fármaco A' });
    const b = screen.getByRole('button', { name: 'Fármaco B' });
    expect(a.tabIndex).toBe(0);
    expect(b.tabIndex).toBe(-1);
    act(() => a.focus());
    fireEvent.keyDown(a, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(b);
    expect(b.tabIndex).toBe(0);
    fireEvent.keyDown(b, { key: 'ArrowRight' });
    expect(b.getAttribute('aria-expanded')).toBe('true');
    const detalhe = document.getElementById(b.getAttribute('aria-controls')!)!;
    expect(within(detalhe).getByText(/Reações adversas mais frequentes/)).toBeTruthy();
    fireEvent.keyDown(b, { key: 'ArrowLeft' });
    expect(b.getAttribute('aria-expanded')).toBe('false');
  });

  it('editar o rail depois da leitura: LEITURA DESATUALIZADA, painéis ocultos, fragmento atualizado', async () => {
    window.history.replaceState(null, '', '/consulta#dx=F31.3&sexo=feminino&faixa=26_35&h=84&nmin=20');
    montar([() => json(resposta())]);
    await screen.findByRole('button', { name: 'Fármaco A' });

    fireEvent.click(screen.getByRole('radio', { name: 'Masculino' }));
    expect(screen.getByText('Leitura desatualizada')).toBeTruthy();
    const paineis = document.querySelector('.leitura__paineis')!;
    expect(paineis.getAttribute('aria-hidden')).toBe('true');
    expect(paineis.hasAttribute('inert')).toBe(true);
    expect(screen.getByText(AVISO_VIES_INDICACAO)).toBeTruthy();
    expect(screen.queryByText('ignorado no nível 3 · coorte usou 18 a 50 anos')).toBeNull();
    expect(window.location.hash).toBe('#dx=F31.3&sexo=masculino&faixa=26_35&h=84&nmin=20');

    // voltar ao perfil lido tira a marca
    fireEvent.click(screen.getByRole('radio', { name: 'Feminino' }));
    expect(screen.queryByText('Leitura desatualizada')).toBeNull();
  });

  it('falha da API remove o resultado anterior', async () => {
    window.history.replaceState(null, '', '/consulta#dx=F31.3&sexo=feminino&faixa=26_35');
    montar([() => json(resposta()), () => json({ detail: 'Erro interno sintético.' }, 500)]);
    await screen.findByRole('button', { name: 'Fármaco A' });

    fireEvent.click(screen.getByRole('button', { name: /Analisar coorte/ }));
    expect(await screen.findByText('Não foi possível calcular a coorte. Nenhum resultado foi exibido.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Fármaco A' })).toBeNull();
    expect(screen.queryByText(/n=37/)).toBeNull();
  });

  it('nenhum medicamento com n suficiente: painel DADOS INSUFICIENTES no lugar da tabela 02', async () => {
    window.history.replaceState(null, '', '/consulta#dx=F90.0&sexo=masculino&faixa=18_25&nmin=100');
    const insuficiente = resposta({
      n_minimo: 100,
      dados_insuficientes: true,
      nivel: {
        ordem: 5,
        rotulo: ROTULOS[5],
        criterios_relaxados: substituicoes.map((s) => s.criterio),
        substituicoes: [
          ...substituicoes.slice(0, 4),
          { criterio: 'código CID-10', valor_informado: 'F90.0', valor_usado: 'grupo F90-F98', codigos_grupo: ['F90.0'], grupo_amplia: false },
        ],
      },
      escada: escada(5, [1, 4, 5, 15, 33, 33]).map((d) => ({ ...d, atingiu_n_minimo: false })),
      recomendados: [],
    });
    montar([() => json(insuficiente)]);

    expect(await screen.findByRole('heading', { name: 'Dados insuficientes' })).toBeTruthy();
    expect(screen.getByText('Último nível tentado')).toBeTruthy();
    expect(screen.queryByText('Parou aqui')).toBeNull();
    expect(screen.getByText(/Nenhum medicamento atingiu n=100/).textContent).not.toMatch(/\d\s*%/);
    expect(screen.getAllByText(/contém só/).length).toBeGreaterThan(0);
    expect(document.querySelector('.permanencia')).toBeNull();
    expect(screen.queryByText(/baixar|reduzir o n/i)).toBeNull();
  });
});
