/**
 * <FaixaIC> — intervalo de uma proporção, SVG à mão. aria-hidden: o valor acessível é
 * o <Proporcao> ao lado.
 *
 * - Eixo SEMPRE 0–100 (não existe troca de escala). Floats crus da API na geometria.
 * - Camadas: trilho arredondado · marca discreta em 50% · barra do IC · ponto da estimativa
 *   (diâmetro cresce com sqrt(n / nMax)) · traço do limite inferior (azul quando
 *   `destacarLimiteInferior`, que é o critério de ordem; neutro nos demais).
 * - Largura: var(--size-plot) ou var(--size-plot-mini).
 *
 * Posições horizontais são frações (0..1): marcas posicionadas por CSS `left: calc(var(--x) * 100%)`.
 */
import type { CSSProperties } from 'react';
import './FaixaIC.css';

export interface FaixaICProps {
  /** Estimativa pontual crua (0..1): permanencia.taxa / proporcao. */
  taxa: number;
  icInferior: number;
  icSuperior: number;
  /** n desta linha e maior n da tabela (diâmetro do ponto proporcional a sqrt(n / nMax)). */
  n: number;
  nMaxTabela: number;
  destacarLimiteInferior?: boolean;
  tamanho?: 'tabela' | 'mini';
}

function posicao(fracao: number): CSSProperties {
  return { '--x': Math.min(1, Math.max(0, fracao)) } as CSSProperties;
}

export function ladoQuadrado(n: number, nMax: number): number {
  const razao = nMax > 0 ? Math.min(1, Math.max(0, n / nMax)) : 1;
  return Math.round(6 + 6 * Math.sqrt(razao));
}

export function FaixaIC({ taxa, icInferior, icSuperior, n, nMaxTabela, destacarLimiteInferior = false, tamanho = 'tabela' }: FaixaICProps) {
  const inf = Math.min(1, Math.max(0, icInferior));
  const sup = Math.min(1, Math.max(inf, icSuperior));
  const diametro = ladoQuadrado(n, nMaxTabela) + (tamanho === 'mini' ? 0 : 2);
  const classes = ['faixa-ic', `faixa-ic--${tamanho}`, destacarLimiteInferior ? 'faixa-ic--destaque' : ''].filter(Boolean).join(' ');

  return (
    <span className={classes} aria-hidden="true">
      <span className="faixa-ic__trilho" />
      <span className="faixa-ic__meio" />
      <span className="faixa-ic__ic" style={{ ...posicao(inf), '--w': sup - inf } as CSSProperties} />
      <span className="faixa-ic__limite" style={posicao(inf)} />
      <span className="faixa-ic__ponto" style={{ ...posicao(taxa), '--d': `${diametro}px` } as CSSProperties} />
    </span>
  );
}

/**
 * Rótulos do eixo 0–100, impressos UMA vez acima da coluna do gráfico.
 * Mesma largura de <FaixaIC tamanho>. Decorativo (aria-hidden).
 */
export function EixoFaixaIC({ tamanho = 'tabela' }: { tamanho?: 'tabela' | 'mini' }) {
  const marcas: [number, string][] = [
    [0, '0'],
    [0.5, '50'],
    [1, '100%'],
  ];
  return (
    <span className={`faixa-ic-eixo faixa-ic--${tamanho}`} aria-hidden="true">
      {marcas.map(([x, texto]) => (
        <span key={x} className="faixa-ic-eixo__rotulo" style={posicao(x)}>
          {texto}
        </span>
      ))}
    </span>
  );
}
