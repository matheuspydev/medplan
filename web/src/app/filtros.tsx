/**
 * Filtros globais: valem para Visão geral, Medicamentos, Comparar e Reações adversas e
 * pré-preenchem a Consulta. Ficam só na memória da sessão (o único dado guardado no
 * navegador é o tema).
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Catalogo } from '../api/referencias';
import type { FiltrosGlobais } from '../api/types';

type ChaveFiltro = keyof FiltrosGlobais;

interface ContextoFiltros {
  filtros: FiltrosGlobais;
  definir: (novos: FiltrosGlobais) => void;
  remover: (chave: ChaveFiltro) => void;
  limpar: () => void;
}

const FiltrosContext = createContext<ContextoFiltros | null>(null);

export function FiltrosProvider({ children }: { children: ReactNode }) {
  const [filtros, setFiltros] = useState<FiltrosGlobais>({});
  const remover = useCallback((chave: ChaveFiltro) => {
    setFiltros((atual) => {
      const novo = { ...atual };
      delete novo[chave];
      return novo;
    });
  }, []);
  const valor = useMemo(() => ({ filtros, definir: setFiltros, remover, limpar: () => setFiltros({}) }), [filtros, remover]);
  return <FiltrosContext.Provider value={valor}>{children}</FiltrosContext.Provider>;
}

export function useFiltros(): ContextoFiltros {
  const ctx = useContext(FiltrosContext);
  if (!ctx) throw new Error('useFiltros precisa de <FiltrosProvider>.');
  return ctx;
}

export const ROTULOS_COMORBIDADES = ['Nenhuma', '1', '2', '3 ou mais'];

/** Fichas removíveis dos filtros ativos, com os rótulos do catálogo. */
export function fichasDosFiltros(f: FiltrosGlobais, catalogo: Catalogo): { chave: ChaveFiltro; rotulo: string; valor: string }[] {
  const fichas: { chave: ChaveFiltro; rotulo: string; valor: string }[] = [];
  if (f.sexo) fichas.push({ chave: 'sexo', rotulo: 'Sexo', valor: catalogo.rotuloOpcao('sexo', f.sexo) });
  if (f.faixa_etaria_cod) fichas.push({ chave: 'faixa_etaria_cod', rotulo: 'Faixa', valor: catalogo.faixaEtaria(f.faixa_etaria_cod)?.rotulo ?? f.faixa_etaria_cod });
  if (f.diagnostico) fichas.push({ chave: 'diagnostico', rotulo: 'Diagnóstico', valor: f.diagnostico });
  if (f.faixa_imc_cod) fichas.push({ chave: 'faixa_imc_cod', rotulo: 'IMC', valor: catalogo.faixaImc(f.faixa_imc_cod)?.rotulo ?? f.faixa_imc_cod });
  if (f.tabagista !== undefined) fichas.push({ chave: 'tabagista', rotulo: 'Tabagista', valor: f.tabagista ? 'Sim' : 'Não' });
  if (f.comorbidades !== undefined) fichas.push({ chave: 'comorbidades', rotulo: 'Comorbidades', valor: ROTULOS_COMORBIDADES[f.comorbidades] });
  return fichas;
}
