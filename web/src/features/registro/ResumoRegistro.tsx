/**
 * Cartão lateral fixo: progresso por seção, pendências como links que focam o campo,
 * falha do servidor e "Salvar caso" (Ctrl+S).
 */
import { CircleX, ChevronRight } from 'lucide-react';
import { Button } from '../../components/Button';
import { PainelFalha } from '../../components/PainelFalha';
import { plural } from '../../lib/format';

export interface PendenciaVisivel {
  chave: string;
  texto: string;
}

export interface LinhaResumoTratamento {
  tid: number;
  rotulo: string;
  pendencias: number;
}

export interface FalhaEnvio {
  /** Mensagens que não pertencem a um campo da tela. */
  mensagens: string[];
  /** true quando o servidor apontou campos (422): já marcados no formulário. */
  camposMarcados: boolean;
}

interface Props {
  perfilPreenchidos: number;
  perfilTotal: number;
  tratamentos: LinhaResumoTratamento[];
  pendencias: PendenciaVisivel[];
  falha: FalhaEnvio | null;
  salvando: boolean;
  onIrPara: (chave: string) => void;
  onSalvar: () => void;
}

export function ResumoRegistro({ perfilPreenchidos, perfilTotal, tratamentos, pendencias, falha, salvando, onIrPara, onSalvar }: Props) {
  return (
    <aside className="resumo-registro" aria-labelledby="reg-resumo-titulo">
      <h2 id="reg-resumo-titulo" className="resumo-registro__titulo">
        Resumo
      </h2>
      <dl className="resumo-registro__secoes">
        <div className="resumo-registro__linha">
          <dt>Perfil</dt>
          <dd>
            {perfilPreenchidos} de {perfilTotal}
          </dd>
        </div>
        <div className="resumo-registro__linha">
          <dt>Tratamentos</dt>
          <dd>{tratamentos.length}</dd>
        </div>
        {tratamentos.map((t) => (
          <div key={t.tid} className="resumo-registro__linha resumo-registro__linha--tratamento">
            <dt>{t.rotulo}</dt>
            <dd>{t.pendencias ? plural(t.pendencias, 'pendência', 'pendências') : 'ok'}</dd>
          </div>
        ))}
      </dl>

      <div id="reg-pendencias" tabIndex={-1} className="resumo-registro__foco">
        {pendencias.length > 0 && (
          <div className="resumo-registro__pendencias">
            <p className="resumo-registro__pendencias-titulo">
              <CircleX size={14} aria-hidden="true" />
              {plural(pendencias.length, 'pendência', 'pendências')}
            </p>
            <ul>
              {pendencias.map((p) => (
                <li key={p.chave}>
                  <button type="button" className="resumo-registro__link" onClick={() => onIrPara(p.chave)}>
                    <span>{p.texto}</span>
                    <ChevronRight size={12} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {falha && (
          <PainelFalha titulo="Não foi possível salvar o caso. Os valores digitados foram mantidos." className="resumo-registro__falha">
            {falha.mensagens.map((m, i) => (
              <p key={i}>{m}</p>
            ))}
            {falha.camposMarcados && <p>O servidor recusou campos, marcados no formulário e listados acima.</p>}
          </PainelFalha>
        )}
      </div>

      <Button variante="primario" atalho="Ctrl+S" className="resumo-registro__salvar" onClick={onSalvar} disabled={salvando}>
        {salvando ? 'Salvando…' : 'Salvar caso'}
      </Button>
    </aside>
  );
}
