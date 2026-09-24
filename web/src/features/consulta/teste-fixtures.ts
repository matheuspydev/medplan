/**
 * Catálogo de referência para os testes da Consulta: mesma forma de /referencias, com os códigos e
 * faixas do seed de catálogo (vocabulário, não dado de paciente). Contagens de perfis são SINTÉTICAS.
 */
import { criarCatalogo } from '../../api/referencias';
import type { Cid10, Referencias } from '../../api/types';

const cid = (codigo: string, grupo: string): Cid10 => ({
  codigo,
  descricao: `Descrição de ${codigo}`,
  grupo,
  tipo: codigo.startsWith('F') ? 'psiquiatrica' : 'clinica',
});

const CID10: Cid10[] = [
  cid('E11.9', 'E10-E14'),
  cid('E66.9', 'E65-E68'),
  cid('F31.1', 'F30-F39'),
  cid('F31.3', 'F30-F39'),
  cid('F31.9', 'F30-F39'),
  cid('F32.1', 'F30-F39'),
  cid('F32.2', 'F30-F39'),
  cid('F33.1', 'F30-F39'),
  cid('F33.2', 'F30-F39'),
  cid('F41.1', 'F40-F48'),
  cid('F60.3', 'F60-F69'),
  cid('F90.0', 'F90-F98'),
  cid('I10', 'I10-I15'),
];

export const REFERENCIAS_TESTE: Referencias = {
  ambiente: { dados_sinteticos: true, hospital: 'Hospital de Demonstração (dados sintéticos)' },
  clinico_atual: { id: 1, nome: 'Clínico sintético 1', papel: 'medico' },
  limites: { horizonte_padrao_dias: 84, horizonte_min_dias: 28, horizonte_max_dias: 180, n_minimo_padrao: 20, n_minimo_min: 5, n_minimo_max: 100 },
  diagnosticos: CID10.filter((c) => c.tipo === 'psiquiatrica').map((c) => ({ codigo: c.codigo, descricao: c.descricao, grupo: c.grupo, n_perfis: 100 })),
  cid10: CID10,
  faixas_etarias: [
    { codigo: '12_17', rotulo: '12 a 17 anos', ordem: 1 },
    { codigo: '18_25', rotulo: '18 a 25 anos', ordem: 2 },
    { codigo: '26_35', rotulo: '26 a 35 anos', ordem: 3 },
    { codigo: '36_50', rotulo: '36 a 50 anos', ordem: 4 },
    { codigo: '51_65', rotulo: '51 a 65 anos', ordem: 5 },
    { codigo: '66_mais', rotulo: '66 anos ou mais', ordem: 6 },
  ],
  faixas_imc: [],
  medicamentos: [],
  reacoes_adversas: [],
  opcoes: {
    sexo: [
      { codigo: 'feminino', rotulo: 'Feminino' },
      { codigo: 'masculino', rotulo: 'Masculino' },
      { codigo: 'intersexo', rotulo: 'Intersexo' },
      { codigo: 'nao_informado', rotulo: 'Não informado' },
    ],
    tabagismo: [],
    gestacao_lactacao: [],
    funcao_renal: [],
    funcao_hepatica: [],
    uso_substancias: [],
    via: [],
    gravidade: [],
    status_tratamento: [],
    unidades_dose: ['mg'],
  },
};

export const catalogoTeste = () => criarCatalogo(REFERENCIAS_TESTE);
