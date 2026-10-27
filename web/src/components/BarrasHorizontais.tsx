/**
 * <BarrasHorizontais> — contagens (nunca percentuais) em barras horizontais, com o número ao lado.
 * A barra é proporcional ao maior valor da lista. A lista sai na ordem recebida.
 */
import type { CSSProperties, ReactNode } from 'react';
import { formatarInteiro } from '../lib/format';
import './BarrasHorizontais.css';

export interface ItemBarra {
  chave: string | number;
  rotulo: ReactNode;
  valor: number;
}

export function BarrasHorizontais({ itens, rotuloAcessivel }: { itens: ItemBarra[]; rotuloAcessivel: string }) {
  const maximo = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <ul className="barras" aria-label={rotuloAcessivel}>
      {itens.map((item) => (
        <li key={item.chave} className="barras__linha">
          <span className="barras__rotulo">{item.rotulo}</span>
          <span className="barras__trilho" aria-hidden="true">
            <span className="barras__barra" style={{ '--fracao': item.valor / maximo } as CSSProperties} />
          </span>
          <span className="barras__valor num">{formatarInteiro(item.valor)}</span>
        </li>
      ))}
    </ul>
  );
}
