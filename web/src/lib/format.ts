/**
 * Formatação pt-BR de contagens, datas e durações.
 *
 * NÃO formata percentual: percentual só sai de <Proporcao>, com n e IC95%, e o
 * arredondamento é do backend (pct / ic_inferior_pct / ic_superior_pct).
 */

/** Espaço não separável entre número e unidade ("84 d"). O thin space quebra linha. */
export const NBSP = ' ';

const inteiroPtBr = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const decimalPtBr = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

/** Contagem inteira com ponto de milhar: 1234 -> "1.234". */
export function formatarInteiro(n: number): string {
  return inteiroPtBr.format(n);
}

/** "1 tratamento" / "22 tratamentos" (a UI pluraliza; a API manda só o número). */
export function plural(n: number, singular: string, pluralTexto: string): string {
  return `${formatarInteiro(n)} ${n === 1 ? singular : pluralTexto}`;
}

/** "26 a 35 anos" -> "26–35"; "66 anos ou mais" -> "66+" (a partir do rótulo do catálogo). */
export function rotuloCurtoFaixa(rotulo: string): string {
  const numeros = rotulo.match(/\d+/g) ?? [];
  if (numeros.length >= 2) return `${numeros[0]}–${numeros[numeros.length - 1]}`;
  if (numeros.length === 1) return `${numeros[0]}+`;
  return rotulo;
}

/** Só a inicial em maiúscula: "carbonato de lítio" -> "Carbonato de lítio". */
export function inicialMaiuscula(texto: string): string {
  return texto.charAt(0).toLocaleUpperCase('pt-BR') + texto.slice(1);
}

/** Data ISO "2026-09-14" (ou início de um datetime ISO) -> "14/09/2026". Sem fuso: lê a string. */
export function formatarData(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

function doisDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

/** Datetime ISO com fuso -> "HH:mm" no relógio local do navegador. */
export function formatarHora(isoDataHora: string): string {
  const dt = new Date(isoDataHora);
  return `${doisDigitos(dt.getHours())}:${doisDigitos(dt.getMinutes())}`;
}

/** Datetime ISO com fuso -> "14/09/2026 14:36" (local). */
export function formatarDataHora(isoDataHora: string): string {
  const dt = new Date(isoDataHora);
  const data = `${doisDigitos(dt.getDate())}/${doisDigitos(dt.getMonth() + 1)}/${dt.getFullYear()}`;
  return `${data} ${formatarHora(isoDataHora)}`;
}

/** Hoje no fuso local, em ISO "aaaa-mm-dd" (para max de datas: nenhuma data no futuro). */
export function hojeIso(agora: Date = new Date()): string {
  return `${agora.getFullYear()}-${doisDigitos(agora.getMonth() + 1)}-${doisDigitos(agora.getDate())}`;
}

/**
 * Horizonte com equivalência em semanas só quando divisível por 7:
 * 84 -> "84 dias = 12 semanas"; 90 -> "90 dias". NBSP entre número e unidade.
 */
export function formatarHorizonte(dias: number): string {
  const base = `${formatarInteiro(dias)}${NBSP}${dias === 1 ? 'dia' : 'dias'}`;
  if (dias % 7 !== 0) return base;
  const semanas = dias / 7;
  return `${base} = ${formatarInteiro(semanas)}${NBSP}${semanas === 1 ? 'semana' : 'semanas'}`;
}

/** Contagem de dias com unidade curta: 84 -> "84 d". */
export function formatarDias(dias: number): string {
  return `${formatarInteiro(dias)}${NBSP}d`;
}

/** Mediana de dias: vírgula só quando não é inteira. 12 -> "12 d"; 14.5 -> "14,5 d". */
export function formatarMedianaDias(valor: number): string {
  const texto = Number.isInteger(valor) ? formatarInteiro(valor) : decimalPtBr.format(valor);
  return `${texto}${NBSP}d`;
}
