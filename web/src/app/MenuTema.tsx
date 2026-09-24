/** Menu de tema no header: Sistema / Claro / Escuro (menuitemradio; setas, Esc, clique fora fecham). */
import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTema, type Tema } from './tema';

const OPCOES: { tema: Tema; rotulo: string; Icone: typeof Sun }[] = [
  { tema: 'sistema', rotulo: 'Sistema', Icone: Monitor },
  { tema: 'claro', rotulo: 'Claro', Icone: Sun },
  { tema: 'escuro', rotulo: 'Escuro', Icone: Moon },
];

export function MenuTema() {
  const { tema, definirTema } = useTema();
  const [aberto, setAberto] = useState(false);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const atual = OPCOES.find((o) => o.tema === tema)!;

  useEffect(() => {
    if (!aberto) return;
    menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    function fora(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node) && !botaoRef.current?.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  function fechar() {
    setAberto(false);
    botaoRef.current?.focus();
  }

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    const itens = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const i = itens.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      itens[(i + (e.key === 'ArrowDown' ? 1 : itens.length - 1)) % itens.length]?.focus();
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      itens[e.key === 'Home' ? 0 : itens.length - 1]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      fechar();
    } else if (e.key === 'Tab') {
      setAberto(false);
    }
  }

  return (
    <div className="menu-tema">
      <button
        ref={botaoRef}
        type="button"
        className="menu-tema__botao"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={`Tema: ${atual.rotulo}`}
        onClick={() => setAberto((a) => !a)}
      >
        <atual.Icone size={16} aria-hidden="true" />
      </button>
      {aberto && (
        <div ref={menuRef} className="menu-tema__menu" role="menu" aria-label="Tema" onKeyDown={aoTeclar}>
          {OPCOES.map(({ tema: t, rotulo, Icone }) => (
            <button
              key={t}
              type="button"
              role="menuitemradio"
              aria-checked={t === tema}
              tabIndex={-1}
              className="menu-tema__item"
              onClick={() => {
                definirTema(t);
                fechar();
              }}
            >
              <Icone size={14} aria-hidden="true" />
              {rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
