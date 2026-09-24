/**
 * <NumberField> — número digitado (pt-BR: vírgula OU ponto como separador decimal).
 * Sem placeholder, sem faixa "plausível" embutida (dose não tem mínimo/máximo clínico aqui).
 *
 * `decimais`: 0 = inteiro (horizonte, dias até início, linha de tratamento); 2 = dose (NUMERIC 8,2).
 * onChange(valor, valido): valor = número lido ou null (vazio ou inválido); valido = false quando
 * há texto que não é número com até `decimais` casas. Faixas (min/max) são validadas pela tela.
 */
import { useEffect, useState, type ReactNode } from 'react';
import './Field.css';
import './NumberField.css';

export interface NumberFieldProps {
  id: string;
  valor: number | null;
  onChange: (valor: number | null, valido: boolean) => void;
  decimais?: number;
  /** Unidade exibida à direita ("dias"). Para dose, a tela usa um seletor de unidade ao lado. */
  unidade?: ReactNode;
  disabled?: boolean;
  onBlur?: () => void;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
  className?: string;
}

/** "12,5" -> 12.5; "" -> null; texto inválido -> undefined. */
export function lerNumero(texto: string, decimais: number): number | null | undefined {
  const t = texto.trim();
  if (!t) return null;
  const padrao = decimais > 0 ? new RegExp(`^\\d+([.,]\\d{1,${decimais}})?$`) : /^\d+$/;
  if (!padrao.test(t)) return undefined;
  return Number(t.replace(',', '.'));
}

function paraTexto(valor: number | null): string {
  return valor === null ? '' : String(valor).replace('.', ',');
}

export function NumberField({ id, valor, onChange, decimais = 0, unidade, disabled, onBlur, className, ...aria }: NumberFieldProps) {
  const [texto, setTexto] = useState(paraTexto(valor));

  // Sincroniza quando o valor muda por fora (preset, limpar), sem atropelar a digitação em curso.
  useEffect(() => {
    setTexto((atual) => {
      const lido = lerNumero(atual, decimais);
      // texto inválido espelhado como null pela tela: mantém o que a pessoa digitou
      if (lido === valor || (lido === undefined && valor === null)) return atual;
      return paraTexto(valor);
    });
  }, [valor, decimais]);

  return (
    <span className={['campo-numero', className].filter(Boolean).join(' ')}>
      <input
        id={id}
        type="text"
        inputMode={decimais > 0 ? 'decimal' : 'numeric'}
        autoComplete="off"
        spellCheck={false}
        className="controle-texto campo-numero__input"
        value={texto}
        disabled={disabled}
        onChange={(e) => {
          setTexto(e.target.value);
          const lido = lerNumero(e.target.value, decimais);
          onChange(lido ?? null, lido !== undefined);
        }}
        onBlur={onBlur}
        {...aria}
      />
      {unidade && <span className="campo-numero__unidade">{unidade}</span>}
    </span>
  );
}
