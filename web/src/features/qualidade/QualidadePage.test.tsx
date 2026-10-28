import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DetalheCarga, Qualidade, ResumoCarga } from '../../api/types';
import { montarPainel } from '../../lib/teste-paineis';
import QualidadePage from './QualidadePage';

// SINTÉTICO: contagens de layout e nomes de arquivo fictícios.
const resumo = (id: number, m: Partial<ResumoCarga> = {}): ResumoCarga => ({
  id,
  criado_em: '2026-10-25T12:00:00+00:00',
  arquivo_atendimentos: `atendimentos_${id}.csv`,
  arquivo_reacoes: null,
  linhas_informadas: null,
  lidas: 10,
  aceitas: 8,
  rejeitadas: 2,
  lidas_atendimentos: 10,
  situacao: 'com_rejeicoes',
  motivo_recusa: null,
  ...m,
});

const MOTIVOS = [
  { motivo: 'incompleto', rotulo: 'Registro incompleto' },
  { motivo: 'vocabulario', rotulo: 'Código fora do vocabulário' },
] as const;

const detalhe = (id: number, m: Partial<DetalheCarga> = {}): DetalheCarga => ({
  ...resumo(id),
  motivos: [
    { ...MOTIVOS[0], n: 1 },
    { ...MOTIVOS[1], n: 1 },
  ],
  reconciliacao: [{ entidade: 'Atendimentos', origem: 10, banco: 8, diferenca: -2, rejeitadas: 2, situacao: 'explicada' }],
  rejeicoes: [
    { arquivo: 'atendimentos', linha: 3, campo: 'faixa_etaria_cod', motivo: 'incompleto', mensagem: 'Campo obrigatório vazio.' },
    { arquivo: 'atendimentos', linha: 7, campo: 'codigo_atc', motivo: 'vocabulario', mensagem: 'Código ATC fora da lista de referência.' },
  ],
  n_rejeicoes: 2,
  ...m,
});

const qualidade = (cargas: ResumoCarga[]): Qualidade => ({
  cargas,
  n_cargas: cargas.length,
  integridade: [
    { verificacao: 'Chaves de dimensão sem correspondência', n: 0 },
    { verificacao: 'Datas fora de ordem (início, atendimento, reação)', n: 2 },
  ],
  base: { n_atendimentos: 300, n_pacientes: 120 },
  motivos: [...MOTIVOS],
});

afterEach(() => vi.unstubAllGlobals());

describe('Qualidade dos dados', () => {
  it('histórico, detalhe da carga sem valor gravado, reconciliação e integridade', async () => {
    const pedidos = montarPainel(<QualidadePage />, {
      '/qualidade': qualidade([resumo(2, { linhas_informadas: 12 }), resumo(1, { situacao: 'recusada', aceitas: 0, rejeitadas: 10 })]),
      '/qualidade/cargas/2': detalhe(2),
      '/qualidade/cargas/1': detalhe(1, { situacao: 'recusada', motivo_recusa: 'atendimentos_1.csv: coluna fora do modelo (nome).', n_rejeicoes: 0, rejeicoes: [] }),
    });
    expect(await screen.findByText('Campo obrigatório vazio.')).toBeTruthy();
    expect(screen.getByText('de 10 linhas lidas')).toBeTruthy();
    expect(screen.getByText('· faltam 2')).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Valor' })).toBeNull();
    expect(screen.getByText('Explicada pelas linhas rejeitadas')).toBeTruthy();
    expect(screen.getByText('2 a conferir')).toBeTruthy();
    expect(pedidos.map((p) => p.caminho)).toEqual(['/qualidade', '/qualidade/cargas/2']);

    fireEvent.click(screen.getAllByRole('button', { name: /25\/10\/2026/ })[1]);
    expect(await screen.findByText(/coluna fora do modelo \(nome\)/)).toBeTruthy();
    expect(screen.getByText('Carga não processada.')).toBeTruthy();
  });

  it('envio: lê os arquivos no navegador, manda o texto no corpo e mostra o valor recusado só nesta resposta', async () => {
    const pedidos = montarPainel(<QualidadePage />, {
      '/qualidade': qualidade([]),
      '/cargas': detalhe(3, {
        rejeicoes: [{ arquivo: 'atendimentos', linha: 2, campo: 'status', motivo: 'dominio', mensagem: 'Valor fora da lista permitida.', valor: 'suspenso' }],
        n_rejeicoes: 1,
      }),
    });
    expect(await screen.findByText('Nenhuma carga enviada ainda.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar CSV' }));
    const painel = within(screen.getByRole('button', { name: 'Enviar carga' }).closest('section')!);
    const conteudo = 'chave_pseudonima;sexo\nREG-TESTE01;feminino\n';
    fireEvent.change(painel.getByLabelText('atendimentos.csv (obrigatório)'), {
      target: { files: [new File([conteudo], 'atendimentos.csv', { type: 'text/csv' })] },
    });
    fireEvent.change(painel.getByLabelText('Linhas de atendimento informadas pela origem (opcional)'), { target: { value: '1' } });
    await act(async () => fireEvent.click(painel.getByRole('button', { name: 'Enviar carga' })));

    expect(pedidos.find((p) => p.caminho === '/cargas')?.corpo).toEqual({
      atendimentos: { nome: 'atendimentos.csv', conteudo },
      linhas_informadas: 1,
    });
    expect(await screen.findByRole('columnheader', { name: 'Valor' })).toBeTruthy();
    expect(screen.getByText('suspenso')).toBeTruthy();
    expect(screen.getByText('O valor recusado aparece só agora, logo após o envio: ele não é gravado.')).toBeTruthy();
  });
});
