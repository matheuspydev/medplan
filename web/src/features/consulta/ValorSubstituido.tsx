/**
 * "valor informado -> valor usado" de um critério da escada.
 * riscado = critério efetivamente ignorado numa leitura (line-through 1.5px ocre);
 * sem riscado = prévia (nada foi calculado ainda). A seta é lucide (a fonte não tem o glifo).
 */
import { ArrowRight } from 'lucide-react';
import { rotuloGrupoCid } from '../../api/referencias';

/** A API manda "grupo F30-F39"; a UI mostra o grupo com en dash. */
export function textoValor(criterio: string, valor: string): string {
  return criterio === 'código CID-10' ? rotuloGrupoCid(valor) : valor;
}

/** "grupo F90-F98" -> "F90–F98" (para frases). */
export function grupoDaSubstituicao(valorUsado: string): string {
  return rotuloGrupoCid(valorUsado.replace(/^grupo /, ''));
}

export interface ValorSubstituidoProps {
  criterio: string;
  informado: string | null;
  usado: string | null;
  riscado?: boolean;
}

export function ValorSubstituido({ criterio, informado, usado, riscado = false }: ValorSubstituidoProps) {
  const textoInformado = informado ?? '—';
  return (
    <span className="substituicao">
      {riscado ? <s className="substituicao__informado">{textoInformado}</s> : <span className="substituicao__informado">{textoInformado}</span>}
      <ArrowRight size={12} aria-hidden="true" className="substituicao__seta" />
      <span className="sr-only">{riscado ? ' substituído por ' : ' passa a '}</span>
      <span className="substituicao__usado">{usado ? textoValor(criterio, usado) : '—'}</span>
    </span>
  );
}
