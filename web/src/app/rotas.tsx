/**
 * Roteador mínimo (History API, sem biblioteca).
 *
 * - `useRota()` devolve a rota atual; `navegar('/registro')` troca de tela.
 * - O FRAGMENTO (#...) nunca é tocado aqui: na Consulta ele guarda o estado da consulta; na
 *   ficha do paciente e no registro, a chave (#chave=...), que assim não chega ao servidor.
 *   Ao navegar para outra rota, o fragmento é descartado (cada tela tem o seu).
 * - Qualquer caminho desconhecido (inclusive "/") vira a rota inicial via replaceState.
 */
import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

export type Rota =
  | '/visao-geral'
  | '/consulta'
  | '/pacientes'
  | '/paciente'
  | '/registro'
  | '/medicamentos'
  | '/medicamentos/comparar'
  | '/reacoes'
  | '/qualidade'
  | '/metodologia';

/** `nome` vai no título da aba do navegador. */
export const ROTAS: { caminho: Rota; nome: string }[] = [
  { caminho: '/visao-geral', nome: 'Visão geral' },
  { caminho: '/consulta', nome: 'Consulta por perfil' },
  { caminho: '/pacientes', nome: 'Pacientes' },
  { caminho: '/paciente', nome: 'Ficha do paciente' },
  { caminho: '/registro', nome: 'Registrar atendimento' },
  { caminho: '/medicamentos', nome: 'Medicamentos' },
  { caminho: '/medicamentos/comparar', nome: 'Comparar medicamentos' },
  { caminho: '/reacoes', nome: 'Reações adversas' },
  { caminho: '/qualidade', nome: 'Qualidade dos dados' },
  { caminho: '/metodologia', nome: 'Metodologia' },
];

const ROTA_INICIAL: Rota = '/visao-geral';

const EVENTO = 'medplan:navegacao';

function resolver(caminho: string): Rota {
  const limpo = caminho.replace(/\/+$/, '');
  return ROTAS.find((r) => r.caminho === limpo)?.caminho ?? ROTA_INICIAL;
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
export function LinkRota({
  para,
  fragmento = '',
  onClick,
  ...resto
}: { para: Rota; fragmento?: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  function aoClicar(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navegar(para, fragmento);
  }
  return <a href={`${para}${fragmento}`} onClick={aoClicar} {...resto} />;
}

/** Fragmento "#chave=REG-..." da ficha do paciente e do registro (a chave não vai para a URL do servidor). */
export function fragmentoChave(chave: string): string {
  return `#chave=${encodeURIComponent(chave)}`;
}

export function lerChaveDoFragmento(hash: string): string | null {
  const m = /(?:^#|&)chave=([^&]+)/.exec(hash);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}
