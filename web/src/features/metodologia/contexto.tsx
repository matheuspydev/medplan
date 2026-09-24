/**
 * Abertura da Metodologia a partir de qualquer tela.
 *
 * - Alt+M abre o drawer (registrado no App).
 * - <LinkMetodologia ancora="vies">Viés de indicação</LinkMetodologia> abre o drawer já na âncora.
 * - Na rota /metodologia, em vez de abrir o drawer, rola a própria página até a âncora.
 *
 * Âncoras: coorte · censura · wilson · ordem · vies · sintetico · creditos.
 * A navegação por âncora NUNCA altera o fragmento da URL (na Consulta ele guarda o estado).
 */
import { ChevronRight } from 'lucide-react';
import { createContext, useContext, type ReactNode } from 'react';
import './metodologia.css';

export type AncoraMetodologia = 'coorte' | 'censura' | 'wilson' | 'ordem' | 'vies' | 'sintetico' | 'creditos';

export const ANCORAS_METODOLOGIA: readonly AncoraMetodologia[] = ['coorte', 'censura', 'wilson', 'ordem', 'vies', 'sintetico', 'creditos'];

export interface ContextoMetodologia {
  abrir: (ancora?: AncoraMetodologia) => void;
}

export const MetodologiaContext = createContext<ContextoMetodologia | null>(null);

export function useMetodologia(): ContextoMetodologia | null {
  return useContext(MetodologiaContext);
}

/** Rola até a seção (dentro do drawer ou da página) e leva o foco ao título dela. */
export function irParaAncora(ancora: AncoraMetodologia): void {
  const alvo = document.getElementById(ancora);
  if (!alvo) return;
  alvo.scrollIntoView?.({ block: 'start' });
  const titulo = alvo.querySelector<HTMLElement>('[data-titulo-secao]');
  titulo?.focus({ preventScroll: true });
}

/** Link "Texto ›" para uma seção da Metodologia. O "›" é o ícone ChevronRight (a fonte não tem glifo seguro). */
export function LinkMetodologia({ ancora, children, className }: { ancora: AncoraMetodologia; children: ReactNode; className?: string }) {
  const contexto = useMetodologia();
  const conteudo = (
    <>
      <span>{children}</span>
      <ChevronRight size={12} aria-hidden="true" />
    </>
  );
  const classes = ['link-metodologia', className].filter(Boolean).join(' ');

  if (!contexto) {
    return (
      <a className={classes} href={`/metodologia#${ancora}`}>
        {conteudo}
      </a>
    );
  }
  return (
    <button type="button" className={classes} onClick={() => contexto.abrir(ancora)}>
      {conteudo}
    </button>
  );
}
