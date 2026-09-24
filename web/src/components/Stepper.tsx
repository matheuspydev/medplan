/**
 * <Stepper> — inteiro com [−][valor][+], limitado a [min, max] (ex.: n mínimo 5–100).
 * O campo aceita digitação; o valor é confirmado (e limitado à faixa) no blur ou Enter.
 * Setas ↑/↓ no campo somam/subtraem `passo`.
 */
import { Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import './Field.css';
import './Stepper.css';

export interface StepperProps {
  id: string;
  valor: number;
  min: number;
  max: number;
  passo?: number;
  onChange: (valor: number) => void;
  /** Nome curto para os botões: "Diminuir n mínimo" / "Aumentar n mínimo". */
  rotuloAcessivel: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
  disabled?: boolean;
  className?: string;
}

function limitar(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function Stepper({ id, valor, min, max, passo = 1, onChange, rotuloAcessivel, disabled, className, ...aria }: StepperProps) {
  const [texto, setTexto] = useState(String(valor));
  useEffect(() => setTexto(String(valor)), [valor]);

  function confirmar() {
    const lido = /^\d+$/.test(texto.trim()) ? Number(texto.trim()) : valor;
    const final = limitar(lido, min, max);
    setTexto(String(final));
    if (final !== valor) onChange(final);
  }

  return (
    <span className={['stepper', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className="stepper__botao"
        aria-label={`Diminuir ${rotuloAcessivel}`}
        aria-controls={id}
        disabled={disabled || valor <= min}
        onClick={() => onChange(limitar(valor - passo, min, max))}
      >
        <Minus size={14} aria-hidden="true" />
      </button>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        role="spinbutton"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={valor}
        autoComplete="off"
        className="controle-texto stepper__input"
        value={texto}
        disabled={disabled}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            confirmar();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            onChange(limitar(valor + passo, min, max));
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            onChange(limitar(valor - passo, min, max));
          }
        }}
        {...aria}
      />
      <button
        type="button"
        className="stepper__botao"
        aria-label={`Aumentar ${rotuloAcessivel}`}
        aria-controls={id}
        disabled={disabled || valor >= max}
        onClick={() => onChange(limitar(valor + passo, min, max))}
      >
        <Plus size={14} aria-hidden="true" />
      </button>
    </span>
  );
}
