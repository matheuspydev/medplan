/**
 * Botão. Primário = fundo grafite (action), 36px; secundário = contornado, 32px; link = sublinhado.
 * Nunca magenta. `type` padrão é "button": Enter em formulário nunca envia por acidente.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import './Button.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: 'primario' | 'secundario' | 'link';
  /** Ícone lucide (já com size). Decorativo: recebe aria-hidden aqui. */
  icone?: ReactNode;
  /** Dica de atalho em mono dentro do botão e no title, ex. "Ctrl+Enter". */
  atalho?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variante = 'primario', icone, atalho, className, children, type = 'button', title, ...resto },
  ref,
) {
  const classes = ['botao', `botao--${variante}`, className].filter(Boolean).join(' ');
  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      title={title ?? (atalho ? `Atalho: ${atalho}` : undefined)}
      aria-keyshortcuts={atalho ? atalho.replace(/\s/g, '') : undefined}
      {...resto}
    >
      {icone && (
        <span className="botao__icone" aria-hidden="true">
          {icone}
        </span>
      )}
      <span>{children}</span>
      {atalho && (
        <kbd className="botao__atalho" aria-hidden="true">
          {atalho}
        </kbd>
      )}
    </button>
  );
});
