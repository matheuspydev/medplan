/**
 * <MapaCalor> — tabela de contagens com cor sequencial neutra (nunca bom/ruim).
 * Cada célula mostra a contagem; a cor vem de `intensidade` (0..1), que quem chama define
 * (ex.: fatia da linha, ou contagem / maior contagem). Células clicáveis abrem o detalhe com IC.
 * Semântica de tabela: leitor de tela lê linha, coluna e valor.
 */
import type { ReactNode } from 'react';
import { formatarInteiro } from '../lib/format';
import './MapaCalor.css';

export interface CelulaMapa {
  valor: number;
  /** 0..1 */
  intensidade: number;
  selecionada?: boolean;
  onSelecionar?: () => void;
  rotuloAcessivel?: string;
}

export interface MapaCalorProps {
  legenda: string;
  rotuloCanto?: ReactNode;
  colunas: ReactNode[];
  linhas: { rotulo: ReactNode; celulas: CelulaMapa[]; total?: number }[];
  rotuloTotal?: string;
  legendaEscala: [string, string];
}

function nivel(intensidade: number): number {
  return Math.max(0, Math.min(5, Math.round(intensidade * 5)));
}

export function MapaCalor({ legenda, rotuloCanto, colunas, linhas, rotuloTotal, legendaEscala }: MapaCalorProps) {
  return (
    <div className="mapa-calor">
      <div className="mapa-calor__rolagem">
        <table className="mapa-calor__tabela">
          <caption className="sr-only">{legenda}</caption>
          <thead>
            <tr>
              <th scope="col">{rotuloCanto}</th>
              {colunas.map((c, i) => (
                <th key={i} scope="col">
                  {c}
                </th>
              ))}
              {rotuloTotal && <th scope="col">{rotuloTotal}</th>}
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha, i) => (
              <tr key={i}>
                <th scope="row">{linha.rotulo}</th>
                {linha.celulas.map((c, j) => (
                  <td key={j}>
                    {c.onSelecionar ? (
                      <button
                        type="button"
                        className={`mapa-calor__celula mapa-calor__celula--${nivel(c.intensidade)}`}
                        aria-pressed={Boolean(c.selecionada)}
                        aria-label={c.rotuloAcessivel}
                        onClick={c.onSelecionar}
                      >
                        {formatarInteiro(c.valor)}
                      </button>
                    ) : (
                      <span className={`mapa-calor__celula mapa-calor__celula--${nivel(c.intensidade)}`}>{formatarInteiro(c.valor)}</span>
                    )}
                  </td>
                ))}
                {rotuloTotal && <td className="mapa-calor__total num">{formatarInteiro(linha.total ?? 0)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mapa-calor__escala" aria-hidden="true">
        <span>{legendaEscala[0]}</span>
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={`mapa-calor__amostra mapa-calor__celula--${n}`} />
        ))}
        <span>{legendaEscala[1]}</span>
      </p>
    </div>
  );
}
