/**
 * Shell: <FaixaSintetico> fixa → sidebar (recolhível) | coluna principal com barra de busca,
 * tela da rota e rodapé de letras miúdas.
 * Título da aba: "[SINTÉTICO] MedPlan · <tela>" (sem o prefixo só se o servidor declarar dados reais).
 */
import { Search } from 'lucide-react';
import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { useReferencias } from '../api/referencias';
import { FaixaSintetico } from '../components/FaixaSintetico';
import ConsultaPage from '../features/consulta/ConsultaPage';
import CompararPage from '../features/medicamentos/CompararPage';
import MedicamentosPage from '../features/medicamentos/MedicamentosPage';
import { MetodologiaProvider } from '../features/metodologia/MetodologiaProvider';
import MetodologiaPage from '../features/metodologia/MetodologiaPage';
import PacientePage from '../features/pacientes/PacientePage';
import PacientesPage from '../features/pacientes/PacientesPage';
import ReacoesPage from '../features/reacoes/ReacoesPage';
import RegistroPage from '../features/registro/RegistroPage';
import VisaoGeralPage from '../features/visao-geral/VisaoGeralPage';
import { useAtalhos } from '../lib/atalhos';
import { BarraFiltros } from './BarraFiltros';
import { BuscaRapida } from './BuscaRapida';
import { FiltrosProvider } from './filtros';
import { LinkRota, ROTAS, useRota, type Rota } from './rotas';
import { Sidebar } from './Sidebar';
import { TelaEmConstrucao } from './TelaEmConstrucao';
import './App.css';

/** Telas em que os filtros globais valem (na Consulta, pré-preenchem o perfil). */
const ROTAS_COM_FILTROS: Rota[] = ['/visao-geral', '/consulta', '/medicamentos', '/medicamentos/comparar', '/reacoes'];

/** Tela de cada rota; as que ainda não existem mostram <TelaEmConstrucao>. */
const TELAS: Partial<Record<Rota, ComponentType>> = {
  '/visao-geral': VisaoGeralPage,
  '/consulta': ConsultaPage,
  '/pacientes': PacientesPage,
  '/paciente': PacientePage,
  '/registro': RegistroPage,
  '/medicamentos': MedicamentosPage,
  '/medicamentos/comparar': CompararPage,
  '/reacoes': ReacoesPage,
  '/metodologia': MetodologiaPage,
};

export function App() {
  const rota = useRota();
  const referencias = useReferencias();
  const [recolhida, setRecolhida] = useState(false);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const sintetico = !(referencias.status === 'pronto' && referencias.catalogo.referencias.ambiente.dados_sinteticos === false);
  const nomeTela = ROTAS.find((r) => r.caminho === rota)!.nome;
  const Tela = TELAS[rota];
  const fecharBusca = useCallback(() => setBuscaAberta(false), []);

  useEffect(() => {
    document.title = `${sintetico ? '[SINTÉTICO] ' : ''}MedPlan · ${nomeTela}`;
  }, [sintetico, nomeTela]);

  // Trocar de rota fecha a busca.
  useEffect(() => setBuscaAberta(false), [rota]);

  useAtalhos([{ tecla: 'k', ctrl: true, acao: () => setBuscaAberta(true) }]);

  return (
    <FiltrosProvider>
      <MetodologiaProvider>
        <FaixaSintetico />
        <div className={recolhida ? 'shell shell--recolhida' : 'shell'}>
          <Sidebar rota={rota} recolhida={recolhida} onAlternar={() => setRecolhida((r) => !r)} />
          <div className="shell__principal">
            <header className="barra-topo">
              <button type="button" className="barra-topo__busca" aria-keyshortcuts="Control+K Meta+K" onClick={() => setBuscaAberta(true)}>
                <Search size={16} aria-hidden="true" />
                <span className="barra-topo__busca-texto">Buscar medicamento, CID, tela…</span>
                <kbd className="barra-topo__kbd">⌘ K</kbd>
              </button>
              <BarraFiltros ativos={ROTAS_COM_FILTROS.includes(rota)} />
            </header>
            <main id="conteudo" className="app-conteudo">
              {Tela ? <Tela key={rota} /> : <TelaEmConstrucao titulo={nomeTela} />}
            </main>
            <footer className="rodape">
              <span>
                Apoio à decisão. Não é prescrição. Os dados são observacionais e refletem o padrão de prescrição da base, não a eficácia causal.
              </span>
              <LinkRota para="/metodologia">Metodologia</LinkRota>
            </footer>
          </div>
        </div>
        <BuscaRapida aberta={buscaAberta} onFechar={fecharBusca} />
      </MetodologiaProvider>
    </FiltrosProvider>
  );
}
