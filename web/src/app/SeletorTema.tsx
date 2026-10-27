/** Tema no rodapé da sidebar: Sistema / Claro / Escuro, como controle segmentado (radiogroup). */
import { Monitor, Moon, Sun } from 'lucide-react';
import { SegmentedControl } from '../components/SegmentedControl';
import { useTema, type Tema } from './tema';

const OPCOES: { valor: Tema; rotulo: string; Icone: typeof Sun }[] = [
  { valor: 'sistema', rotulo: 'Sistema', Icone: Monitor },
  { valor: 'claro', rotulo: 'Claro', Icone: Sun },
  { valor: 'escuro', rotulo: 'Escuro', Icone: Moon },
];

export function SeletorTema() {
  const { tema, definirTema } = useTema();
  return (
    <>
      <span id="seletor-tema-rotulo" className="sr-only">
        Tema
      </span>
      <SegmentedControl
        nome="tema"
        aria-labelledby="seletor-tema-rotulo"
        className="seletor-tema"
        valor={tema}
        onChange={definirTema}
        opcoes={OPCOES.map(({ valor, rotulo, Icone }) => ({
          valor,
          rotulo: (
            <>
              <Icone size={14} aria-hidden="true" />
              <span className="sidebar__rotulo">{rotulo}</span>
            </>
          ),
        }))}
      />
    </>
  );
}
