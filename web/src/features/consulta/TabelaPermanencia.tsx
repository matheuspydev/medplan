/**
 * Cartão PERMANÊNCIA EM TRATAMENTO: linhas na ordem do motor (limite inferior do IC95%).
 * Coluna de ordem (nunca ranking/melhor); nenhuma linha destacada; nada abre sozinho.
 * O nome é um botão de disclosure com roving tabindex: setas acima/abaixo movem, Enter/Espaço alternam,
 * seta direita expande, seta esquerda recolhe. O detalhe abre inline.
 */
import { ArrowDownUp, ChevronRight } from 'lucide-react';
import { Fragment, useRef, useState, type KeyboardEvent } from 'react';
import type { AnaliseResposta } from '../../api/types';
import { EixoFaixaIC, FaixaIC } from '../../components/FaixaIC';
import { PainelMedicao } from '../../components/PainelMedicao';
import { Proporcao } from '../../components/Proporcao';
import { inicialMaiuscula, plural } from '../../lib/format';
import { LinkMetodologia } from '../metodologia/contexto';
import { DetalheMedicamento } from './DetalheMedicamento';
import { notaDeOrdem, textoNota } from './notas';

export interface TabelaPermanenciaProps {
  resposta: AnaliseResposta;
}

export function TabelaPermanencia({ resposta }: TabelaPermanenciaProps) {
  const { recomendados: linhas, horizonte_dias: horizonte, n_minimo: nMinimo, total_censurado: censurados } = resposta;
  const [abertos, setAbertos] = useState<ReadonlySet<number>>(new Set());
  const [foco, setFoco] = useState(0);
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);
  const nMax = Math.max(0, ...linhas.map((l) => l.permanencia.n_avaliavel));

  function definir(id: number, aberto: boolean) {
    setAbertos((atual) => {
      if (atual.has(id) === aberto) return atual;
      const proximo = new Set(atual);
      if (aberto) proximo.add(id);
      else proximo.delete(id);
      return proximo;
    });
  }

  function mover(indice: number) {
    const alvo = Math.min(linhas.length - 1, Math.max(0, indice));
    setFoco(alvo);
    botoes.current[alvo]?.focus();
  }

  function aoTeclar(e: KeyboardEvent<HTMLButtonElement>, i: number, id: number) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        mover(i + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        mover(i - 1);
        break;
      case 'Home':
        e.preventDefault();
        mover(0);
        break;
      case 'End':
        e.preventDefault();
        mover(linhas.length - 1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        definir(id, true);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        definir(id, false);
        break;
    }
  }

  return (
    <PainelMedicao
      titulo="Permanência em tratamento"
      subtitulo={`Até ${horizonte} dias · ${plural(linhas.length, 'medicamento', 'medicamentos')} com dados suficientes`}
      acoes={
        <p className="legenda">
          <span className="legenda__item">
            <span className="legenda__ponto" aria-hidden="true" />
            estimativa
          </span>
          <span className="legenda__item">
            <span className="legenda__ic" aria-hidden="true" />
            IC95%
          </span>
          <span className="legenda__item">
            <span className="legenda__sinal" aria-hidden="true" />
            ordem
          </span>
        </p>
      }
      className="painel-permanencia"
    >
      <p className="painel__explicacao">
        Ordenado pelo limite inferior do IC95%, não pela taxa pontual. <LinkMetodologia ancora="ordem">Por quê</LinkMetodologia>
        {censurados > 0 && (
          <>
            <br />
            {plural(censurados, 'tratamento', 'tratamentos')} fora do denominador por seguimento menor que {horizonte} dias.
          </>
        )}
      </p>

      <div className="rolagem-tabela">
        <table className="permanencia">
          <thead>
            <tr>
              <th scope="col" className="permanencia__ordem">
                <span className="sr-only">Ordem</span>
              </th>
              <th scope="col" className="permanencia__medicamento">
                Medicamento
              </th>
              <th scope="col" className="permanencia__readout">
                Permanência até {horizonte} dias
              </th>
              <th scope="col" className="permanencia__plot">
                <span className="sr-only">Gráfico do IC95%</span>
                <EixoFaixaIC />
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => {
              const p = l.permanencia;
              const aberto = abertos.has(l.medicamento_id);
              const idDetalhe = `detalhe-medicamento-${l.medicamento_id}`;
              const nota = notaDeOrdem(linhas, i);
              return (
                <Fragment key={l.medicamento_id}>
                  <tr className={['permanencia__linha', nota ? 'permanencia__linha--com-nota' : '', aberto ? 'permanencia__linha--aberta' : ''].filter(Boolean).join(' ')}>
                    <td className="permanencia__ordem">
                      <span className="permanencia__posicao">{l.posicao}</span>
                    </td>
                    <td className="permanencia__medicamento">
                      <button
                        ref={(el) => {
                          botoes.current[i] = el;
                        }}
                        type="button"
                        className="permanencia__nome"
                        aria-expanded={aberto}
                        aria-controls={idDetalhe}
                        tabIndex={i === foco ? 0 : -1}
                        onFocus={() => setFoco(i)}
                        onClick={() => definir(l.medicamento_id, !aberto)}
                        onKeyDown={(e) => aoTeclar(e, i, l.medicamento_id)}
                      >
                        <span>{inicialMaiuscula(l.principio_ativo)}</span>
                        <ChevronRight size={16} aria-hidden="true" className="permanencia__chevron" />
                      </button>
                      <span className="permanencia__classe">{l.classe_terapeutica}</span>
                    </td>
                    <td className="permanencia__readout">
                      <Proporcao
                        pct={p.pct}
                        n={p.n_avaliavel}
                        icInfPct={p.ic_inferior_pct}
                        icSupPct={p.ic_superior_pct}
                        nMinimo={nMinimo}
                        destacarLimiteInferior
                        tamanho="destaque"
                      />
                    </td>
                    <td className="permanencia__plot">
                      <FaixaIC taxa={p.taxa} icInferior={p.ic_inferior} icSuperior={p.ic_superior} n={p.n_avaliavel} nMaxTabela={nMax} destacarLimiteInferior />
                    </td>
                  </tr>
                  {nota && (
                    <tr className="permanencia__nota">
                      <td />
                      <td colSpan={3}>
                        <ArrowDownUp size={12} aria-hidden="true" />
                        <span>{textoNota(nota)}</span>
                      </td>
                    </tr>
                  )}
                  <tr id={idDetalhe} className="permanencia__detalhe" hidden={!aberto}>
                    <td colSpan={4}>{aberto && <DetalheMedicamento linha={l} horizonteDias={horizonte} nMinimo={nMinimo} />}</td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </PainelMedicao>
  );
}
