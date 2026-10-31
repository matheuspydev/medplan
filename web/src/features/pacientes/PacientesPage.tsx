/**
 * Pacientes: lista dos pacientes com atendimentos, pela chave pseudônima, com busca (sem acento,
 * por chave ou CID-10) e filtros próprios. A chave abre a ficha; "Registrar atendimento" abre o registro.
 * A busca vai no corpo do POST, nunca na URL.
 */
import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { listarPacientes } from '../../api/client';
import { rotuloGrupoCid, useCatalogo } from '../../api/referencias';
import type { Sexo } from '../../api/types';
import { fragmentoChave, LinkRota } from '../../app/rotas';
import { Button } from '../../components/Button';
import { anosDoPeriodo, CampoPeriodo, type Periodo } from '../../components/CampoPeriodo';
import { EstadoApi } from '../../components/EstadoApi';
import { RotuloFaixa } from '../../components/RotuloFaixa';
import { formatarData, formatarInteiro, inicialMaiuscula } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import './pacientes.css';

const POR_PAGINA = 20;
const ESPERA_BUSCA_MS = 250;

export default function PacientesPage() {
  const catalogo = useCatalogo();
  const [texto, setTexto] = useState('');
  const [q, setQ] = useState('');
  const [sexo, setSexo] = useState<Sexo | ''>('');
  const [faixa, setFaixa] = useState('');
  const [grupo, setGrupo] = useState('');
  const [periodo, setPeriodo] = useState<Periodo>({});
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQ(texto.trim());
      setPagina(1);
    }, ESPERA_BUSCA_MS);
    return () => window.clearTimeout(t);
  }, [texto]);

  const entrada = {
    q: q || undefined,
    sexo: sexo || undefined,
    faixa_etaria_cod: faixa || undefined,
    grupo: grupo || undefined,
    ...periodo,
    pagina,
    por_pagina: POR_PAGINA,
  };
  const estado = useApi((signal) => listarPacientes(entrada, signal), JSON.stringify(entrada));
  const grupos = catalogo ? [...new Set(catalogo.referencias.diagnosticos.map((d) => d.grupo))].sort() : [];

  return (
    <div className="pagina">
      <header className="cabecalho-pagina">
        <div>
          <h1 className="titulo-tela">Pacientes</h1>
          <p className="cabecalho-pagina__texto">
            Cada paciente tem só uma chave pseudônima, sem nome, CPF, prontuário ou data de nascimento. Abra a chave para ver a evolução e
            registrar um novo atendimento.
          </p>
        </div>
        <LinkRota para="/registro" className="botao botao--primario">
          <Plus size={16} aria-hidden="true" />
          Registrar atendimento
        </LinkRota>
      </header>

      <section className="painel-medicao lista-pacientes" aria-label="Lista de pacientes">
        <div className="lista-pacientes__filtros">
          <label className="lista-pacientes__busca">
            <Search size={16} aria-hidden="true" />
            <input
              className="controle-texto"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Buscar por chave ou CID-10"
              aria-label="Buscar pacientes por chave ou CID-10"
            />
          </label>
          <select className="controle-texto" aria-label="Sexo" value={sexo} onChange={(e) => (setSexo(e.target.value as Sexo | ''), setPagina(1))}>
            <option value="">Sexo: todos</option>
            {catalogo?.referencias.opcoes.sexo.map((o) => (
              <option key={o.codigo} value={o.codigo}>
                {o.rotulo}
              </option>
            ))}
          </select>
          <select className="controle-texto" aria-label="Faixa etária" value={faixa} onChange={(e) => (setFaixa(e.target.value), setPagina(1))}>
            <option value="">Faixa: todas</option>
            {catalogo?.referencias.faixas_etarias.map((f) => (
              <option key={f.codigo} value={f.codigo}>
                {f.rotulo}
              </option>
            ))}
          </select>
          <select className="controle-texto" aria-label="Grupo diagnóstico" value={grupo} onChange={(e) => (setGrupo(e.target.value), setPagina(1))}>
            <option value="">Diagnóstico: todos</option>
            {grupos.map((g) => (
              <option key={g} value={g}>
                {rotuloGrupoCid(g)}
              </option>
            ))}
          </select>
          {catalogo && (
            <CampoPeriodo
              valor={periodo}
              onChange={(p) => (setPeriodo(p), setPagina(1))}
              anos={anosDoPeriodo(catalogo.referencias.periodo_atendimentos)}
            />
          )}
          {estado.dados && <span className="texto-apoio lista-pacientes__total">{formatarInteiro(estado.dados.total)} pacientes</span>}
        </div>

        <EstadoApi estado={estado} rotulo="Carregando pacientes…">
          {(lista) =>
            lista.itens.length === 0 ? (
              <div className="lista-pacientes__vazio">
                <p className="lista-pacientes__vazio-titulo">Nenhum paciente encontrado</p>
                <p className="texto-apoio">Tente outra chave ou código CID-10. A busca ignora acentos e maiúsculas.</p>
              </div>
            ) : (
              <>
                <div className="rolagem">
                  <table className="tabela">
                    <thead>
                      <tr>
                        <th>Chave</th>
                        <th>Sexo</th>
                        <th>Faixa etária</th>
                        <th>CID-10 principal</th>
                        <th>Medicamento atual</th>
                        <th className="numero">Atendimentos</th>
                        <th className="numero">Último atendimento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.itens.map((p) => (
                        <tr key={p.chave_pseudonima}>
                          <td>
                            <LinkRota para="/paciente" fragmento={fragmentoChave(p.chave_pseudonima)} className="mono">
                              {p.chave_pseudonima}
                            </LinkRota>
                          </td>
                          <td>{catalogo?.rotuloOpcao('sexo', p.sexo) ?? p.sexo}</td>
                          <td>
                            <RotuloFaixa codigo={p.faixa_etaria_cod} />
                          </td>
                          <td>
                            <span className="mono">{p.cid10}</span> <span className="texto-secundario">{p.descricao_cid}</span>
                          </td>
                          <td>{p.medicamento_atual && inicialMaiuscula(p.medicamento_atual)}</td>
                          <td className="numero">{formatarInteiro(p.n_atendimentos)}</td>
                          <td className="numero">{formatarData(p.ultimo_atendimento)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="lista-pacientes__paginacao">
                  <span className="texto-apoio">
                    Página {formatarInteiro(lista.pagina)} de {formatarInteiro(Math.max(1, Math.ceil(lista.total / lista.por_pagina)))}
                  </span>
                  <span className="lista-pacientes__botoes">
                    <Button variante="secundario" className="botao--pequeno" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
                      Anterior
                    </Button>
                    <Button
                      variante="secundario"
                      className="botao--pequeno"
                      disabled={lista.pagina * lista.por_pagina >= lista.total}
                      onClick={() => setPagina((p) => p + 1)}
                    >
                      Próxima
                    </Button>
                  </span>
                </div>
              </>
            )
          }
        </EstadoApi>
      </section>
    </div>
  );
}
