/**
 * <AvisoNaoPrescreve> — o sistema nunca prescreve. NUNCA dispensável: sem fechar, recolher ou storage.
 *
 * variante:
 * - 'completo' (padrão) e 'compacto': uma linha com ícone.
 * - 'curto': texto mínimo sob o botão Analisar.
 */
import { Stethoscope } from 'lucide-react';
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
        Apoio à decisão, não prescrição.
      </p>
    );
  }

  return (
    <div className={classes} role="note">
      <Stethoscope size={14} aria-hidden="true" className="aviso-nao-prescreve__icone" />
      <p>
        <strong className="aviso-nao-prescreve__rotulo">Apoio à decisão — não é prescrição.</strong> A decisão é do médico.
      </p>
    </div>
  );
}
