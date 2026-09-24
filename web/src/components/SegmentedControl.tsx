/**
 * <SegmentedControl> — escolha única, visual segmentado, semântica de radiogroup nativo
 * (Tab entra no grupo, setas movem e marcam, Espaço marca).
 *
 * SEM seleção padrão: `valor={null}` deixa todos desmarcados até a escolha explícita
 * (sexo, faixa etária, via, gravidade, levou à descontinuação, condições clínicas).
 *
 *   <Field id="sexo" rotulo="Sexo" obrigatorio grupo erro={erro}>
 *     {(a11y) => <SegmentedControl {...a11y} nome="sexo" opcoes={opcoes} valor={sexo} onChange={setSexo} colunas={2} />}
 *   </Field>
 */
import type { ReactNode } from 'react';
import './SegmentedControl.css';

export interface OpcaoSegmento<V extends string = string> {
  valor: V;
  rotulo: ReactNode;
  desabilitada?: boolean;
}

export interface SegmentedControlProps<V extends string = string> {
  /** `name` do grupo de rádios; único por formulário (ex. "sexo", "t2-via"). */
  nome: string;
  opcoes: OpcaoSegmento<V>[];
  valor: V | null;
  onChange: (valor: V) => void;
  /** id do contêiner (vem do Field); o primeiro rádio recebe `${id}-0`. */
  id?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
  /** Quebra em grade de N colunas (ex. 2 para sexo, 3 para faixa). Sem valor: uma linha que quebra quando falta espaço. */
  colunas?: number;
  disabled?: boolean;
  className?: string;
}

export function SegmentedControl<V extends string = string>({
  nome,
  opcoes,
  valor,
  onChange,
  id,
  colunas,
  disabled,
  className,
  ...aria
}: SegmentedControlProps<V>) {
  return (
    <div
      id={id}
      role="radiogroup"
      className={['segmentado', colunas ? 'segmentado--grade' : '', className].filter(Boolean).join(' ')}
      style={colunas ? { gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` } : undefined}
      {...aria}
    >
      {opcoes.map((o, i) => (
        <label key={o.valor} className="segmentado__opcao">
          <input
            id={id ? `${id}-${i}` : undefined}
            type="radio"
            name={nome}
            value={o.valor}
            checked={valor === o.valor}
            disabled={disabled || o.desabilitada}
            onChange={() => onChange(o.valor)}
            className="segmentado__radio"
          />
          <span className="segmentado__rotulo">{o.rotulo}</span>
        </label>
      ))}
    </div>
  );
}
