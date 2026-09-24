/** Nota de consistência NÃO bloqueante: ocre + TriangleAlert + texto. Regras pendentes de validação da médica. */
import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

export function NotaConsistencia({ children }: { children: ReactNode }) {
  return (
    <p className="nota-consistencia">
      <TriangleAlert size={14} aria-hidden="true" className="nota-consistencia__icone" />
      <span>
        <span className="sr-only">Nota, não bloqueia o registro: </span>
        {children}
      </span>
    </p>
  );
}
