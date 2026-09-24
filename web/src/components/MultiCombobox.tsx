/**
 * <MultiCombobox> — seleção múltipla agrupada (ex.: comorbidades PSIQUIÁTRICAS (capítulo F) / CLÍNICAS,
 * a mesma divisão que a escada usa).
 *
 * - A lista fica aberta após escolher (Enter, ou Espaço com o campo vazio); escolher de novo remove.
 * - Backspace com o campo vazio remove o último item escolhido.
 * - Esc fecha a lista. Tab apenas sai (não adiciona nada sem escolha explícita).
 * - Escolhidos aparecem como fichas (código + descrição + botão X com aria-label "Remover F41.1"),
 *   na ordem dos grupos; sem escolhidos, nada aparece.
 * - Opção `desabilitada` com `motivoDesabilitada` (ex. "já é o diagnóstico principal").
 */
import { ChevronDown, Search, X } from 'lucide-react';
import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { agrupar, filtrarOpcoes, idOpcao, ListaOpcoes, type GrupoCombobox, type OpcaoCombobox } from './comboboxComum';
import './Field.css';
import './Combobox.css';

export interface MultiComboboxProps {
  id: string;
  opcoes: OpcaoCombobox[];
  valores: string[];
  onChange: (valores: string[]) => void;
  /** Ordem e rótulo dos grupos; cada opção tem `grupo` = chave. */
  grupos: GrupoCombobox[];
  rotuloLista: string;
  semResultado: string;
  placeholder?: string;
  disabled?: boolean;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
  className?: string;
}

export const MultiCombobox = forwardRef<HTMLInputElement, MultiComboboxProps>(function MultiCombobox(
  { id, opcoes, valores, onChange, grupos, rotuloLista, semResultado, placeholder, disabled, className, ...aria },
  ref,
) {
  const idLista = `${id}-lista`;
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current!, []);

  const [aberto, setAberto] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [ativoValor, setAtivoValor] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState('');

  const selecionados = useMemo(() => new Set(valores), [valores]);
  const agrupadas = useMemo(() => agrupar(filtrarOpcoes(opcoes, consulta), grupos), [opcoes, consulta, grupos]);
  const navegaveis = useMemo(() => agrupadas.flatMap((g) => g.opcoes), [agrupadas]);
  const ativo = navegaveis.find((o) => o.valor === ativoValor);
  const porValor = useMemo(() => new Map(opcoes.map((o) => [o.valor, o])), [opcoes]);

  const nomeCurto = (o: OpcaoCombobox | undefined, valor: string) => o?.codigo ?? o?.rotulo ?? valor;

  function alternar(o: OpcaoCombobox) {
    if (o.desabilitada) return;
    if (selecionados.has(o.valor)) {
      onChange(valores.filter((v) => v !== o.valor));
      setAnuncio(`${nomeCurto(o, o.valor)} removido`);
    } else {
      onChange([...valores, o.valor]);
      setAnuncio(`${nomeCurto(o, o.valor)} adicionado`);
    }
    setConsulta('');
    setAtivoValor(o.valor);
  }

  function remover(valor: string) {
    onChange(valores.filter((v) => v !== valor));
    setAnuncio(`${nomeCurto(porValor.get(valor), valor)} removido`);
    inputRef.current?.focus();
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
        if (!aberto) setAberto(true);
        else mover(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!aberto) setAberto(true);
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
        if (aberto && ativo) alternar(ativo);
        else setAberto(true);
        break;
      case ' ':
        if (consulta === '' && aberto && ativo) {
          e.preventDefault();
          alternar(ativo);
        }
        break;
      case 'Backspace':
        if (consulta === '' && valores.length) {
          e.preventDefault();
          remover(valores[valores.length - 1]);
        }
        break;
      case 'Escape':
        if (aberto) {
          e.preventDefault();
          e.stopPropagation();
          setAberto(false);
          setConsulta('');
        }
        break;
      case 'Tab':
        setAberto(false);
        setConsulta('');
        break;
    }
  }

  return (
    <div className={['combobox', 'multi-combobox', aberto ? 'combobox--aberto' : '', className].filter(Boolean).join(' ')}>
      <div className="combobox__campo">
        <Search size={14} aria-hidden="true" className="combobox__lupa" />
        <input
          ref={inputRef}
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
          value={consulta}
          disabled={disabled}
          onFocus={() => setAberto(true)}
          onClick={() => setAberto(true)}
          onChange={(e) => {
            setConsulta(e.target.value);
            setAberto(true);
            setAtivoValor(agrupar(filtrarOpcoes(opcoes, e.target.value), grupos)[0]?.opcoes[0]?.valor ?? null);
          }}
          onBlur={() => {
            setAberto(false);
            setConsulta('');
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
          selecionados={selecionados}
          consulta={consulta}
          multi
          semResultado={semResultado}
          rotuloLista={rotuloLista}
          onEscolher={alternar}
          onAtivar={(o) => setAtivoValor(o.valor)}
        />
      )}

      {valores.length > 0 && (
        <ul className="multi-combobox__grupo-lista" aria-label={`${rotuloLista} escolhidas`}>
          {grupos.flatMap((g) =>
            valores
              .filter((v) => porValor.get(v)?.grupo === g.chave)
              .map((v) => {
                const o = porValor.get(v);
                return (
                  <li key={v} className="multi-combobox__item" title={o?.rotulo}>
                    <span className="multi-combobox__item-texto">
                      {o?.codigo && <span className="code">{o.codigo}</span>} {o?.rotulo ?? v}
                    </span>
                    <button
                      type="button"
                      className="multi-combobox__remover"
                      aria-label={`Remover ${nomeCurto(o, v)}`}
                      disabled={disabled}
                      onClick={() => remover(v)}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </li>
                );
              }),
          )}
        </ul>
      )}
      <span className="sr-only" aria-live="polite">
        {anuncio}
      </span>
    </div>
  );
});
