/**
 * Shell: <FaixaSintetico> fixa → header 44px (retícula, MedPlan, abas, hospital, tema) → tela da rota.
 * Título da aba: "[SINTÉTICO] MedPlan · <tela>" (sem o prefixo só se o servidor declarar dados reais).
 */
import { useEffect } from 'react';
import { useReferencias } from '../api/referencias';
import { FaixaSintetico } from '../components/FaixaSintetico';
import { Logo } from '../components/Logo';
import ConsultaPage from '../features/consulta/ConsultaPage';
import { MetodologiaProvider } from '../features/metodologia/MetodologiaProvider';
import MetodologiaPage from '../features/metodologia/MetodologiaPage';
import RegistroPage from '../features/registro/RegistroPage';
import { MenuTema } from './MenuTema';
import { LinkRota, ROTAS, useRota } from './rotas';
import './App.css';

export function App() {
  const rota = useRota();
  const referencias = useReferencias();
  const sintetico = !(referencias.status === 'pronto' && referencias.catalogo.referencias.ambiente.dados_sinteticos === false);
  const nomeTela = ROTAS.find((r) => r.caminho === rota)!.nome;

  useEffect(() => {
    document.title = `${sintetico ? '[SINTÉTICO] ' : ''}MedPlan · ${nomeTela}`;
  }, [sintetico, nomeTela]);

  return (
    <MetodologiaProvider>
      <FaixaSintetico />
      <header className="app-header">
        <LinkRota para="/consulta" className="app-header__marca">
          <Logo tamanho={24} />
          <span>MedPlan</span>
        </LinkRota>
        <nav className="app-header__nav" aria-label="Principal">
          {ROTAS.map((r) => (
            <LinkRota key={r.caminho} para={r.caminho} className="app-header__aba" aria-current={r.caminho === rota ? 'page' : undefined}>
              {r.nome}
            </LinkRota>
          ))}
        </nav>
        <div className="app-header__direita">
          {referencias.status === 'pronto' && <span className="app-header__hospital">{referencias.catalogo.referencias.ambiente.hospital}</span>}
          <MenuTema />
        </div>
      </header>
      <main id="conteudo" className="app-conteudo">
        {rota === '/consulta' && <ConsultaPage />}
        {rota === '/registro' && <RegistroPage />}
        {rota === '/metodologia' && <MetodologiaPage />}
      </main>
      <footer className="rodape">
        <div className="rodape__conteudo">
          <p>
            O MedPlan é um protótipo de apoio à decisão clínica. Mostra o que aconteceu com perfis semelhantes nesta base; não prescreve e não
            substitui o julgamento do médico responsável.
          </p>
          {sintetico && <p>Todos os números vêm de dados sintéticos, gerados para validar o método, e não descrevem pacientes nem medicamentos reais.</p>}
          <p className="rodape__linha">
            <span>MedPlan · fase 0</span>
            <LinkRota para="/metodologia">Metodologia e créditos</LinkRota>
          </p>
        </div>
      </footer>
    </MetodologiaProvider>
  );
}
