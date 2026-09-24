/**
 * Rascunho validado -> corpo de POST /api/v1/casos (forma exata do contrato, sem chave extra).
 * Chamar só depois de `validarRascunho` sem erros: os obrigatórios são lidos com `!`.
 */
import type { CasoEntrada } from '../../api/types';
import { ehEncerrado, type Rascunho } from './modelo';

export function montarPayload(rascunho: Rascunho): CasoEntrada {
  const p = rascunho.perfil;
  return {
    perfil: {
      sexo: p.sexo!,
      faixa_etaria_cod: p.faixa_etaria_cod!,
      cid10_principal: p.cid10_principal!,
      comorbidades: [...p.comorbidades],
      faixa_imc_cod: p.faixa_imc_cod ?? null,
      tabagismo: p.tabagismo!,
      gestacao_lactacao: p.gestacao_lactacao!,
      funcao_renal: p.funcao_renal!,
      funcao_hepatica: p.funcao_hepatica!,
      uso_substancias: p.uso_substancias!,
    },
    tratamentos: rascunho.tratamentos.map((t) => {
      const encerrado = ehEncerrado(t.status);
      return {
        medicamento_id: t.medicamento_id!,
        data_inicio: t.data_inicio!,
        dose_inicial: t.dose_inicial,
        dose_manutencao: t.dose_manutencao,
        unidade_dose: t.unidade_dose,
        via: t.via!,
        linha_tratamento: t.linha_tratamento,
        desfecho: {
          status: t.status!,
          data_fim: encerrado ? t.data_fim : null,
          // Encerrado sem última observação: vale a data de fim, enviada explicitamente.
          data_ultima_observacao: encerrado ? (t.data_ultima_observacao ?? t.data_fim) : t.data_ultima_observacao,
          efetividade_percebida: t.efetividade_percebida,
        },
        reacoes: t.reacoes.map((r) => ({
          reacao_adversa_id: r.reacao_adversa_id!,
          dias_ate_inicio: r.dias_ate_inicio,
          gravidade_observada: r.gravidade_observada!,
          levou_descontinuacao: r.levou_descontinuacao!,
        })),
      };
    }),
  };
}

/**
 * Fragmento da Consulta para o perfil registrado: "#dx=F31.3&sexo=feminino&faixa=26_35&com=F41.1,I10".
 * Fragmento (não query string) para o perfil nunca chegar a log de servidor. Sem `com` quando não há comorbidade.
 */
export function fragmentoConsulta(perfil: CasoEntrada['perfil']): string {
  const partes = [
    `dx=${encodeURIComponent(perfil.cid10_principal)}`,
    `sexo=${encodeURIComponent(perfil.sexo)}`,
    `faixa=${encodeURIComponent(perfil.faixa_etaria_cod)}`,
  ];
  if (perfil.comorbidades.length) partes.push(`com=${perfil.comorbidades.map(encodeURIComponent).join(',')}`);
  return `#${partes.join('&')}`;
}
