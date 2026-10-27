/**
 * Apoio aos testes das telas de painel: monta a tela com catálogo e filtros e responde cada
 * POST /paineis/... com a fixture do caminho. Tudo SINTÉTICO, só com a forma do contrato.
 */
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { ReferenciasProvider } from '../api/referencias';
import type { ProporcaoInsuficiente, ProporcaoSuficiente, Referencias } from '../api/types';
import { FiltrosProvider } from '../app/filtros';
import { REFERENCIAS_TESTE } from '../features/consulta/teste-fixtures';

export const REFERENCIAS_PAINEIS: Referencias = {
  ...REFERENCIAS_TESTE,
  medicamentos: [
    { id: 2, principio_ativo: 'fármaco b', codigo_atc: 'N0XXX02', classe_terapeutica: 'Classe sintética' },
    { id: 1, principio_ativo: 'fármaco a', codigo_atc: 'N0XXX01', classe_terapeutica: 'Classe sintética' },
  ],
};

/** Proporção acima do n mínimo (números de layout, sem significado clínico). */
export function proporcao(n: number, n_base: number, pct: number, ic: [number, number]): ProporcaoSuficiente {
  return {
    suficiente: true,
    n,
    n_base,
    taxa: pct / 100,
    pct,
    ic_inferior: ic[0] / 100,
    ic_superior: ic[1] / 100,
    ic_inferior_pct: ic[0],
    ic_superior_pct: ic[1],
  };
}

export const insuficiente = (n_base: number): ProporcaoInsuficiente => ({ suficiente: false, n_base });

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

type Resposta = unknown | ((corpo: Record<string, unknown>) => unknown);

/**
 * Monta a tela; `respostas` por caminho ("/paineis/reacoes"), fixas ou em função do corpo do pedido.
 * Devolve os corpos enviados, em ordem.
 */
export function montarPainel(tela: ReactElement, respostas: Record<string, Resposta>) {
  const corpos: { caminho: string; corpo: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/referencias')) return json(REFERENCIAS_PAINEIS);
      const caminho = url.replace('/api/v1', '');
      const corpo = JSON.parse(String(init?.body));
      corpos.push({ caminho, corpo });
      if (!(caminho in respostas)) return json({ detail: 'não previsto' }, 404);
      const resposta = respostas[caminho];
      return json(typeof resposta === 'function' ? resposta(corpo) : resposta);
    }),
  );
  render(
    <ReferenciasProvider>
      <FiltrosProvider>{tela}</FiltrosProvider>
    </ReferenciasProvider>,
  );
  return corpos;
}
