/**
 * Filtros globais na barra do topo: fichas removíveis, "Limpar" e o painel com os seis filtros.
 * Cada mudança vale na hora (as telas recarregam com o recorte novo).
 */
import { SlidersHorizontal, X } from 'lucide-react';
import { useId, useState, type ChangeEvent } from 'react';
import { rotuloGrupoCid, useCatalogo } from '../api/referencias';
import { Button } from '../components/Button';
import type { FiltrosGlobais, Sexo } from '../api/types';
import { fichasDosFiltros, ROTULOS_COMORBIDADES, useFiltros } from './filtros';

export function BarraFiltros({ ativos }: { ativos: boolean }) {
  const catalogo = useCatalogo();
  const { filtros, definir, remover, limpar } = useFiltros();
  const [aberto, setAberto] = useState(false);
  const idPainel = useId();

  if (!ativos) return <span className="barra-topo__aviso">Os filtros globais não se aplicam a esta tela.</span>;
  if (!catalogo) return null;

  const fichas = fichasDosFiltros(filtros, catalogo);
  const { referencias } = catalogo;
  const grupos = [...new Set(referencias.diagnosticos.map((d) => d.grupo))].sort();

  function mudar<K extends keyof FiltrosGlobais>(chave: K, valor: FiltrosGlobais[K] | undefined) {
    const novo = { ...filtros };
    if (valor === undefined) delete novo[chave];
    else novo[chave] = valor;
    definir(novo);
  }
  const texto = (chave: 'faixa_etaria_cod' | 'diagnostico' | 'faixa_imc_cod') => (e: ChangeEvent<HTMLSelectElement>) =>
    mudar(chave, e.target.value || undefined);

  return (
    <>
      <div className="barra-topo__fichas" aria-label="Filtros ativos">
        {fichas.map((f) => (
          <span key={f.chave} className="ficha-filtro">
            <span className="ficha-filtro__rotulo">{f.rotulo}</span>
            {f.valor}
            <button type="button" className="ficha-filtro__remover" aria-label={`Remover filtro ${f.rotulo}`} onClick={() => remover(f.chave)}>
              <X size={14} aria-hidden="true" />
            </button>
          </span>
        ))}
        {fichas.length > 0 ? (
          <button type="button" className="barra-topo__limpar" onClick={limpar}>
            Limpar
          </button>
        ) : (
          <span className="barra-topo__aviso">Sem filtros: base inteira</span>
        )}
      </div>
      <Button
        variante="secundario"
        className="botao--pequeno"
        icone={<SlidersHorizontal size={16} />}
        aria-expanded={aberto}
        aria-controls={idPainel}
        onClick={() => setAberto((a) => !a)}
      >
        Filtros
      </Button>
      {aberto && (
        <div id={idPainel} className="painel-filtros" role="group" aria-label="Filtros globais">
          <label className="painel-filtros__campo">
            <span>Sexo</span>
            <select className="controle-texto" value={filtros.sexo ?? ''} onChange={(e) => mudar('sexo', (e.target.value || undefined) as Sexo | undefined)}>
              <option value="">Todos</option>
              {referencias.opcoes.sexo.map((o) => (
                <option key={o.codigo} value={o.codigo}>
                  {o.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className="painel-filtros__campo">
            <span>Faixa etária</span>
            <select className="controle-texto" value={filtros.faixa_etaria_cod ?? ''} onChange={texto('faixa_etaria_cod')}>
              <option value="">Todas</option>
              {referencias.faixas_etarias.map((f) => (
                <option key={f.codigo} value={f.codigo}>
                  {f.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className="painel-filtros__campo">
            <span>Diagnóstico (CID-10 ou grupo)</span>
            <select className="controle-texto" value={filtros.diagnostico ?? ''} onChange={texto('diagnostico')}>
              <option value="">Todos</option>
              <optgroup label="Grupos">
                {grupos.map((g) => (
                  <option key={g} value={g}>
                    {rotuloGrupoCid(g)}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Códigos">
                {referencias.diagnosticos.map((d) => (
                  <option key={d.codigo} value={d.codigo}>
                    {d.codigo} · {d.descricao}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <label className="painel-filtros__campo">
            <span>Faixa de IMC</span>
            <select className="controle-texto" value={filtros.faixa_imc_cod ?? ''} onChange={texto('faixa_imc_cod')}>
              <option value="">Todas</option>
              {referencias.faixas_imc.map((f) => (
                <option key={f.codigo} value={f.codigo}>
                  {f.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className="painel-filtros__campo">
            <span>Tabagista</span>
            <select
              className="controle-texto"
              value={filtros.tabagista === undefined ? '' : String(filtros.tabagista)}
              onChange={(e) => mudar('tabagista', e.target.value === '' ? undefined : e.target.value === 'true')}
            >
              <option value="">Todos</option>
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          </label>
          <label className="painel-filtros__campo">
            <span>Nº de comorbidades</span>
            <select
              className="controle-texto"
              value={filtros.comorbidades ?? ''}
              onChange={(e) => mudar('comorbidades', e.target.value === '' ? undefined : Number(e.target.value))}
            >
              <option value="">Qualquer</option>
              {ROTULOS_COMORBIDADES.map((r, i) => (
                <option key={r} value={i}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <Button variante="secundario" className="botao--pequeno painel-filtros__fechar" onClick={() => setAberto(false)}>
            Fechar
          </Button>
        </div>
      )}
    </>
  );
}
