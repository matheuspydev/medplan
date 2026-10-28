/**
 * <CurvaPermanencia> — curva de Kaplan-Meier (proporção ainda em uso ao longo do tempo), SVG à mão.
 * Os pontos vêm prontos da API (stats.kaplan_meier); aqui só se desenha.
 *
 * - Uma série: linha em degraus, faixa do IC95% e traços de censura.
 * - Várias séries (Comparar): só as linhas, cada uma com sua cor e seu traço (o traço garante a
 *   leitura sem depender de cor).
 * - Eixo y fixo 0–100; eixo x em semanas; linha tracejada no horizonte da análise.
 */
import type { PontoCurva } from '../api/types';
import './CurvaPermanencia.css';

export interface SerieCurva {
  nome: string;
  pontos: PontoCurva[];
  diasCensura?: number[];
  /** stroke-dasharray: '' contínuo, '7 5' tracejado, '2 4' pontilhado. */
  traco?: string;
  /** Cor da série (ex.: 'var(--color-serie-2)'); sem cor, a tinta padrão dos dados. */
  cor?: string;
}

const L = 640;
const A = 280;
const ESQ = 48;
const DIR = 628;
const TOPO = 20;
const BASE = 240;
const SEMANAS = [0, 4, 8, 12, 16, 20, 26];

/** Coordenada com uma casa (só geometria do SVG). */
const c = (v: number) => Math.round(v * 10) / 10;

export function CurvaPermanencia({ series, ateDias, horizonteDias, rotulo }: { series: SerieCurva[]; ateDias: number; horizonteDias: number; rotulo: string }) {
  const x = (dia: number) => ESQ + (Math.min(dia, ateDias) / ateDias) * (DIR - ESQ);
  const y = (v: number) => TOPO + (1 - v) * (BASE - TOPO);

  function degraus(pontos: PontoCurva[], valor: (p: PontoCurva) => number): string {
    let d = `M${x(0)} ${y(valor(pontos[0]))}`;
    for (const p of pontos.slice(1)) d += ` H${c(x(p.dia))} V${c(y(valor(p)))}`;
    return `${d} H${x(ateDias)}`;
  }

  /** Faixa do IC em degraus: limite superior para a frente, inferior de volta. */
  function faixa(pontos: PontoCurva[]): string {
    let d = `${degraus(pontos, (p) => p.ic_superior)} V${c(y(pontos[pontos.length - 1].ic_inferior))}`;
    for (let i = pontos.length - 1; i > 0; i--) d += ` H${c(x(pontos[i].dia))} V${c(y(pontos[i - 1].ic_inferior))}`;
    return `${d} H${x(0)} Z`;
  }

  const unica = series.length === 1 ? series[0] : null;
  const valorEm = (pontos: PontoCurva[], dia: number) => [...pontos].reverse().find((p) => p.dia <= dia)?.sobrevida ?? 1;

  return (
    <figure className="curva-permanencia">
      <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label={rotulo}>
        <g className="curva-permanencia__grade">
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <line key={v} x1={ESQ} y1={y(v)} x2={DIR} y2={y(v)} />
          ))}
        </g>
        <g className="curva-permanencia__rotulos" textAnchor="end">
          <text x={ESQ - 8} y={y(1) + 4}>100%</text>
          <text x={ESQ - 8} y={y(0.75) + 4}>75%</text>
          <text x={ESQ - 8} y={y(0.5) + 4}>50%</text>
          <text x={ESQ - 8} y={y(0.25) + 4}>25%</text>
          <text x={ESQ - 8} y={y(0) + 4}>0%</text>
        </g>
        <g className="curva-permanencia__rotulos" textAnchor="middle">
          {SEMANAS.filter((s) => s * 7 <= ateDias).map((s) => (
            <text key={s} x={x(s * 7)} y={BASE + 22}>
              {s}
            </text>
          ))}
          <text x={(ESQ + DIR) / 2} y={A - 2}>
            semanas desde o início
          </text>
        </g>
        <line className="curva-permanencia__horizonte" x1={x(horizonteDias)} y1={TOPO} x2={x(horizonteDias)} y2={BASE} />
        <text className="curva-permanencia__rotulos" x={x(horizonteDias) + 6} y={TOPO + 14}>
          horizonte
        </text>
        {unica && <path className="curva-permanencia__banda" d={faixa(unica.pontos)} />}
        {series.map((s) => (
          <path key={s.nome} className="curva-permanencia__linha" d={degraus(s.pontos, (p) => p.sobrevida)} strokeDasharray={s.traco || undefined} style={s.cor ? { stroke: s.cor } : undefined} />
        ))}
        {unica?.diasCensura && (
          <path
            className="curva-permanencia__censura"
            d={unica.diasCensura.map((dia) => `M${c(x(dia))} ${c(y(valorEm(unica.pontos, dia)) - 5)} v10`).join(' ')}
          />
        )}
      </svg>
    </figure>
  );
}

/** Amostra do traço para legendas (Comparar). */
export function AmostraTraco({ traco, cor }: { traco?: string; cor?: string }) {
  return (
    <svg className="amostra-traco" width="22" height="8" aria-hidden="true">
      <line x1="0" y1="4" x2="22" y2="4" strokeDasharray={traco || undefined} style={cor ? { stroke: cor } : undefined} />
    </svg>
  );
}
