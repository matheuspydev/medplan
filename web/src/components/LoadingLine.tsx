/**
 * <LoadingLine> — linha indeterminada de 2px + rótulo. Nada nos primeiros 300ms
 * (--delay-loading-indicator); só então aparece. Sem skeleton com números, sem shimmer.
 *
 *   <LoadingLine ativo={carregando} rotulo="Calculando coorte (6 níveis)…" />
 *
 * O aria-busy do resultado esmaecido fica a cargo da tela.
 */
import { useEffect, useState } from 'react';
import './LoadingLine.css';

/** Espelha --delay-loading-indicator de tokens.css. */
export const ATRASO_CARREGANDO_MS = 300;

export interface LoadingLineProps {
  ativo: boolean;
  rotulo: string;
  className?: string;
}

export function LoadingLine({ ativo, rotulo, className }: LoadingLineProps) {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (!ativo) {
      setVisivel(false);
      return;
    }
    const timer = window.setTimeout(() => setVisivel(true), ATRASO_CARREGANDO_MS);
    return () => window.clearTimeout(timer);
  }, [ativo]);

  return (
    <div className={['linha-carregando', className].filter(Boolean).join(' ')} role="status" aria-live="polite">
      {ativo && visivel && (
        <>
          <div className="linha-carregando__trilho" aria-hidden="true">
            <div className="linha-carregando__barra" />
          </div>
          <p className="linha-carregando__rotulo caption">{rotulo}</p>
        </>
      )}
    </div>
  );
}
