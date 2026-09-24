/**
 * Tema: Sistema (padrão) / Claro / Escuro. Grava data-theme no <html> ("light" | "dark"; sistema = sem atributo).
 * A escolha é a ÚNICA coisa guardada no navegador (localStorage, sempre em try/catch).
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type Tema = 'sistema' | 'claro' | 'escuro';

const CHAVE = 'medplan.tema';

export function lerTemaSalvo(): Tema {
  try {
    const v = window.localStorage.getItem(CHAVE);
    return v === 'claro' || v === 'escuro' ? v : 'sistema';
  } catch {
    return 'sistema';
  }
}

export function aplicarTema(tema: Tema): void {
  const raiz = document.documentElement;
  if (tema === 'sistema') raiz.removeAttribute('data-theme');
  else raiz.setAttribute('data-theme', tema === 'escuro' ? 'dark' : 'light');
}

function salvarTema(tema: Tema): void {
  try {
    if (tema === 'sistema') window.localStorage.removeItem(CHAVE);
    else window.localStorage.setItem(CHAVE, tema);
  } catch {
    /* sem storage (janela privada, bloqueio): o tema vale só nesta sessão */
  }
}

interface ContextoTema {
  tema: Tema;
  /** Tema efetivamente em uso (resolve "sistema" pelo prefers-color-scheme). */
  efetivo: 'claro' | 'escuro';
  definirTema: (tema: Tema) => void;
}

const TemaContext = createContext<ContextoTema | null>(null);

function sistemaEscuro(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function TemaProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(lerTemaSalvo);
  const [escuroSistema, setEscuroSistema] = useState(sistemaEscuro);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const aoMudar = () => setEscuroSistema(mq.matches);
    mq.addEventListener('change', aoMudar);
    return () => mq.removeEventListener('change', aoMudar);
  }, []);

  const definirTema = useCallback((novo: Tema) => {
    setTema(novo);
    aplicarTema(novo);
    salvarTema(novo);
  }, []);

  const efetivo = tema === 'sistema' ? (escuroSistema ? 'escuro' : 'claro') : tema;
  return <TemaContext.Provider value={{ tema, efetivo, definirTema }}>{children}</TemaContext.Provider>;
}

export function useTema(): ContextoTema {
  const ctx = useContext(TemaContext);
  if (!ctx) throw new Error('useTema precisa de <TemaProvider>.');
  return ctx;
}
