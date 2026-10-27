/**
 * Modelo dos dois CSVs da carga (espelho de medplan/carga.py: COLUNAS_ATENDIMENTOS e
 * COLUNAS_REACOES). As listas de valores aceitos vêm do catálogo, para não divergirem do banco.
 * O arquivo de exemplo usa os primeiros itens das listas de referência só para ilustrar o
 * formato: não é dado clínico nem sugestão de combinação.
 */
import type { Catalogo } from '../../api/referencias';

export type ArquivoModelo = 'atendimentos' | 'reacoes';

export interface ColunaModelo {
  nome: string;
  obrigatoria: boolean;
  formato: string;
  regra: string;
}

const codigos = (lista: { codigo: string }[]) => lista.map((o) => o.codigo).join(', ');

export function colunasModelo(arquivo: ArquivoModelo, catalogo: Catalogo): ColunaModelo[] {
  const r = catalogo.referencias;
  if (arquivo === 'atendimentos') {
    return [
      { nome: 'chave_pseudonima', obrigatoria: true, formato: 'texto', regra: 'Chave gerada na origem; igual em todos os atendimentos do paciente. 4 a 32 caracteres: letras maiúsculas, dígitos e hífen.' },
      { nome: 'sexo', obrigatoria: true, formato: 'código', regra: `${codigos(r.opcoes.sexo)}. Igual ao já registrado para a chave.` },
      { nome: 'data_atendimento', obrigatoria: true, formato: 'AAAA-MM-DD', regra: 'Data válida, não futura. Uma linha por paciente e data.' },
      { nome: 'faixa_etaria_cod', obrigatoria: true, formato: 'código', regra: `Faixa na data do atendimento: ${codigos(r.faixas_etarias)}.` },
      { nome: 'faixa_imc_cod', obrigatoria: true, formato: 'código', regra: `${codigos(r.faixas_imc)} ou nao_informado.` },
      { nome: 'tabagismo', obrigatoria: true, formato: 'código', regra: `${codigos(r.opcoes.tabagismo)}.` },
      { nome: 'cid10_principal', obrigatoria: true, formato: 'código CID-10', regra: 'Precisa existir na lista de diagnósticos.' },
      { nome: 'comorbidades', obrigatoria: false, formato: 'códigos CID-10', regra: 'Separados por vírgula; vazio = nenhuma. O Data Mart guarda a quantidade; os códigos alimentam a Consulta.' },
      { nome: 'codigo_atc', obrigatoria: true, formato: 'código ATC', regra: 'Medicamento prescrito neste atendimento. Fora da lista: adicione em Medicamentos.' },
      { nome: 'data_inicio_medicamento', obrigatoria: true, formato: 'AAAA-MM-DD', regra: 'Não pode ser depois do atendimento. Em continuação, a data original.' },
      { nome: 'linha_tratamento', obrigatoria: false, formato: 'inteiro', regra: '1 = primeiro medicamento tentado. Vazio = não sabemos.' },
      { nome: 'status', obrigatoria: true, formato: 'código', regra: `${codigos(r.opcoes.status_tratamento)}.` },
    ];
  }
  return [
    { nome: 'chave_pseudonima', obrigatoria: true, formato: 'texto', regra: 'Com data_atendimento, liga a reação a uma linha do atendimentos.csv da mesma carga.' },
    { nome: 'data_atendimento', obrigatoria: true, formato: 'AAAA-MM-DD', regra: 'Atendimento em que a reação foi relatada.' },
    { nome: 'termo', obrigatoria: true, formato: 'termo', regra: 'Precisa existir na lista de referência de reações.' },
    { nome: 'codigo_atc_causador', obrigatoria: true, formato: 'código ATC', regra: 'Pode ser um medicamento anterior ao prescrito no atendimento, já registrado antes.' },
    { nome: 'data_inicio_medicamento', obrigatoria: true, formato: 'AAAA-MM-DD', regra: 'Início do medicamento que causou a reação.' },
    { nome: 'data_inicio_reacao', obrigatoria: false, formato: 'AAAA-MM-DD', regra: 'Vazio = não informado. Os dias até a reação são calculados.' },
    { nome: 'gravidade_observada', obrigatoria: true, formato: 'código', regra: `${codigos(r.opcoes.gravidade)}.` },
    { nome: 'levou_descontinuacao', obrigatoria: true, formato: 'sim ou nao', regra: 'Se a reação levou a parar o medicamento.' },
  ];
}

export const GRAO: Record<ArquivoModelo, string> = {
  atendimentos: 'Uma linha por atendimento (consulta). O mesmo paciente aparece em várias linhas, uma por consulta.',
  reacoes: 'Uma linha por reação relatada num atendimento. Liga ao atendimento pela chave e pela data do atendimento.',
};

/** Cabeçalho + linhas de exemplo, montadas com os primeiros itens das listas de referência. */
export function exemploCsv(arquivo: ArquivoModelo, catalogo: Catalogo): string {
  const r = catalogo.referencias;
  const primeiro = <T>(lista: T[]) => lista[0];
  const med = primeiro(r.medicamentos)?.codigo_atc ?? '';
  const valores: Record<string, string> =
    arquivo === 'atendimentos'
      ? {
          chave_pseudonima: 'REG-EXEMPLO1',
          sexo: primeiro(r.opcoes.sexo)?.codigo ?? '',
          data_atendimento: '2026-01-12',
          faixa_etaria_cod: primeiro(r.faixas_etarias)?.codigo ?? '',
          faixa_imc_cod: 'nao_informado',
          tabagismo: primeiro(r.opcoes.tabagismo)?.codigo ?? '',
          cid10_principal: primeiro(r.diagnosticos)?.codigo ?? '',
          comorbidades: '',
          codigo_atc: med,
          data_inicio_medicamento: '2026-01-12',
          linha_tratamento: '1',
          status: primeiro(r.opcoes.status_tratamento)?.codigo ?? '',
        }
      : {
          chave_pseudonima: 'REG-EXEMPLO1',
          data_atendimento: '2026-01-12',
          termo: primeiro(r.reacoes_adversas)?.termo ?? '',
          codigo_atc_causador: med,
          data_inicio_medicamento: '2026-01-12',
          data_inicio_reacao: '',
          gravidade_observada: primeiro(r.opcoes.gravidade)?.codigo ?? '',
          levou_descontinuacao: 'nao',
        };
  const nomes = colunasModelo(arquivo, catalogo).map((c) => c.nome);
  return `${nomes.join(';')}\n${nomes.map((n) => valores[n]).join(';')}\n`;
}
