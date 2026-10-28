/** Rótulo da faixa etária pelo catálogo ("26_35" -> "26 a 35 anos"); o próprio código se não achar. */
import { useCatalogo } from '../api/referencias';

export function RotuloFaixa({ codigo }: { codigo: string }) {
  const catalogo = useCatalogo();
  return <>{catalogo?.faixaEtaria(codigo)?.rotulo ?? codigo}</>;
}
