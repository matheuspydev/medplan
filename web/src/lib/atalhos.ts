/**
 * Atalhos globais de teclado.
 *
 * Regra da spec: atalhos ficam desativados quando o foco está num campo de texto,
 * para não roubar digitação. Exceção deliberada: combinações com Ctrl/Alt/Meta
 * (Ctrl+Enter, Ctrl+S, Alt+M) funcionam em qualquer campo, porque não produzem texto
 * ("Ctrl+Enter analisa de qualquer campo"). Teclas simples ("/") só fora de campo.
 */
import { useEffect, useRef } from 'react';

export interface Atalho {
  /** Compara com KeyboardEvent.key, sem caixa ("Enter", "s", "/"). Use `codigo` quando o layout altera a tecla. */
  tecla?: string;
  /** Compara com KeyboardEvent.code ("KeyM"). Preferível com Alt: no macOS, Option+M produz "µ". */
  codigo?: string;
  /** Ctrl no Windows/Linux; aceita também Cmd (metaKey). */
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  /** Força o comportamento em campo de texto. Padrão: true se houver ctrl/alt, false caso contrário. */
  emCampoDeTexto?: boolean;
  /** Chamado com o evento; preventDefault já foi aplicado. */
  acao: (evento: KeyboardEvent) => void;
}

const TIPOS_SEM_TEXTO = new Set(['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color', 'file', 'image']);

/** true quando o elemento recebe digitação (input de texto, textarea, select, contenteditable, combobox). */
export function emCampoDeTexto(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLInputElement) return !TIPOS_SEM_TEXTO.has(el.type);
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  return el instanceof HTMLElement && el.isContentEditable;
}

export function correspondeAtalho(e: KeyboardEvent, a: Atalho): boolean {
  if (a.tecla !== undefined && e.key.toLowerCase() !== a.tecla.toLowerCase()) return false;
  if (a.codigo !== undefined && e.code !== a.codigo) return false;
  if (Boolean(a.ctrl) !== (e.ctrlKey || e.metaKey)) return false;
  if (Boolean(a.alt) !== e.altKey) return false;
  if (a.shift !== undefined && a.shift !== e.shiftKey) return false;
  const permiteEmCampo = a.emCampoDeTexto ?? Boolean(a.ctrl || a.alt);
  if (!permiteEmCampo && emCampoDeTexto(document.activeElement)) return false;
  return true;
}

/**
 * Registra atalhos no window enquanto o componente estiver montado (e `ativo`).
 * A lista pode ser recriada a cada render: o hook lê sempre a mais recente.
 */
export function useAtalhos(atalhos: Atalho[], ativo = true): void {
  const ref = useRef(atalhos);
  useEffect(() => {
    ref.current = atalhos;
  });

  useEffect(() => {
    if (!ativo) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.defaultPrevented || e.isComposing) return;
      for (const a of ref.current) {
        if (correspondeAtalho(e, a)) {
          e.preventDefault();
          a.acao(e);
          return;
        }
      }
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [ativo]);
}
