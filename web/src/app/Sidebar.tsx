/**
 * Sidebar fixa à esquerda: marca, navegação em ícone + nome, item "Equipe" separado e,
 * no rodapé, Metodologia (Alt+M) e o seletor de tema. Recolhível para só ícones.
 * O estado de recolhida não é gravado no navegador (só o tema é).
 */
import { Activity, BookOpen, Database, Layers, LayoutDashboard, PanelLeft, UserSearch, Users, type LucideIcon } from 'lucide-react';
import { Logo } from '../components/Logo';
import { LinkRota, type Rota } from './rotas';
import { SeletorTema } from './SeletorTema';

interface ItemNav {
  para: Rota;
  rotulo: string;
  Icone: LucideIcon;
  /** Rotas que também acendem este item (subtelas). */
  inclui?: Rota[];
}

const PRINCIPAIS: ItemNav[] = [
  { para: '/visao-geral', rotulo: 'Visão geral', Icone: LayoutDashboard },
  { para: '/consulta', rotulo: 'Consulta por perfil', Icone: UserSearch },
  { para: '/pacientes', rotulo: 'Pacientes', Icone: Users, inclui: ['/registro', '/paciente'] },
  { para: '/medicamentos', rotulo: 'Medicamentos', Icone: Layers, inclui: ['/medicamentos/comparar'] },
  { para: '/reacoes', rotulo: 'Reações adversas', Icone: Activity },
];

const EQUIPE: ItemNav[] = [{ para: '/qualidade', rotulo: 'Qualidade dos dados', Icone: Database }];

function Item({ item, rota }: { item: ItemNav; rota: Rota }) {
  const ativo = item.para === rota || Boolean(item.inclui?.includes(rota));
  return (
    <LinkRota
      para={item.para}
      className="sidebar__item"
      aria-current={ativo ? 'page' : undefined}
      aria-label={item.rotulo}
      title={item.rotulo}
    >
      <item.Icone size={18} aria-hidden="true" />
      <span className="sidebar__rotulo">{item.rotulo}</span>
    </LinkRota>
  );
}

export function Sidebar({ rota, recolhida, onAlternar }: { rota: Rota; recolhida: boolean; onAlternar: () => void }) {
  return (
    <aside className="sidebar" aria-label="Navegação principal">
      <div className="sidebar__topo">
        <LinkRota para="/visao-geral" className="sidebar__marca" aria-label="MedPlan, ir para Visão geral">
          <Logo />
          <span className="sidebar__rotulo">MedPlan</span>
        </LinkRota>
        <button
          type="button"
          className="sidebar__alternar"
          aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}
          aria-expanded={!recolhida}
          onClick={onAlternar}
        >
          <PanelLeft size={18} aria-hidden="true" />
        </button>
      </div>

      <nav className="sidebar__nav" aria-label="Principal">
        {PRINCIPAIS.map((item) => (
          <Item key={item.para} item={item} rota={rota} />
        ))}
        <p className="sidebar__secao" aria-hidden={recolhida}>
          <span className="sidebar__rotulo">Equipe</span>
        </p>
        {EQUIPE.map((item) => (
          <Item key={item.para} item={item} rota={rota} />
        ))}
      </nav>

      <div className="sidebar__rodape">
        <LinkRota
          para="/metodologia"
          className="sidebar__item"
          aria-current={rota === '/metodologia' ? 'page' : undefined}
          aria-label="Metodologia"
          aria-keyshortcuts="Alt+M"
          title="Metodologia (Alt+M)"
        >
          <BookOpen size={18} aria-hidden="true" />
          <span className="sidebar__rotulo">Metodologia</span>
          <kbd className="sidebar__rotulo sidebar__kbd">Alt M</kbd>
        </LinkRota>
        <SeletorTema />
      </div>
    </aside>
  );
}
