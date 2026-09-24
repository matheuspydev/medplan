/**
 * Roteador mínimo (History API, sem biblioteca): /consulta (padrão), /registro, /metodologia.
 *
 * - `useRota()` devolve a rota atual; `navegar('/registro')` troca de tela.
 * - O FRAGMENTO (#...) nunca é tocado aqui: na Consulta ele guarda o estado da consulta.
 *   Ao navegar para outra rota, o fragmento é descartado (cada tela tem o seu).
 * - Qualquer caminho desconhecido (inclusive "/") vira /consulta via replaceState.
 */
import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

export type Rota = '/consulta' | '/registro' | '/metodologia';

export const ROTAS: { caminho: Rota; nome: string }[] = [
  { caminho: '/consulta', nome: 'Consulta' },
  { caminho: '/registro', nome: 'Registro de caso' },
  { caminho: '/metodologia', nome: 'Metodologia' },
];

const EVENTO = 'medplan:navegacao';

function resolver(caminho: string): Rota {
  const limpo = caminho.replace(/\/+$/, '');
  return (ROTAS.find((r) => r.caminho === limpo)?.caminho ?? '/consulta') as Rota;
}

/** Corrige a URL inicial para uma rota conhecida, preservando o fragmento. */
export function normalizarUrlInicial(): void {
  const rota = resolver(window.location.pathname);
  if (rota !== window.location.pathname) {
    window.history.replaceState(null, '', `${rota}${window.location.hash}`);
  }
}

export function navegar(rota: Rota, fragmento = ''): void {
  const destino = `${rota}${fragmento}`;
  if (destino === `${window.location.pathname}${window.location.hash}`) return;
  window.history.pushState(null, '', destino);
  window.dispatchEvent(new Event(EVENTO));
  window.scrollTo(0, 0);
}

function assinar(aviso: () => void): () => void {
  window.addEventListener('popstate', aviso);
  window.addEventListener(EVENTO, aviso);
  return () => {
    window.removeEventListener('popstate', aviso);
    window.removeEventListener(EVENTO, aviso);
  };
}

export function useRota(): Rota {
  return useSyncExternalStore(assinar, () => resolver(window.location.pathname));
}

/** <a> que navega sem recarregar (Ctrl/Meta/botão do meio mantêm o comportamento nativo). */
export function LinkRota({ para, onClick, ...resto }: { para: Rota } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  function aoClicar(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navegar(para);
  }
  return <a href={para} onClick={aoClicar} {...resto} />;
}
