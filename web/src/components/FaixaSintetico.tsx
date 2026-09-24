/**
 * <FaixaSintetico> — faixa fina fixa no topo, em todas as rotas. NUNCA dispensável.
 *
 * Só desaparece quando o SERVIDOR declara ambiente.dados_sinteticos === false.
 * Enquanto os catálogos carregam ou se a API falhar, a faixa continua visível.
 * Ao sumir, zera --shell-faixa via atributo no <html> (os deslocamentos sticky acompanham).
 */
import { FlaskConical } from 'lucide-react';
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
      <FlaskConical size={13} aria-hidden="true" />
      <span className="faixa-sintetico__frase faixa-sintetico__frase--longa">
        <strong>Dados sintéticos.</strong> Nenhum número descreve pacientes ou medicamentos reais.
      </span>
      <span className="faixa-sintetico__frase faixa-sintetico__frase--curta">
        <strong>Dados sintéticos</strong>, não reais
      </span>
    </div>
  );
}
