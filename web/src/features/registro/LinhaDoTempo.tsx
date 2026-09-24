/**
 * Linha do tempo dos tratamentos (SVG à mão, aria-hidden: as linhas-resumo dos blocos carregam a informação).
 * 16px por tratamento: início -> data de fim (sólido) ou última observação (tracejado, em uso/perdido).
 * Terminação: X = descontinuado, quadrado = concluído, anel = perdido, nada = em uso. Eixo mês/ano.
 */
import { diasEntre, ehCensura, type RascunhoTratamento } from './modelo';

const LARGURA = 800;
const MARGEM_ESQ = 36;
const MARGEM_DIR = 12;
const ALTURA_LINHA = 16;
const ALTURA_EIXO = 20;
const MAX_MARCAS = 5;

function somarMeses(ano: number, mes: number, n: number): [number, number] {
  const total = ano * 12 + (mes - 1) + n;
  return [Math.floor(total / 12), (total % 12) + 1];
}

export function LinhaDoTempo({ tratamentos }: { tratamentos: RascunhoTratamento[] }) {
  const linhas = tratamentos
    .map((t, i) => ({ t, rotulo: `T${i + 1}`, fim: t.data_fim ?? t.data_ultima_observacao }))
    .filter((l) => l.t.data_inicio !== null);

  if (!linhas.length) return null;

  const datas = linhas.flatMap((l) => [l.t.data_inicio!, ...(l.fim ? [l.fim] : [])]).sort();
  const inicio = datas[0];
  const fimEixo = datas[datas.length - 1];
  const span = Math.max(diasEntre(inicio, fimEixo), 30);
  const x = (iso: string) => MARGEM_ESQ + (diasEntre(inicio, iso) / span) * (LARGURA - MARGEM_ESQ - MARGEM_DIR);

  // marcas no dia 1 de cada mês dentro do intervalo, espaçadas para no máximo MAX_MARCAS
  const [a0, m0] = inicio.split('-').map(Number);
  const meses: string[] = [];
  for (let n = 0; n < 1200; n++) {
    const [a, m] = somarMeses(a0, m0, n);
    const iso = `${a}-${String(m).padStart(2, '0')}-01`;
    if (diasEntre(inicio, iso) > span) break;
    if (iso >= inicio) meses.push(iso);
  }
  const passo = Math.max(1, Math.ceil(meses.length / MAX_MARCAS));
  const marcas = meses.filter((_, i) => i % passo === 0);

  const altura = linhas.length * ALTURA_LINHA + ALTURA_EIXO;
  const yEixo = linhas.length * ALTURA_LINHA + 2;

  return (
    <svg className="linha-tempo" viewBox={`0 0 ${LARGURA} ${altura}`} preserveAspectRatio="xMinYMin meet" aria-hidden="true" focusable="false">
      {linhas.map(({ t, rotulo, fim }, i) => {
        const y = i * ALTURA_LINHA + ALTURA_LINHA / 2;
        const x0 = x(t.data_inicio!);
        const x1 = fim ? Math.max(x(fim), x0) : x0;
        return (
          <g key={t.id}>
            <text x={0} y={y + 4} className="linha-tempo__rotulo">
              {rotulo}
            </text>
            <line x1={x0} x2={x0} y1={y - 4} y2={y + 4} className="linha-tempo__traco" />
            {fim && <line x1={x0} x2={x1} y1={y} y2={y} className={ehCensura(t.status) ? 'linha-tempo__traco linha-tempo__traco--aberto' : 'linha-tempo__traco linha-tempo__traco--fechado'} />}
            {fim && t.status?.startsWith('desc_') && (
              <path d={`M${x1 - 3.5} ${y - 3.5} L${x1 + 3.5} ${y + 3.5} M${x1 - 3.5} ${y + 3.5} L${x1 + 3.5} ${y - 3.5}`} className="linha-tempo__traco linha-tempo__traco--fechado" />
            )}
            {fim && t.status === 'concluido_sucesso' && <rect x={x1 - 3.5} y={y - 3.5} width={7} height={7} className="linha-tempo__quadrado" />}
            {fim && t.status === 'perdido_seguimento' && <circle cx={x1} cy={y} r={3.5} className="linha-tempo__anel" />}
          </g>
        );
      })}
      <line x1={MARGEM_ESQ} x2={LARGURA - MARGEM_DIR} y1={yEixo} y2={yEixo} className="linha-tempo__eixo" />
      {marcas.map((iso) => {
        const xm = x(iso);
        const [a, m] = iso.split('-');
        return (
          <g key={iso}>
            <line x1={xm} x2={xm} y1={yEixo} y2={yEixo + 3} className="linha-tempo__eixo" />
            <text x={xm} y={yEixo + 14} textAnchor="middle" className="linha-tempo__mes">
              {`${m}/${a}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
