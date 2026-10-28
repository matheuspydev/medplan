/**
 * Busca rápida (Cmd/Ctrl+K): paleta de comandos que encontra ações, diagnósticos (CID-10),
 * medicamentos e telas. Busca local nos catálogos de /referencias, sem acento e sem caixa;
 * em códigos o ponto é opcional ("f411" acha F41.1).
 *
 * Teclado: setas movem, Enter abre, Esc fecha e devolve o foco a quem abriu.
 */
import { CornerDownLeft, Layers, LayoutGrid, ListTree, Plus, Search, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useCatalogo } from '../api/referencias';
import { codificarFragmento } from '../features/consulta/fragmento';
import { normalizar, normalizarCodigo } from '../lib/normalizar';
import { navegar, ROTAS, type Rota } from './rotas';

interface Resultado {
  chave: string;
  titulo: string;
  detalhe?: string;
  dica?: string;
  abrir: () => void;
}

interface Grupo {
  titulo: string;
  Icone: LucideIcon;
  itens: Resultado[];
}

const MAX_POR_GRUPO = 5;

function casa(consulta: string, texto: string, codigo?: string): boolean {
  if (!consulta) return true;
  if (normalizar(texto).includes(normalizar(consulta))) return true;
  return codigo !== undefined && normalizarCodigo(codigo).startsWith(normalizarCodigo(consulta));
}

export function BuscaRapida({ aberta, onFechar }: { aberta: boolean; onFechar: () => void }) {
  const catalogo = useCatalogo();
  const [consulta, setConsulta] = useState('');
  const [ativo, setAtivo] = useState(0);
  const entradaRef = useRef<HTMLInputElement>(null);
  const idLista = useId();

  useEffect(() => {
    if (!aberta) return;
    const gatilho = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setConsulta('');
    setAtivo(0);
    entradaRef.current?.focus();
    return () => gatilho?.focus();
  }, [aberta]);

  const grupos = useMemo<Grupo[]>(() => {
    const q = consulta.trim();
    const ir = (rota: Rota, fragmento = '') => () => {
      onFechar();
      navegar(rota, fragmento);
    };
    const acoes: Resultado[] = [
      { chave: 'acao-consulta', titulo: 'Nova consulta', detalhe: 'consulta por perfil', dica: 'Ctrl ↵', abrir: ir('/consulta') },
      { chave: 'acao-registro', titulo: 'Registrar atendimento', detalhe: 'paciente pseudonimizado', dica: 'Ctrl S', abrir: ir('/registro') },
      { chave: 'acao-comparar', titulo: 'Comparar medicamentos', detalhe: 'lado a lado', abrir: ir('/medicamentos/comparar') },
    ].filter((r) => casa(q, `${r.titulo} ${r.detalhe}`));
    const telas: Resultado[] = ROTAS.filter((r) => casa(q, r.nome)).map((r) => ({
      chave: `tela-${r.caminho}`,
      titulo: r.nome,
      dica: r.caminho === '/metodologia' ? 'Alt M' : undefined,
      abrir: ir(r.caminho),
    }));
    const diagnosticos: Resultado[] = q
      ? (catalogo?.referencias.diagnosticos ?? [])
          .filter((d) => casa(q, d.descricao, d.codigo))
          .map((d) => ({
            chave: `dx-${d.codigo}`,
            titulo: d.codigo,
            detalhe: d.descricao,
            dica: `${d.n_perfis} perfis`,
            abrir: ir('/consulta', codificarFragmento({ dx: d.codigo })),
          }))
      : [];
    const medicamentos: Resultado[] = q
      ? (catalogo?.referencias.medicamentos ?? [])
          .filter((m) => casa(q, m.principio_ativo, m.codigo_atc))
          .map((m) => ({
            chave: `med-${m.id}`,
            titulo: m.principio_ativo,
            detalhe: `${m.codigo_atc} · ${m.classe_terapeutica}`,
            abrir: ir('/medicamentos'),
          }))
      : [];
    return [
      { titulo: 'Ações', Icone: Plus, itens: acoes },
      { titulo: 'Diagnósticos (CID-10)', Icone: ListTree, itens: diagnosticos },
      { titulo: 'Medicamentos', Icone: Layers, itens: medicamentos },
      { titulo: 'Telas', Icone: LayoutGrid, itens: telas },
    ]
      .map((g) => ({ ...g, itens: g.itens.slice(0, MAX_POR_GRUPO) }))
      .filter((g) => g.itens.length > 0);
  }, [consulta, catalogo, onFechar]);

  const todos = grupos.flatMap((g) => g.itens);
  const indiceAtivo = Math.min(ativo, Math.max(todos.length - 1, 0));

  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onFechar();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!todos.length) return;
      setAtivo((indiceAtivo + (e.key === 'ArrowDown' ? 1 : todos.length - 1)) % todos.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      todos[indiceAtivo]?.abrir();
    } else if (e.key === 'Tab') {
      e.preventDefault(); // o foco fica na entrada enquanto a paleta está aberta
    }
  }

  if (!aberta) return null;

  let indice = -1;
  return (
    <div className="busca__scrim" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="busca" role="dialog" aria-modal="true" aria-label="Busca rápida" onKeyDown={aoTeclar}>
        <div className="busca__entrada">
          <Search size={18} aria-hidden="true" />
          <input
            ref={entradaRef}
            value={consulta}
            onChange={(e) => {
              setConsulta(e.target.value);
              setAtivo(0);
            }}
            placeholder="Medicamento, CID-10, tela ou ação"
            aria-label="Buscar"
            role="combobox"
            aria-expanded="true"
            aria-controls={idLista}
            aria-activedescendant={todos.length ? `${idLista}-${indiceAtivo}` : undefined}
            autoComplete="off"
          />
          <kbd className="busca__kbd">Esc</kbd>
        </div>
        <div id={idLista} role="listbox" aria-label="Resultados" className="busca__lista">
          {grupos.map((g) => (
            <div key={g.titulo} role="group" aria-label={g.titulo} className="busca__grupo">
              <p className="busca__grupo-titulo" aria-hidden="true">
                {g.titulo}
              </p>
              {g.itens.map((item) => {
                indice += 1;
                const i = indice;
                return (
                  <div
                    key={item.chave}
                    id={`${idLista}-${i}`}
                    role="option"
                    aria-selected={i === indiceAtivo}
                    className="busca__item"
                    onMouseEnter={() => setAtivo(i)}
                    onClick={item.abrir}
                  >
                    <span className="busca__icone" aria-hidden="true">
                      <g.Icone size={16} />
                    </span>
                    <span className="busca__texto">
                      <span className="busca__titulo">{item.titulo}</span>
                      {item.detalhe && <span className="busca__detalhe"> {item.detalhe}</span>}
                    </span>
                    {item.dica && <span className="busca__dica">{item.dica}</span>}
                  </div>
                );
              })}
            </div>
          ))}
          {!todos.length && (
            <div className="busca__vazio">
              <p className="busca__vazio-titulo">Nada encontrado para “{consulta.trim()}”</p>
              <p>Tente o código CID-10 (F41), o princípio ativo ou o nome de uma tela.</p>
            </div>
          )}
        </div>
        <div className="busca__rodape" aria-hidden="true">
          <span>
            <kbd className="busca__kbd">↑</kbd> <kbd className="busca__kbd">↓</kbd> navegar
          </span>
          <span>
            <kbd className="busca__kbd">
              <CornerDownLeft size={11} />
            </kbd>{' '}
            abrir
          </span>
          <span>
            <kbd className="busca__kbd">Esc</kbd> fechar
          </span>
          <span className="busca__rodape-fim">A busca ignora acentos</span>
        </div>
      </div>
    </div>
  );
}
