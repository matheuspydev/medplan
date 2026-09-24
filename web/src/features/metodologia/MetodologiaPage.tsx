/** Página /metodologia: mesmo conteúdo do drawer, em cartões de leitura. */
import { ConteudoMetodologia } from './ConteudoMetodologia';
import './metodologia.css';

export default function MetodologiaPage() {
  return (
    <div className="pagina-metodologia">
      <div className="pagina-metodologia__coluna">
        <header className="pagina-metodologia__topo">
          <h1 className="titulo-tela" tabIndex={-1}>
            Metodologia
          </h1>
          <p className="pagina-metodologia__sub">Como o MedPlan monta a coorte, trata a censura e ordena os medicamentos.</p>
        </header>
        <ConteudoMetodologia contexto="pagina" />
      </div>
    </div>
  );
}
