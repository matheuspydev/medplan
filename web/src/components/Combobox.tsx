/**
 * <Combobox> — seleção única num catálogo local (ARIA 1.2: combobox + listbox, aria-activedescendant).
 *
 * - Ao focar, abre a lista completa (agrupada por `grupo`). Sem valor inicial.
 * - Busca sem acento/caixa, ponto opcional em códigos ("f313", "bipolar"); prefixo de código primeiro.
 * - ↑/↓ movem, Home/End pulam, Enter escolhe (nunca envia formulário), Tab confirma a opção ativa
 *   quando a pessoa digitou, Esc fecha e restaura o valor anterior. Apagar o texto e sair limpa o valor.
 * - Sem resultado: `semResultado` (nunca "criar novo").
 *
 *   <Field id="dx" rotulo="Diagnóstico principal · CID-10" obrigatorio erro={erro}>
 *     {(a11y) => <Combobox {...a11y} opcoes={opcoesDx} valor={dx} onChange={setDx}
 *                  rotuloGrupo={rotuloGrupoCid} rotuloLista="Diagnósticos CID-10"
 *                  semResultado="Nenhum código encontrado. A lista contém só os diagnósticos cadastrados na base." />}
 *   </Field>
 */
import { ChevronDown, Search } from 'lucide-react';
import { forwardRef, useMemo, useState, type KeyboardEvent } from 'react';
import { agrupar, filtrarOpcoes, idOpcao, ListaOpcoes, type GrupoCombobox, type OpcaoCombobox } from './comboboxComum';
import './Field.css';
import './Combobox.css';

export type { GrupoCombobox, OpcaoCombobox } from './comboboxComum';

export interface ComboboxProps {
  id: string;
  opcoes: OpcaoCombobox[];
  valor: string | null;
  onChange: (valor: string | null) => void;
  /** Nome acessível da lista, ex. "Diagnósticos CID-10". */
  rotuloLista: string;
  semResultado: string;
  placeholder?: string;
  /** Rótulo visível de cada grupo a partir da chave (ex. rotuloGrupoCid). */
  rotuloGrupo?: (chave: string) => string;
  /** Ordem e rótulo explícitos dos grupos (alternativa a rotuloGrupo). */
  grupos?: GrupoCombobox[];
  /** Texto no campo quando há valor; padrão "codigo · rotulo". */
  textoSelecionado?: (opcao: OpcaoCombobox) => string;
  disabled?: boolean;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
  className?: string;
}

const textoPadrao = (o: OpcaoCombobox) => (o.codigo ? `${o.codigo} · ${o.rotulo}` : o.rotulo);

export const Combobox = forwardRef<HTMLInputElement, ComboboxProps>(function Combobox(
  {
    id,
    opcoes,
    valor,
    onChange,
    rotuloLista,
    semResultado,
    placeholder,
    rotuloGrupo,
    grupos,
    textoSelecionado = textoPadrao,
    disabled,
    className,
    ...aria
  },
  ref,
) {
  const idLista = `${id}-lista`;
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [ativoValor, setAtivoValor] = useState<string | null>(null);

  const selecionada = useMemo(() => opcoes.find((o) => o.valor === valor), [opcoes, valor]);
  const consultaEfetiva = editando ? consulta : '';
  const filtradas = useMemo(() => filtrarOpcoes(opcoes, consultaEfetiva), [opcoes, consultaEfetiva]);
  const agrupadas = useMemo(() => agrupar(filtradas, grupos, rotuloGrupo), [filtradas, grupos, rotuloGrupo]);
  // ordem de navegação = ordem visual (grupos em sequência)
  const navegaveis = useMemo(() => agrupadas.flatMap((g) => g.opcoes), [agrupadas]);
  const ativo = navegaveis.find((o) => o.valor === ativoValor);

  function abrir() {
    if (disabled) return;
    setAberto(true);
    if (!editando) setAtivoValor(valor);
  }

  function fechar(restaurar: boolean) {
    setAberto(false);
    if (restaurar || editando) {
      setEditando(false);
      setConsulta('');
    }
  }

  function escolher(o: OpcaoCombobox) {
    if (o.desabilitada) return;
    onChange(o.valor);
    setEditando(false);
    setConsulta('');
    setAberto(false);
  }

  function mover(delta: number) {
    if (!navegaveis.length) return;
    const atual = ativo ? navegaveis.indexOf(ativo) : -1;
    const proximo = atual < 0 ? (delta > 0 ? 0 : navegaveis.length - 1) : Math.min(navegaveis.length - 1, Math.max(0, atual + delta));
    setAtivoValor(navegaveis[proximo].valor);
  }

  function aoTeclar(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!aberto) abrir();
        else mover(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!aberto) abrir();
        else mover(-1);
        break;
      case 'Home':
      case 'End':
        if (aberto && navegaveis.length) {
          e.preventDefault();
          setAtivoValor(navegaveis[e.key === 'Home' ? 0 : navegaveis.length - 1].valor);
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (aberto && ativo) escolher(ativo);
        else if (!aberto) abrir();
        break;
      case 'Tab':
        if (aberto && editando && ativo && !ativo.desabilitada) escolher(ativo);
        else fechar(false);
        break;
      case 'Escape':
        if (aberto || editando) {
          e.preventDefault();
          e.stopPropagation();
          fechar(true);
        }
        break;
    }
  }

  const textoCampo = editando ? consulta : selecionada ? textoSelecionado(selecionada) : '';

  return (
    <div className={['combobox', aberto ? 'combobox--aberto' : '', className].filter(Boolean).join(' ')}>
      <div className="combobox__campo">
        <Search size={14} aria-hidden="true" className="combobox__lupa" />
        <input
          ref={ref}
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={aberto}
          aria-controls={idLista}
          aria-activedescendant={aberto && ativo ? idOpcao(idLista, ativo.valor) : undefined}
          autoComplete="off"
          spellCheck={false}
          className="controle-texto combobox__input"
          placeholder={placeholder}
          value={textoCampo}
          disabled={disabled}
          onFocus={abrir}
          onClick={() => !aberto && abrir()}
          onChange={(e) => {
            const texto = e.target.value;
            setEditando(true);
            setConsulta(texto);
            setAberto(true);
            setAtivoValor(agrupar(filtrarOpcoes(opcoes, texto), grupos, rotuloGrupo)[0]?.opcoes[0]?.valor ?? null);
          }}
          onBlur={() => {
            if (editando && !consulta.trim()) onChange(null);
            fechar(false);
          }}
          onKeyDown={aoTeclar}
          {...aria}
        />
        <ChevronDown size={14} aria-hidden="true" className="combobox__chevron" />
      </div>
      {aberto && (
        <ListaOpcoes
          idLista={idLista}
          grupos={agrupadas}
          ativo={ativo}
          selecionados={new Set(valor ? [valor] : [])}
          consulta={consultaEfetiva}
          multi={false}
          semResultado={semResultado}
          rotuloLista={rotuloLista}
          onEscolher={escolher}
          onAtivar={(o) => setAtivoValor(o.valor)}
        />
      )}
    </div>
  );
});
