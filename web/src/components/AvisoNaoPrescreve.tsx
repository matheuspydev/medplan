/**
 * <AvisoNaoPrescreve> — o sistema nunca prescreve. NUNCA dispensável: sem fechar, recolher ou storage.
 *
 * variante:
 * - 'completo' (padrão) e 'compacto': uma linha com ícone.
 * - 'curto': texto mínimo sob o botão Analisar.
 */
import { Info } from 'lucide-react';
import './AvisoNaoPrescreve.css';

export interface AvisoNaoPrescreveProps {
  variante?: 'completo' | 'compacto' | 'curto';
  className?: string;
}

export function AvisoNaoPrescreve({ variante = 'completo', className }: AvisoNaoPrescreveProps) {
  const classes = ['aviso-nao-prescreve', `aviso-nao-prescreve--${variante}`, className].filter(Boolean).join(' ');

  if (variante === 'curto') {
    return (
      <p className={classes} role="note">
        Apoio à decisão. Não é prescrição.
      </p>
    );
  }

  return (
    <div className={classes} role="note">
      <Info size={16} aria-hidden="true" className="aviso-nao-prescreve__icone" />
      <p>Apoio à decisão. Não é prescrição.</p>
    </div>
  );
}
