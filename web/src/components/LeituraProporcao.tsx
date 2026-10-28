/**
 * <LeituraProporcao> — uma proporção dos painéis (stats.proporcao) pronta para a tela:
 * percentual + n + IC no <Proporcao> e, ao lado, o gráfico de intervalo. Abaixo do n mínimo,
 * a pílula com textura "dados insuficientes (n=...)", sem gráfico e sem percentual.
 *
 *   <LeituraProporcao p={ficha.permanencia} nMinimo={ficha.n_minimo} />
 */
import type { ProporcaoPainel } from '../api/types';
import { FaixaIC } from './FaixaIC';
import { Hachura } from './Hachura';
import { Proporcao } from './Proporcao';
import './LeituraProporcao.css';

export interface LeituraProporcaoProps {
  p: ProporcaoPainel;
  nMinimo: number;
  tamanho?: 'linha' | 'destaque';
  /** Sem gráfico em células estreitas. */
  grafico?: 'tabela' | 'mini' | 'nenhum';
  /** Maior denominador do grupo de leituras (o ponto cresce com √n). */
  nMax?: number;
}

export function LeituraProporcao({ p, nMinimo, tamanho = 'linha', grafico = 'mini', nMax }: LeituraProporcaoProps) {
  if (!p.suficiente) {
    return (
      <Hachura>
        <Proporcao pct={null} n={p.n_base} icInfPct={null} icSupPct={null} nMinimo={nMinimo} tamanho={tamanho} />
      </Hachura>
    );
  }
  return (
    <span className="leitura-proporcao">
      <Proporcao pct={p.pct} n={p.n_base} icInfPct={p.ic_inferior_pct} icSupPct={p.ic_superior_pct} nMinimo={nMinimo} tamanho={tamanho} />
      {grafico !== 'nenhum' && (
        <FaixaIC taxa={p.taxa} icInferior={p.ic_inferior} icSuperior={p.ic_superior} n={p.n_base} nMaxTabela={nMax ?? p.n_base} tamanho={grafico} />
      )}
    </span>
  );
}
