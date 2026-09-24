/**
 * Campo de formulário: rótulo (micro, caixa-alta), marca de obrigatório, ajuda e erro.
 * O controle é passado como render-prop e recebe os atributos de acessibilidade prontos:
 *
 *   <Field id="sexo" rotulo="Sexo" obrigatorio grupo erro={erroSexo}>
 *     {(a11y) => <SegmentedControl {...a11y} nome="sexo" ... />}
 *   </Field>
 *
 * `grupo` = o controle é um grupo (radiogroup etc.): o rótulo vira <span> e o controle
 * recebe aria-labelledby. Sem `grupo`, o rótulo é <label htmlFor={id}>.
 */
import { CircleX } from 'lucide-react';
import type { ReactNode } from 'react';
import './Field.css';

export interface CampoA11y {
  id: string;
  'aria-labelledby': string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
}

export interface FieldProps {
  id: string;
  rotulo: ReactNode;
  obrigatorio?: boolean;
  /** Texto de ajuda (12px, terciário) abaixo do controle. */
  ajuda?: ReactNode;
  /** Mensagem de erro; presente = campo inválido (borda 2px error + CircleX + texto). */
  erro?: string | null;
  /** Conteúdo à direita do rótulo (ex. contador "1 psiq · 0 clín", "(sem padrão)"). */
  complemento?: ReactNode;
  grupo?: boolean;
  className?: string;
  children: (a11y: CampoA11y) => ReactNode;
}

export function Field({ id, rotulo, obrigatorio, ajuda, erro, complemento, grupo, className, children }: FieldProps) {
  const idRotulo = `${id}-rotulo`;
  const idAjuda = ajuda ? `${id}-ajuda` : undefined;
  const idErro = erro ? `${id}-erro` : undefined;
  const descritores = [idErro, idAjuda].filter(Boolean).join(' ') || undefined;

  const conteudoRotulo = (
    <>
      {rotulo}
      {obrigatorio && (
        <span className="campo__obrigatorio" aria-hidden="true">
          {' *'}
        </span>
      )}
    </>
  );

  return (
    <div className={['campo', erro ? 'campo--erro' : '', className].filter(Boolean).join(' ')}>
      <div className="campo__cabecalho">
        {grupo ? (
          <span id={idRotulo} className="campo__rotulo micro">
            {conteudoRotulo}
          </span>
        ) : (
          <label id={idRotulo} htmlFor={id} className="campo__rotulo micro">
            {conteudoRotulo}
          </label>
        )}
        {complemento && <span className="campo__complemento caption">{complemento}</span>}
      </div>
      {children({
        id,
        'aria-labelledby': idRotulo,
        'aria-describedby': descritores,
        'aria-invalid': erro ? true : undefined,
        'aria-required': obrigatorio ? true : undefined,
      })}
      {erro && (
        <p id={idErro} className="campo__erro">
          <CircleX size={14} aria-hidden="true" />
          <span>{erro}</span>
        </p>
      )}
      {ajuda && (
        <p id={idAjuda} className="campo__ajuda caption">
          {ajuda}
        </p>
      )}
    </div>
  );
}
