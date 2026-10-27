/**
 * "O que costuma ser prescrito para este perfil": proporção dos atendimentos da coorte em que cada
 * classe e cada medicamento foi prescrito, com n e IC (vem pronto da API). Mostra frequência, não indicação.
 */
import type { FrequenciaPrescricao as Frequencia } from '../../api/types';
import { LeituraProporcao } from '../../components/LeituraProporcao';
import { PainelMedicao } from '../../components/PainelMedicao';
import { formatarInteiro, inicialMaiuscula } from '../../lib/format';

export function FrequenciaPrescricao({ frequencia, nMinimo }: { frequencia: Frequencia; nMinimo: number }) {
  const nMax = frequencia.n_atendimentos;
  return (
    <PainelMedicao
      titulo="O que costuma ser prescrito para este perfil"
      subtitulo={`Proporção dos ${formatarInteiro(frequencia.n_atendimentos)} atendimentos da coorte (${formatarInteiro(frequencia.n_pacientes)} pacientes) em que cada classe ou medicamento foi prescrito. Mostra frequência, não indicação.`}
    >
      {frequencia.n_atendimentos === 0 ? (
        <p className="texto-apoio">Nenhum atendimento registrado para os pacientes desta coorte.</p>
      ) : (
        <div className="grade-cartoes frequencia">
          <div>
            <h3 className="frequencia__titulo">Por classe terapêutica</h3>
            {frequencia.classes.map((c) => (
              <div key={c.classe_terapeutica} className="linha-leitura">
                <span>{c.classe_terapeutica}</span>
                <LeituraProporcao p={c} nMinimo={nMinimo} nMax={nMax} />
              </div>
            ))}
          </div>
          <div>
            <h3 className="frequencia__titulo">Por medicamento</h3>
            {frequencia.medicamentos.map((m) => (
              <div key={m.medicamento_id} className="linha-leitura">
                <span>
                  {inicialMaiuscula(m.principio_ativo)} <span className="texto-secundario">{m.classe_terapeutica}</span>
                </span>
                <LeituraProporcao p={m} nMinimo={nMinimo} nMax={nMax} />
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="texto-apoio">Ordenado por frequência na coorte. Um paciente pode aparecer em vários atendimentos, inclusive com medicamentos diferentes.</p>
    </PainelMedicao>
  );
}
