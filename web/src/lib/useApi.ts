/**
 * Carrega dados da API para uma tela: refaz a chamada quando `chave` muda, cancela a anterior
 * e mantém os dados antigos visíveis enquanto a nova chega (a linha fina de carregamento avisa).
 * Em erro, os dados antigos SAEM da tela: um resultado que não corresponde ao pedido não fica à vista.
 *
 *   const estado = useApi((signal) => obterVisaoGeral({...}, signal), JSON.stringify(filtros));
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ErroApi } from '../api/client';

export interface EstadoApi<T> {
  dados: T | null;
  carregando: boolean;
  erro: ErroApi | null;
  recarregar: () => void;
}

export function useApi<T>(carregar: ((signal: AbortSignal) => Promise<T>) | null, chave: string): EstadoApi<T> {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(carregar !== null);
  const [erro, setErro] = useState<ErroApi | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const carregarRef = useRef(carregar);
  carregarRef.current = carregar;
  const ativo = carregar !== null;

  useEffect(() => {
    const fn = carregarRef.current;
    if (!fn) return;
    const controle = new AbortController();
    setCarregando(true);
    fn(controle.signal)
      .then((resposta) => {
        setDados(resposta);
        setErro(null);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setDados(null);
        setErro(e instanceof ErroApi ? e : new ErroApi(0, [{ campo: '', mensagem: 'Falha inesperada ao carregar.' }]));
      })
      .finally(() => {
        if (!controle.signal.aborted) setCarregando(false);
      });
    return () => controle.abort();
  }, [chave, tentativa, ativo]);

  const recarregar = useCallback(() => setTentativa((t) => t + 1), []);
  return { dados, carregando, erro, recarregar };
}
