/**
 * <CurvaPermanencia> — curva de Kaplan-Meier (proporção ainda em uso ao longo do tempo), SVG à mão.
 * Os pontos vêm prontos da API (stats.kaplan_meier); aqui só se desenha.
 *
 * - Uma série: linha em degraus, faixa do IC95% e traços de censura.
 * - Várias séries (Comparar): o valor de cada semana ligado por curva suave monotônica (nunca
 *   sobe entre duas semanas, como a curva real; os degraus diários viram ruído quando as curvas
 *   se cruzam) e o nome no fim da linha. Sem percentual escrito: os valores com n e IC ficam
 *   na tabela da tela.
 * - Eixo y fixo 0–100; eixo x em semanas; linha tracejada no horizonte da análise.
 */
import type { PontoCurva } from '../api/types';
import './CurvaPermanencia.css';

export interface SerieCurva {
  nome: string;
  pontos: PontoCurva[];
  diasCensura?: number[];
  /** Cor da série (ex.: 'var(--color-serie-2)'); sem cor, a tinta padrão dos dados. */
  cor?: string;
}

const L = 640;
const A = 280;
const ESQ = 48;
const DIR = 628;
/** Várias séries: espaço à direita para o nome no fim de cada linha. */
const DIR_SERIES = 516;
const ESPACO_NOMES = 14;
const TOPO = 20;
const BASE = 240;
const SEMANAS = [0, 4, 8, 12, 16, 20, 26];

/** Coordenada com uma casa (só geometria do SVG). */
const c = (v: number) => Math.round(v * 10) / 10;

export function CurvaPermanencia({ series, ateDias, horizonteDias, rotulo }: { series: SerieCurva[]; ateDias: number; horizonteDias: number; rotulo: string }) {
  const unica = series.length === 1 ? series[0] : null;
  const dir = unica ? DIR : DIR_SERIES;
  const x = (dia: number) => ESQ + (Math.min(dia, ateDias) / ateDias) * (dir - ESQ);
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

  const valorEm = (pontos: PontoCurva[], dia: number) => [...pontos].reverse().find((p) => p.dia <= dia)?.sobrevida ?? 1;

  /**
   * O valor da curva no fim de cada semana (e no último dia), ligado por cúbica monotônica
   * (Fritsch-Carlson): a linha não passa acima nem abaixo dos valores semanais.
   */
  function semanal(pontos: PontoCurva[]): string {
    const dias = Array.from({ length: Math.floor(ateDias / 7) + 1 }, (_, s) => s * 7);
    if (dias[dias.length - 1] < ateDias) dias.push(ateDias);
    const px = dias.map(x);
    const py = dias.map((dia) => y(valorEm(pontos, dia)));
    const n = px.length;
    const inclinacao = px.slice(1).map((_, i) => (py[i + 1] - py[i]) / (px[i + 1] - px[i]));
    const t = px.map((_, i) => {
      if (i === 0) return inclinacao[0];
      if (i === n - 1) return inclinacao[n - 2];
      const a = inclinacao[i - 1];
      const b = inclinacao[i];
      return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
    });
    let d = `M${c(px[0])} ${c(py[0])}`;
    for (let i = 0; i < n - 1; i++) {
      const h = (px[i + 1] - px[i]) / 3;
      d += ` C${c(px[i] + h)} ${c(py[i] + t[i] * h)} ${c(px[i + 1] - h)} ${c(py[i + 1] - t[i + 1] * h)} ${c(px[i + 1])} ${c(py[i + 1])}`;
    }
    return d;
  }

  // nomes no fim das linhas, de cima para baixo, afastados para não se sobreporem
  const nomes = series
    .map((s) => ({ s, y: y(valorEm(s.pontos, ateDias)) }))
    .sort((a, b) => a.y - b.y);
  nomes.forEach((n, i) => {
    if (i > 0) n.y = Math.max(n.y, nomes[i - 1].y + ESPACO_NOMES);
  });

  return (
    <figure className="curva-permanencia">
      <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label={rotulo}>
        <g className="curva-permanencia__grade">
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <line key={v} x1={ESQ} y1={y(v)} x2={dir} y2={y(v)} />
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
          <text x={(ESQ + dir) / 2} y={A - 2}>
            semanas desde o início
          </text>
        </g>
        <line className="curva-permanencia__horizonte" x1={x(horizonteDias)} y1={TOPO} x2={x(horizonteDias)} y2={BASE} />
        <text className="curva-permanencia__rotulos" x={x(horizonteDias) + 6} y={TOPO + 14}>
          horizonte
        </text>
        {unica && <path className="curva-permanencia__banda" d={faixa(unica.pontos)} />}
        {unica && <path className="curva-permanencia__linha" d={degraus(unica.pontos, (p) => p.sobrevida)} />}
        {!unica && (
          <>
            {series.map((s) => (
              <path key={s.nome} className="curva-permanencia__linha" d={semanal(s.pontos)} style={{ stroke: s.cor }} />
            ))}
            {nomes.map(({ s, y: yNome }) => (
              <text key={s.nome} className="curva-permanencia__nome" x={dir + 10} y={c(yNome + 4)} style={{ fill: s.cor }}>
                {s.nome}
              </text>
            ))}
          </>
        )}
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
export function AmostraTraco({ cor }: { cor?: string }) {
  return (
    <svg className="amostra-traco" width="22" height="8" aria-hidden="true">
      <line x1="2" y1="4" x2="20" y2="4" style={cor ? { stroke: cor } : undefined} />
    </svg>
  );
}
