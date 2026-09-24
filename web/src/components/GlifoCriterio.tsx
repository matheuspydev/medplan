/**
 * <GlifoCriterio> — glifo SVG de 8px da matriz critério × nível (a fonte não tem ● nem ⊘).
 * mantido = disco text-primary; ignorado = anel 1.5px com diagonal, text-tertiary
 * (ou --color-deviation quando `desvio`, na coluna onde o motor parou).
 * Sempre com texto acessível: "<criterio>: <estado>" vira <title> e texto visualmente oculto ("sexo: ignorado").
 */
import './GlifoCriterio.css';
export interface GlifoCriterioProps {
  criterio: string;
  estado: 'mantido' | 'ignorado';
  desvio?: boolean;
}

export function GlifoCriterio({ criterio, estado, desvio = false }: GlifoCriterioProps) {
  const rotulo = `${criterio}: ${estado}`;
  const classe = estado === 'mantido' ? 'glifo-criterio--mantido' : desvio ? 'glifo-criterio--desvio' : 'glifo-criterio--ignorado';
  return (
    <span className={`glifo-criterio ${classe}`}>
      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" focusable="false">
        <title>{rotulo}</title>
        {estado === 'mantido' ? (
          <circle cx="4" cy="4" r="4" fill="currentColor" />
        ) : (
          <g fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="4" cy="4" r="3.25" />
            <path d="M1.7 6.3 6.3 1.7" />
          </g>
        )}
      </svg>
      <span className="sr-only">{rotulo}</span>
    </span>
  );
}
