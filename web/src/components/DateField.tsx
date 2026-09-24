/**
 * <DateField> — data com <input type="date"> nativo (o navegador pt-BR exibe dd/mm/aaaa,
 * oferece calendário acessível e entrega ISO aaaa-mm-dd). `max` padrão = hoje.
 *
 * O `max` nativo não impede digitar data futura: a tela valida com `validarData` (formato no
 * blur, obrigatórios no submit). Data incompleta digitada chega como `incompleta: true` no onBlur.
 */
import { hojeIso, formatarData } from '../lib/format';
import './Field.css';
import './DateField.css';

export interface DateFieldProps {
  id: string;
  /** ISO aaaa-mm-dd ou null. */
  valor: string | null;
  onChange: (iso: string | null) => void;
  /** ISO; ex.: data de início do tratamento para data fim. */
  min?: string;
  /** ISO; padrão hoje (nenhuma data no futuro). */
  max?: string;
  /** Recebe `incompleta` = havia texto digitado que não forma data válida. */
  onBlur?: (estado: { iso: string | null; incompleta: boolean }) => void;
  disabled?: boolean;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
  className?: string;
}

export function DateField({ id, valor, onChange, min, max, onBlur, disabled, className, ...aria }: DateFieldProps) {
  return (
    <input
      id={id}
      type="date"
      className={['controle-texto', 'campo-data', className].filter(Boolean).join(' ')}
      value={valor ?? ''}
      min={min}
      max={max ?? hojeIso()}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
      onBlur={(e) => onBlur?.({ iso: e.target.value || null, incompleta: e.target.validity.badInput })}
      {...aria}
    />
  );
}

export interface LimitesData {
  /** ISO mínimo aceito e o rótulo do campo de referência, ex. {iso: inicio, rotulo: 'data de início'}. */
  min?: { iso: string; rotulo: string };
  /** ISO máximo; padrão hoje. */
  max?: string;
}

/**
 * Mensagem de erro de formato/ordem (ou null). Obrigatoriedade é checada à parte, no submit.
 * Ex.: "A data de fim é anterior à data de início (03/02/2025)."
 */
export function validarData(
  estado: { iso: string | null; incompleta?: boolean },
  nomeCampo: string,
  limites: LimitesData = {},
): string | null {
  if (estado.incompleta) return `Complete a ${nomeCampo} no formato dd/mm/aaaa.`;
  if (!estado.iso) return null;
  const max = limites.max ?? hojeIso();
  if (estado.iso > max) return `A ${nomeCampo} está no futuro; use uma data até ${formatarData(max)}.`;
  if (limites.min && estado.iso < limites.min.iso) {
    return `A ${nomeCampo} é anterior à ${limites.min.rotulo} (${formatarData(limites.min.iso)}).`;
  }
  return null;
}
