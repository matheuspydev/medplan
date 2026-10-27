/**
 * Adicionar medicamento à lista de referência (POST /medicamentos). Para quando a carga rejeita
 * um código ATC por estar fora do vocabulário. Código e classe vêm do Índice ATC/DDD da OMS,
 * informados por quem cadastra; a classe é uma das já cadastradas.
 */
import { useState } from 'react';
import { adicionarMedicamento, ErroApi } from '../../api/client';
import type { Catalogo } from '../../api/referencias';
import type { Medicamento, MedicamentoEntrada } from '../../api/types';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { PainelFalha } from '../../components/PainelFalha';
import { PainelMedicao } from '../../components/PainelMedicao';

/** Espelho de catalogo.FORMATO_ATC: nível 5, 7 caracteres. */
const FORMATO_ATC = /^[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$/;

type Campo = keyof MedicamentoEntrada;

function validar(m: MedicamentoEntrada): Partial<Record<Campo, string>> {
  const erros: Partial<Record<Campo, string>> = {};
  if (!FORMATO_ATC.test(m.codigo_atc)) erros.codigo_atc = 'Informe o código ATC completo (7 caracteres).';
  if (!m.principio_ativo.trim()) erros.principio_ativo = 'Informe o princípio ativo.';
  if (!m.classe_terapeutica) erros.classe_terapeutica = 'Escolha a classe terapêutica.';
  return erros;
}

export function AdicionarMedicamento({
  catalogo,
  onAdicionado,
  onCancelar,
}: {
  catalogo: Catalogo;
  onAdicionado: (m: Medicamento) => void;
  onCancelar: () => void;
}) {
  const [m, setM] = useState<MedicamentoEntrada>({ codigo_atc: '', principio_ativo: '', classe_terapeutica: '' });
  const [tentou, setTentou] = useState(false);
  const [servidor, setServidor] = useState<Partial<Record<Campo, string>>>({});
  const [geral, setGeral] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const classes = [...new Set(catalogo.referencias.medicamentos.map((x) => x.classe_terapeutica))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const locais = validar(m);
  const erro = (c: Campo) => (tentou ? locais[c] : undefined) ?? servidor[c] ?? null;

  function mudar(c: Campo, valor: string) {
    setM((x) => ({ ...x, [c]: valor }));
    setServidor(({ [c]: _removido, ...resto }) => resto);
  }

  async function adicionar() {
    setTentou(true);
    setGeral(null);
    if (Object.keys(locais).length || salvando) return;
    setSalvando(true);
    try {
      onAdicionado(await adicionarMedicamento(m));
    } catch (e) {
      const erros = e instanceof ErroApi ? e.erros : [{ campo: '', mensagem: 'Falha inesperada ao adicionar.' }];
      setServidor(Object.fromEntries(erros.filter((x) => x.campo in m).map((x) => [x.campo, x.mensagem])));
      setGeral(erros.filter((x) => !(x.campo in m)).map((x) => x.mensagem).join(' ') || null);
      setSalvando(false);
    }
  }

  return (
    <PainelMedicao
      titulo="Adicionar medicamento à lista de referência"
      subtitulo='Use quando um medicamento novo aparece nos atendimentos e a carga o rejeita por "código fora do vocabulário". Não é prescrição nem dado de paciente.'
      densidade="formulario"
    >
      <div className="adicionar-medicamento">
        <Field id="med-codigo_atc" rotulo="Código ATC" obrigatorio ajuda="Nível 5 do ATC, 7 caracteres. É a chave usada no CSV." erro={erro('codigo_atc')}>
          {(a11y) => (
            <input
              {...a11y}
              className="controle-texto mono"
              value={m.codigo_atc}
              maxLength={7}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => mudar('codigo_atc', e.target.value.toUpperCase().trim())}
            />
          )}
        </Field>
        <Field id="med-principio_ativo" rotulo="Princípio ativo" obrigatorio erro={erro('principio_ativo')}>
          {(a11y) => (
            <input {...a11y} className="controle-texto" value={m.principio_ativo} maxLength={80} onChange={(e) => mudar('principio_ativo', e.target.value)} />
          )}
        </Field>
        <Field id="med-classe_terapeutica" rotulo="Classe terapêutica" obrigatorio erro={erro('classe_terapeutica')}>
          {(a11y) => (
            <select {...a11y} className="controle-texto" value={m.classe_terapeutica} onChange={(e) => mudar('classe_terapeutica', e.target.value)}>
              <option value="">Selecione…</option>
              {classes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="campo">
          <span className="adicionar-medicamento__rotulo">Fonte do código</span>
          <p>Índice ATC/DDD da OMS</p>
          <p className="texto-apoio">O código e a classe vêm de fonte citada, nunca de memória.</p>
        </div>
      </div>
      {geral && <PainelFalha titulo="Não foi possível adicionar.">{geral}</PainelFalha>}
      <div className="adicionar-medicamento__acoes">
        <Button variante="secundario" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button variante="primario" onClick={() => void adicionar()} disabled={salvando}>
          {salvando ? 'Adicionando…' : 'Adicionar à lista'}
        </Button>
      </div>
    </PainelMedicao>
  );
}
