/**
 * <Drawer> — painel modal à direita (Metodologia). role="dialog" + aria-modal, foco preso,
 * Esc e clique no scrim fecham, e o foco volta ao elemento que abriu.
 * Fica ABAIXO da faixa SINTÉTICO (que tem z-index maior e continua visível).
 *
 *   <Drawer aberto={aberto} onFechar={() => setAberto(false)} titulo="Metodologia">...</Drawer>
 */
import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import './Drawer.css';

export interface DrawerProps {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  children: ReactNode;
}

const FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Drawer({ aberto, onFechar, titulo, children }: DrawerProps) {
  const idTitulo = useId();
  const painelRef = useRef<HTMLDivElement>(null);
  const onFecharRef = useRef(onFechar);
  useEffect(() => {
    onFecharRef.current = onFechar;
  });

  useEffect(() => {
    if (!aberto) return;
    const gatilho = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    painelRef.current?.focus();

    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onFecharRef.current();
        return;
      }
      if (e.key !== 'Tab' || !painelRef.current) return;
      const focaveis = [...painelRef.current.querySelectorAll<HTMLElement>(FOCAVEIS)];
      if (!focaveis.length) {
        e.preventDefault();
        return;
      }
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      const atual = document.activeElement;
      if (e.shiftKey && (atual === primeiro || atual === painelRef.current)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && atual === ultimo) {
        e.preventDefault();
        primeiro.focus();
      } else if (!painelRef.current.contains(atual)) {
        e.preventDefault();
        primeiro.focus();
      }
    }
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = overflowAnterior;
      gatilho?.focus();
    };
  }, [aberto]);

  if (!aberto) return null;

  return (
    <div className="drawer">
      <div className="drawer__scrim" onClick={onFechar} aria-hidden="true" />
      <div ref={painelRef} className="drawer__painel" role="dialog" aria-modal="true" aria-labelledby={idTitulo} tabIndex={-1}>
        <header className="drawer__cabecalho">
          <h2 id={idTitulo} className="drawer__titulo micro">
            {titulo}
          </h2>
          <button type="button" className="drawer__fechar" onClick={onFechar} aria-label={`Fechar ${titulo}`} aria-keyshortcuts="Escape">
            <X size={16} aria-hidden="true" />
            <kbd aria-hidden="true">Esc</kbd>
          </button>
        </header>
        <div className="drawer__corpo">
          {children}
        </div>
      </div>
    </div>
  );
}
