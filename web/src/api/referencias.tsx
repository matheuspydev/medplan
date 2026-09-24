/**
 * Catálogos de /referencias, carregados UMA vez por sessão e compartilhados.
 *
 *   <ReferenciasProvider> (já montado em main.tsx)
 *   const estado = useReferencias();            // {status: 'carregando' | 'erro' | 'pronto'}
 *   const catalogo = useCatalogo();             // Catalogo | null
 *   <ComReferencias>{(catalogo) => ...}</ComReferencias>   // trata carregando/erro
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from '../components/Button';
import { LoadingLine } from '../components/LoadingLine';
import { PainelFalha } from '../components/PainelFalha';
import { ErroApi, obterReferencias } from './client';
import type {
  Cid10,
  Diagnostico,
  ErroCampo,
  FaixaCatalogo,
  Medicamento,
  OpcaoStatus,
  ReacaoAdversaCatalogo,
  Referencias,
  StatusTratamento,
} from './types';

/** Listas de /referencias.opcoes que têm {codigo, rotulo}. */
export type ListaOpcoes = Exclude<keyof Referencias['opcoes'], 'unidades_dose'>;

export interface Catalogo {
  referencias: Referencias;
  diagnostico(codigo: string): Diagnostico | undefined;
  cid(codigo: string): Cid10 | undefined;
  /** Códigos do catálogo cid10 com o mesmo grupo, em ordem de código (mesma lógica do nível 5). */
  codigosDoGrupo(grupo: string): Cid10[];
  faixaEtaria(codigo: string): FaixaCatalogo | undefined;
  faixaImc(codigo: string): FaixaCatalogo | undefined;
  medicamento(id: number): Medicamento | undefined;
  reacao(id: number): ReacaoAdversaCatalogo | undefined;
  status(codigo: StatusTratamento): OpcaoStatus | undefined;
  /** Rótulo pt-BR de uma opção; devolve o próprio código se não achar. */
  rotuloOpcao(lista: ListaOpcoes, codigo: string): string;
}

/** "F30-F39" -> "F30–F39" (en dash, como na spec). */
export function rotuloGrupoCid(grupo: string): string {
  return grupo.replace('-', '–');
}

export function criarCatalogo(r: Referencias): Catalogo {
  const porCodigo = <T extends { codigo: string }>(lista: T[]) => new Map(lista.map((x) => [x.codigo, x]));
  const porId = <T extends { id: number }>(lista: T[]) => new Map(lista.map((x) => [x.id, x]));

  const diagnosticos = porCodigo(r.diagnosticos);
  const cids = porCodigo(r.cid10);
  const faixas = porCodigo(r.faixas_etarias);
  const imcs = porCodigo(r.faixas_imc);
  const meds = porId(r.medicamentos);
  const reacoes = porId(r.reacoes_adversas);
  const status = porCodigo(r.opcoes.status_tratamento);
  const grupos = new Map<string, Cid10[]>();
  for (const c of [...r.cid10].sort((a, b) => a.codigo.localeCompare(b.codigo))) {
    grupos.set(c.grupo, [...(grupos.get(c.grupo) ?? []), c]);
  }

  return {
    referencias: r,
    diagnostico: (codigo) => diagnosticos.get(codigo),
    cid: (codigo) => cids.get(codigo),
    codigosDoGrupo: (grupo) => grupos.get(grupo) ?? [],
    faixaEtaria: (codigo) => faixas.get(codigo),
    faixaImc: (codigo) => imcs.get(codigo),
    medicamento: (id) => meds.get(id),
    reacao: (id) => reacoes.get(id),
    status: (codigo) => status.get(codigo),
    rotuloOpcao: (lista, codigo) =>
      (r.opcoes[lista] as { codigo: string; rotulo: string }[]).find((o) => o.codigo === codigo)?.rotulo ?? codigo,
  };
}

export type EstadoReferencias =
  | { status: 'carregando' }
  | { status: 'erro'; erros: ErroCampo[]; recarregar: () => void }
  | { status: 'pronto'; catalogo: Catalogo };

const ContextoReferencias = createContext<EstadoReferencias | null>(null);

export function ReferenciasProvider({ children }: { children: ReactNode }) {
  const [tentativa, setTentativa] = useState(0);
  const [dados, setDados] = useState<Referencias | null>(null);
  const [erros, setErros] = useState<ErroCampo[] | null>(null);

  useEffect(() => {
    const controle = new AbortController();
    setErros(null);
    obterReferencias(controle.signal)
      .then(setDados)
      .catch((e: unknown) => {
        if (controle.signal.aborted) return;
        setErros(e instanceof ErroApi ? e.erros : [{ campo: '', mensagem: 'Falha ao carregar os catálogos.' }]);
      });
    return () => controle.abort();
  }, [tentativa]);

  const recarregar = useCallback(() => setTentativa((t) => t + 1), []);
  const catalogo = useMemo(() => (dados ? criarCatalogo(dados) : null), [dados]);

  const estado: EstadoReferencias = useMemo(() => {
    if (catalogo) return { status: 'pronto', catalogo };
    if (erros) return { status: 'erro', erros, recarregar };
    return { status: 'carregando' };
  }, [catalogo, erros, recarregar]);

  return <ContextoReferencias.Provider value={estado}>{children}</ContextoReferencias.Provider>;
}

export function useReferencias(): EstadoReferencias {
  const estado = useContext(ContextoReferencias);
  if (!estado) throw new Error('useReferencias precisa de <ReferenciasProvider>.');
  return estado;
}

export function useCatalogo(): Catalogo | null {
  const estado = useReferencias();
  return estado.status === 'pronto' ? estado.catalogo : null;
}

/** Renderiza os filhos só com catálogo pronto; mostra carregando (após 300ms) ou falha com "Tentar novamente". */
export function ComReferencias({ children }: { children: (catalogo: Catalogo) => ReactNode }) {
  const estado = useReferencias();
  if (estado.status === 'pronto') return <>{children(estado.catalogo)}</>;
  if (estado.status === 'carregando') return <LoadingLine ativo rotulo="Carregando catálogos…" />;
  return (
    <PainelFalha
      titulo="Não foi possível carregar os catálogos."
      acao={
        <Button variante="secundario" onClick={estado.recarregar}>
          Tentar novamente
        </Button>
      }
    >
      {estado.erros.map((e, i) => (
        <p key={i}>{e.mensagem}</p>
      ))}
    </PainelFalha>
  );
}
