/**
 * <AvisoViesIndicacao> — nota permanente de viés de indicação. NUNCA dispensável.
 *
 * `texto` é o texto LITERAL do servidor (avisos[tipo='vies_indicacao'].texto = engine.AVISO_VIES_INDICACAO).
 * Não reescrever, resumir nem traduzir.
 */
import { Scale } from 'lucide-react';
import { useId } from 'react';
import { LinkMetodologia } from '../features/metodologia/contexto';
import './AvisoViesIndicacao.css';

export interface AvisoViesIndicacaoProps {
  texto: string;
  /** Link "Saiba mais" para a Metodologia (#vies). Desligado dentro da própria seção. */
  comLink?: boolean;
  className?: string;
}

export function AvisoViesIndicacao({ texto, comLink = true, className }: AvisoViesIndicacaoProps) {
  const idRotulo = useId();
  return (
    <div className={['aviso-vies', className].filter(Boolean).join(' ')} role="note" aria-labelledby={idRotulo}>
      <span className="aviso-vies__icone" aria-hidden="true">
        <Scale size={16} />
      </span>
      <div className="aviso-vies__corpo">
        <p id={idRotulo} className="aviso-vies__rotulo">
          Viés de indicação
        </p>
        <p className="aviso-vies__texto">{texto}</p>
      </div>
      {comLink && (
        <LinkMetodologia ancora="vies" className="aviso-vies__link">
          Saiba mais
        </LinkMetodologia>
      )}
    </div>
  );
}
