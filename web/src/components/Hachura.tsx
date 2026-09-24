/**
 * <Hachura> — "sem medida possível": textura 45° (data-hatch) com o texto SEMPRE numa caixa sólida.
 *
 * tamanho 'celula': célula PERMANÊNCIA da seção 03, ex.
 *   <Hachura><Proporcao pct={null} n={12} ... /></Hachura>   -> "dados insuficientes (n=12)"
 * tamanho 'painel': painel global DADOS INSUFICIENTES que substitui o 02.
 * Nunca é barra de progresso: não recebe n nem proporção.
 */
import type { ReactNode } from 'react';
import './Hachura.css';

export interface HachuraProps {
  tamanho?: 'celula' | 'painel';
  className?: string;
  children: ReactNode;
}

export function Hachura({ tamanho = 'celula', className, children }: HachuraProps) {
  return (
    <div className={['hachura', `hachura--${tamanho}`, className].filter(Boolean).join(' ')}>
      <div className="hachura__caixa">{children}</div>
    </div>
  );
}
