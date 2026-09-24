/**
 * Provedor da Metodologia: guarda o estado do drawer, registra Alt+M e rola até a âncora pedida.
 * Na rota /metodologia não abre drawer: rola a própria página.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRota } from '../../app/rotas';
import { Drawer } from '../../components/Drawer';
import { useAtalhos } from '../../lib/atalhos';
import { ConteudoMetodologia } from './ConteudoMetodologia';
import { irParaAncora, MetodologiaContext, type AncoraMetodologia } from './contexto';

export function MetodologiaProvider({ children }: { children: ReactNode }) {
  const rota = useRota();
  const [aberto, setAberto] = useState(false);
  const [ancora, setAncora] = useState<AncoraMetodologia | undefined>();

  const abrir = useCallback(
    (alvo?: AncoraMetodologia) => {
      if (rota === '/metodologia') {
        if (alvo) irParaAncora(alvo);
        return;
      }
      setAncora(alvo);
      setAberto(true);
    },
    [rota],
  );

  // Rola até a âncora depois que o drawer abriu (ou quando outra âncora é pedida com ele aberto).
  // Sem âncora não há o que rolar: o corpo do drawer é montado de novo a cada abertura, já no topo.
  useEffect(() => {
    if (aberto && ancora) irParaAncora(ancora);
  }, [aberto, ancora]);

  // Trocar de rota fecha o drawer.
  useEffect(() => setAberto(false), [rota]);

  useAtalhos([{ codigo: 'KeyM', alt: true, acao: () => abrir() }]);

  const valor = useMemo(() => ({ abrir }), [abrir]);

  return (
    <MetodologiaContext.Provider value={valor}>
      {children}
      <Drawer aberto={aberto} onFechar={() => setAberto(false)} titulo="Metodologia">
        <ConteudoMetodologia contexto="drawer" />
      </Drawer>
    </MetodologiaContext.Provider>
  );
}
