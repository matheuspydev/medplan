/**
 * Resumo lateral fixo: o que está sendo registrado, o que falta preencher (links que levam ao
 * campo), a trajetória do paciente até aqui e a nota de privacidade.
 */
import { ChevronRight, Lock } from 'lucide-react';
import type { FichaPaciente, StatusTratamento } from '../../api/types';
import { inicialMaiuscula } from '../../lib/format';
import type { Pendencia } from './modelo';

interface Props {
  chave: string;
  numero: string;
  medicamento: string;
  nReacoes: number;
  pendencias: Pendencia[];
  ficha: FichaPaciente | null;
  rotuloStatus: (s: StatusTratamento) => string;
  onIrPara: (chave: string) => void;
}

export function ResumoRegistro({ chave, numero, medicamento, nReacoes, pendencias, ficha, rotuloStatus, onIrPara }: Props) {
  return (
    <aside className="resumo-registro" aria-labelledby="reg-resumo-titulo">
      <h2 id="reg-resumo-titulo" className="resumo-registro__titulo">
        Resumo
      </h2>
      <dl className="resumo-registro__secoes">
        <div className="resumo-registro__linha">
          <dt>Paciente</dt>
          <dd className="mono">{chave}</dd>
        </div>
        <div className="resumo-registro__linha">
          <dt>Atendimento</dt>
          <dd>{numero}</dd>
        </div>
        <div className="resumo-registro__linha">
          <dt>Medicamento</dt>
          <dd>{medicamento}</dd>
        </div>
        <div className="resumo-registro__linha">
          <dt>Reações</dt>
          <dd>{nReacoes}</dd>
        </div>
      </dl>

      {pendencias.length > 0 && (
        <div className="resumo-registro__pendencias">
          <p className="resumo-registro__pendencias-titulo">Falta preencher ({pendencias.length})</p>
          <ul>
            {pendencias.map((p) => (
              <li key={p.chave}>
                <button type="button" className="resumo-registro__link" onClick={() => onIrPara(p.chave)}>
                  <span>{p.rotulo}</span>
                  <ChevronRight size={12} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ficha && ficha.tratamentos.length > 0 && (
        <div>
          <p className="resumo-registro__pendencias-titulo">Trajetória até aqui</p>
          <ol className="resumo-registro__trajetoria">
            {ficha.tratamentos.map((t) => (
              <li key={`${t.medicamento_id}-${t.data_inicio}`}>
                {t.linha_tratamento ? `${t.linha_tratamento}ª ` : ''}
                {inicialMaiuscula(t.principio_ativo)}, {rotuloStatus(t.status)}
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="resumo-registro__privacidade">
        <Lock size={14} aria-hidden="true" />
        <span>
          <strong>Privacidade</strong> Sem nome, CPF, prontuário, nascimento ou texto livre. Só chave pseudônima, sexo, faixas, CID-10,
          medicamento e reações. Neste protótipo, registre apenas pacientes fictícios.
        </span>
      </p>
    </aside>
  );
}
