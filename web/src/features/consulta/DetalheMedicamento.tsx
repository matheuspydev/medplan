/**
 * Detalhe inline de um medicamento (nunca modal): contagens, descontinuação por motivo (os 4 motivos,
 * com IC) e reações adversas mais frequentes (com IC). Aqui o limite inferior não é destacado:
 * ele não ordena nada.
 */
import type { LinhaRecomendada } from '../../api/types';
import { FaixaIC } from '../../components/FaixaIC';
import { Proporcao } from '../../components/Proporcao';
import { formatarInteiro, formatarMedianaDias } from '../../lib/format';

export interface DetalheMedicamentoProps {
  linha: LinhaRecomendada;
  horizonteDias: number;
  nMinimo: number;
}

export function DetalheMedicamento({ linha, horizonteDias, nMinimo }: DetalheMedicamentoProps) {
  const p = linha.permanencia;
  const descontinuados = p.n_avaliavel - p.n_retidos;
  const nMaxMotivos = Math.max(0, ...linha.descontinuacao_por_motivo.map((m) => m.n_base));
  const nMaxReacoes = Math.max(0, ...linha.reacoes.map((r) => r.n_base));

  return (
    <div className="detalhe">
      <section className="detalhe__bloco" aria-labelledby={`contas-${linha.medicamento_id}`}>
        <h3 id={`contas-${linha.medicamento_id}`} className="detalhe__titulo">
          {formatarInteiro(linha.n_episodios)} tratamentos na coorte
        </h3>
        <div className="contabilidade" aria-hidden="true">
          <span className="contabilidade__seg contabilidade__seg--retidos" style={{ flexGrow: p.n_retidos }} />
          <span className="contabilidade__seg contabilidade__seg--descontinuados" style={{ flexGrow: descontinuados }} />
          <span className="contabilidade__seg contabilidade__seg--censurados" style={{ flexGrow: p.n_censurado }} />
        </div>
        <ul className="contabilidade__numeros">
          <li>
            <span className="contabilidade__valor">
              <span className="contabilidade__amostra contabilidade__seg--retidos" aria-hidden="true" />
              {formatarInteiro(p.n_retidos)}
            </span>
            <span className="contabilidade__rotulo">{p.n_retidos === 1 ? 'retido' : 'retidos'} até {horizonteDias} d</span>
          </li>
          <li>
            <span className="contabilidade__valor">
              <span className="contabilidade__amostra contabilidade__seg--descontinuados" aria-hidden="true" />
              {formatarInteiro(descontinuados)}
            </span>
            <span className="contabilidade__rotulo">{descontinuados === 1 ? 'descontinuado' : 'descontinuados'}</span>
          </li>
          <li>
            <span className="contabilidade__valor">
              <span className="contabilidade__amostra contabilidade__seg--censurados" aria-hidden="true" />
              {formatarInteiro(p.n_censurado)}
            </span>
            <span className="contabilidade__rotulo">{p.n_censurado === 1 ? 'censurado' : 'censurados'} (fora do n)</span>
          </li>
        </ul>
      </section>

      <section className="detalhe__bloco" aria-labelledby={`motivos-${linha.medicamento_id}`}>
        <h3 id={`motivos-${linha.medicamento_id}`} className="detalhe__titulo">
          Motivos de descontinuação
        </h3>
        <ul className="detalhe__lista">
          {linha.descontinuacao_por_motivo.map((m) => (
            <li key={m.motivo} className="detalhe__linha">
              <span className="detalhe__nome">{m.rotulo}</span>
              <Proporcao pct={m.pct} n={m.n_base} icInfPct={m.ic_inferior_pct} icSupPct={m.ic_superior_pct} nMinimo={nMinimo} tamanho="linha" />
              <FaixaIC taxa={m.taxa} icInferior={m.ic_inferior} icSuperior={m.ic_superior} n={m.n_base} nMaxTabela={nMaxMotivos} tamanho="mini" />
            </li>
          ))}
        </ul>
      </section>

      <section className="detalhe__bloco detalhe__bloco--largo" aria-labelledby={`reacoes-${linha.medicamento_id}`}>
        <h3 id={`reacoes-${linha.medicamento_id}`} className="detalhe__titulo">
          Reações adversas mais frequentes
        </h3>
        {linha.reacoes.length === 0 ? (
          <p className="detalhe__vazio">Nenhuma reação adversa registrada nesta coorte.</p>
        ) : (
          <ul className="detalhe__lista">
            {linha.reacoes.map((r) => (
              <li key={r.termo} className="detalhe__linha detalhe__linha--reacao">
                <span className="detalhe__nome">
                  {r.termo}
                  <span className="detalhe__sub">{r.soc}</span>
                </span>
                <Proporcao pct={r.pct} n={r.n_base} icInfPct={r.ic_inferior_pct} icSupPct={r.ic_superior_pct} nMinimo={nMinimo} tamanho="linha" />
                <FaixaIC taxa={r.proporcao} icInferior={r.ic_inferior} icSuperior={r.ic_superior} n={r.n_base} nMaxTabela={nMaxReacoes} tamanho="mini" />
                <span className="detalhe__sub detalhe__extra">
                  {r.mediana_dias_ate_inicio === null ? 'início sem registro' : `início ${formatarMedianaDias(r.mediana_dias_ate_inicio)}`} ·{' '}
                  {formatarInteiro(r.n_levou_descontinuacao)} de {formatarInteiro(r.n)} levaram a parar
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="detalhe__rodape">Termos provisórios (código MedDRA pendente).</p>
      </section>
    </div>
  );
}
