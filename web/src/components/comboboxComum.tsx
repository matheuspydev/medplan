/**
 * Partes compartilhadas por <Combobox> e <MultiCombobox> (uso interno dos dois; as telas
 * importam só `OpcaoCombobox` e `filtrarOpcoes` se precisarem).
 */
import { Check } from 'lucide-react';
import { useEffect } from 'react';
import { normalizar, normalizarCodigo, trechoCasado } from '../lib/normalizar';

export interface OpcaoCombobox {
  /** Valor devolvido no onChange (código CID, id do medicamento como string etc.). */
  valor: string;
  /** Texto principal (descrição CID, princípio ativo, termo). */
  rotulo: string;
  /** Código exibido em mono na coluna de 64px (CID-10, ATC). Busca com ponto opcional e prefixo primeiro. */
  codigo?: string;
  /** Texto secundário na mesma linha (classe terapêutica, SOC). Também é buscável. */
  detalhe?: string;
  /** Chave do grupo (cid10.grupo, 'psiquiatrica'/'clinica'). */
  grupo?: string;
  desabilitada?: boolean;
  /** Mostrado junto da opção desabilitada, ex. "já é o diagnóstico principal". */
  motivoDesabilitada?: string;
}

export interface GrupoCombobox {
  chave: string;
  rotulo: string;
}

/**
 * Busca local: sem acento, sem caixa, ponto opcional em códigos.
 * Ordem: prefixo de código > trecho no rótulo/detalhe > trecho no código. Estável dentro de cada faixa.
 */
export function filtrarOpcoes(opcoes: OpcaoCombobox[], consulta: string): OpcaoCombobox[] {
  const qn = normalizar(consulta.trim());
  const qc = normalizarCodigo(consulta);
  if (!qn) return opcoes;

  const ranqueadas: [number, number, OpcaoCombobox][] = [];
  opcoes.forEach((o, i) => {
    const cod = o.codigo ? normalizarCodigo(o.codigo) : '';
    let rank = -1;
    if (cod && qc && cod.startsWith(qc)) rank = 0;
    else if (normalizar(o.rotulo).includes(qn) || (o.detalhe && normalizar(o.detalhe).includes(qn))) rank = 1;
    else if (cod && qc && cod.includes(qc)) rank = 2;
    if (rank >= 0) ranqueadas.push([rank, i, o]);
  });
  ranqueadas.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return ranqueadas.map((r) => r[2]);
}

/** Agrupa preservando a ordem das opções (ou a ordem de `grupos`, quando dada). */
export function agrupar(
  opcoes: OpcaoCombobox[],
  grupos?: GrupoCombobox[],
  rotuloGrupo?: (chave: string) => string,
): { chave: string; rotulo: string; opcoes: OpcaoCombobox[] }[] {
  const mapa = new Map<string, OpcaoCombobox[]>();
  for (const o of opcoes) {
    const chave = o.grupo ?? '';
    mapa.set(chave, [...(mapa.get(chave) ?? []), o]);
  }
  const chaves = grupos ? grupos.map((g) => g.chave).filter((c) => mapa.has(c)) : [...mapa.keys()];
  return chaves.map((chave) => ({
    chave,
    rotulo: grupos?.find((g) => g.chave === chave)?.rotulo ?? (chave && rotuloGrupo ? rotuloGrupo(chave) : chave),
    opcoes: mapa.get(chave)!,
  }));
}

export function idOpcao(idLista: string, valor: string): string {
  return `${idLista}-op-${valor.replace(/[^\w-]/g, '_')}`;
}

/** Trecho casado em 600, sem cor. */
export function Destaque({ texto, consulta, codigo = false }: { texto: string; consulta: string; codigo?: boolean }) {
  const trecho = consulta.trim() ? trechoCasado(texto, consulta.trim(), codigo) : null;
  if (!trecho) return <>{texto}</>;
  const [ini, fim] = trecho;
  return (
    <>
      {texto.slice(0, ini)}
      <mark className="combobox__casado">{texto.slice(ini, fim)}</mark>
      {texto.slice(fim)}
    </>
  );
}

interface ListaProps {
  idLista: string;
  grupos: { chave: string; rotulo: string; opcoes: OpcaoCombobox[] }[];
  ativo: OpcaoCombobox | undefined;
  selecionados: ReadonlySet<string>;
  consulta: string;
  multi: boolean;
  semResultado: string;
  rotuloLista: string;
  onEscolher: (o: OpcaoCombobox) => void;
  onAtivar: (o: OpcaoCombobox) => void;
}

/** Popup do combobox: listbox com grupos (ARIA 1.2) ou mensagem de sem resultado. */
export function ListaOpcoes({ idLista, grupos, ativo, selecionados, consulta, multi, semResultado, rotuloLista, onEscolher, onAtivar }: ListaProps) {
  const idAtivo = ativo ? idOpcao(idLista, ativo.valor) : undefined;

  // Rola só a própria lista. scrollIntoView rolaria também a página e qualquer painel rolável em volta.
  useEffect(() => {
    const opcao = idAtivo ? document.getElementById(idAtivo) : null;
    const lista = opcao?.closest<HTMLElement>('.combobox__lista');
    if (!opcao || !lista) return;
    const o = opcao.getBoundingClientRect();
    const l = lista.getBoundingClientRect();
    if (o.top < l.top) lista.scrollTop -= l.top - o.top;
    else if (o.bottom > l.bottom) lista.scrollTop += o.bottom - l.bottom;
  }, [idAtivo]);

  const vazio = grupos.length === 0;

  function renderOpcao(o: OpcaoCombobox) {
    const selecionada = selecionados.has(o.valor);
    return (
      <li
        key={o.valor}
        id={idOpcao(idLista, o.valor)}
        role="option"
        aria-selected={selecionada}
        aria-disabled={o.desabilitada || undefined}
        className={[
          'combobox__opcao',
          ativo?.valor === o.valor ? 'combobox__opcao--ativa' : '',
          o.desabilitada ? 'combobox__opcao--desabilitada' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onMouseDown={(e) => e.preventDefault()}
        onMouseMove={() => ativo?.valor !== o.valor && onAtivar(o)}
        onClick={() => !o.desabilitada && onEscolher(o)}
      >
        {multi && (
          <span className="combobox__marca" aria-hidden="true">
            {selecionada && <Check size={14} />}
          </span>
        )}
        {o.codigo !== undefined && (
          <span className="combobox__codigo code">
            <Destaque texto={o.codigo} consulta={consulta} codigo />
          </span>
        )}
        <span className="combobox__texto">
          <span className="combobox__rotulo">
            <Destaque texto={o.rotulo} consulta={consulta} />
          </span>
          {o.detalhe && (
            <span className="combobox__detalhe">
              <Destaque texto={o.detalhe} consulta={consulta} />
            </span>
          )}
          {o.desabilitada && o.motivoDesabilitada && <span className="combobox__motivo">{o.motivoDesabilitada}</span>}
        </span>
      </li>
    );
  }

  return (
    <div className="combobox__popup">
      <ul id={idLista} role="listbox" aria-label={rotuloLista} aria-multiselectable={multi || undefined} className="combobox__lista" hidden={vazio}>
        {grupos.map((g) =>
          g.rotulo ? (
            <li key={g.chave} role="presentation">
              <div id={`${idLista}-g-${g.chave.replace(/[^\w-]/g, '_')}`} className="combobox__grupo micro" role="presentation">
                {g.rotulo}
              </div>
              <ul role="group" aria-labelledby={`${idLista}-g-${g.chave.replace(/[^\w-]/g, '_')}`}>
                {g.opcoes.map(renderOpcao)}
              </ul>
            </li>
          ) : (
            g.opcoes.map(renderOpcao)
          ),
        )}
      </ul>
      {vazio && (
        <p className="combobox__vazio" role="status">
          {semResultado}
        </p>
      )}
    </div>
  );
}
