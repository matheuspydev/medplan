/**
 * <FaixaSintetico> — faixa fina fixa no topo, em todas as rotas. NUNCA dispensável.
 *
 * Só desaparece quando o SERVIDOR declara ambiente.dados_sinteticos === false.
 * Enquanto os catálogos carregam ou se a API falhar, a faixa continua visível.
 * Ao sumir, zera --shell-faixa via atributo no <html> (os deslocamentos sticky acompanham).
 */
import { useEffect } from 'react';
import { useReferencias } from '../api/referencias';
import './FaixaSintetico.css';

export function FaixaSintetico() {
  const estado = useReferencias();
  const dadosReais = estado.status === 'pronto' && estado.catalogo.referencias.ambiente.dados_sinteticos === false;

  useEffect(() => {
    document.documentElement.toggleAttribute('data-sem-faixa-sintetica', dadosReais);
  }, [dadosReais]);

  if (dadosReais) return null;

  return (
    <div className="faixa-sintetico" role="note" aria-label="Dados sintéticos">
      <span className="faixa-sintetico__ponto" aria-hidden="true" />
      <span className="faixa-sintetico__frase">Dados sintéticos — protótipo de validação</span>
    </div>
  );
}
