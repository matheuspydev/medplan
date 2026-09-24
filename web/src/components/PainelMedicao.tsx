/**
 * <PainelMedicao> — cartão de seção: superfície arredondada, título e subtítulo opcionais,
 * ações à direita do título.
 * `densidade`: 'medicao' (cartões da Consulta) ou 'formulario' (seções do Registro).
 */
import { forwardRef, useId, type ReactNode } from 'react';
import './PainelMedicao.css';

export interface PainelMedicaoProps {
  titulo: ReactNode;
  /** Uma linha curta abaixo do título. */
  subtitulo?: ReactNode;
  /** Conteúdo à direita do título (badges, legenda, ações). */
  acoes?: ReactNode;
  densidade?: 'medicao' | 'formulario';
  /** Nível do título; padrão h2. */
  nivelTitulo?: 2 | 3;
  id?: string;
  className?: string;
  children?: ReactNode;
}

export const PainelMedicao = forwardRef<HTMLElement, PainelMedicaoProps>(function PainelMedicao(
  { titulo, subtitulo, acoes, densidade = 'medicao', nivelTitulo = 2, id, className, children },
  ref,
) {
  const idTitulo = useId();
  const Titulo = nivelTitulo === 2 ? 'h2' : 'h3';
  const classes = ['painel-medicao', `painel-medicao--${densidade}`, className].filter(Boolean).join(' ');

  return (
    <section ref={ref} id={id} className={classes} aria-labelledby={idTitulo}>
      <header className="painel-medicao__cabecalho">
        <div className="painel-medicao__textos">
          <Titulo id={idTitulo} className="painel-medicao__titulo" tabIndex={-1}>
            {titulo}
          </Titulo>
          {subtitulo && <p className="painel-medicao__subtitulo">{subtitulo}</p>}
        </div>
        {acoes && <div className="painel-medicao__lateral">{acoes}</div>}
      </header>
      {children}
    </section>
  );
});
