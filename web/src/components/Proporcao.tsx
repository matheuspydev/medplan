/**
 * <Proporcao> — ÚNICO componente autorizado a imprimir "%".
 *
 * Formato (CLAUDE.md): "82% (n=134, IC95% 75–88%)" — percentual inteiro, en dash,
 * "IC95%" sem espaço interno, "n=" minúsculo. Os inteiros vêm ARREDONDADOS do backend
 * (pct, ic_inferior_pct, ic_superior_pct); este componente nunca arredonda.
 *
 * Abaixo do n mínimo (ou sem pct/IC): "dados insuficientes (n=12)", sem nenhum dígito
 * de percentual no DOM nem no aria-label.
 *
 * Não existe prop para percentual sem n e IC. Um teste de guarda falha se "%" formatado
 * aparecer em qualquer outro .tsx.
 */
import { formatarInteiro } from '../lib/format';
import './Proporcao.css';

export interface ProporcaoProps {
  /** Percentual inteiro já arredondado pelo backend (ex.: permanencia.pct). */
  pct: number | null;
  /** Denominador (n_avaliavel ou n_base). */
  n: number;
  icInfPct: number | null;
  icSupPct: number | null;
  /** n mínimo da leitura; n < nMinimo => "dados insuficientes". */
  nMinimo: number;
  /** Limite inferior em 600 --color-signal. SÓ na tabela 02 (onde ele ordena). */
  destacarLimiteInferior?: boolean;
  /** 'linha' = 14px (tabela); 'destaque' = 16px (cabeçalho do detalhe). */
  tamanho: 'linha' | 'destaque';
}

export function Proporcao({ pct, n, icInfPct, icSupPct, nMinimo, destacarLimiteInferior = false, tamanho }: ProporcaoProps) {
  const nTexto = formatarInteiro(n);
  const classeBase = `proporcao proporcao--${tamanho}`;

  if (pct === null || icInfPct === null || icSupPct === null || n < nMinimo) {
    return (
      <span className={`${classeBase} proporcao--insuficiente`} role="img" aria-label={`dados insuficientes; n igual a ${nTexto}`}>
        {`dados insuficientes (n=${nTexto})`}
      </span>
    );
  }

  const rotulo =
    `${pct} por cento; n igual a ${nTexto}; ` +
    `intervalo de confiança de 95 por cento de ${icInfPct} a ${icSupPct} por cento`;

  return (
    <span className={classeBase} role="img" aria-label={rotulo}>
      <span className="proporcao__pct">{`${pct}%`}</span>
      <span className="proporcao__resto">{` (n=${nTexto}, IC95% `}</span>
      <span className={destacarLimiteInferior ? 'proporcao__inf proporcao__inf--sinal' : 'proporcao__inf'}>{`${icInfPct}`}</span>
      <span className="proporcao__resto">{`–${icSupPct}%)`}</span>
    </span>
  );
}
