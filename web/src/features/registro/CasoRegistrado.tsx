/**
 * Depois do 201: confirmação (sem verde), chave com copiar, linha-resumo,
 * alertas não bloqueantes devolvidos pelo servidor e a tabela de casos recentes deste hospital.
 */
import { CircleCheck, Copy } from 'lucide-react';
import { forwardRef, useEffect, useState } from 'react';
import { ErroApi, listarCasos } from '../../api/client';
import type { Catalogo } from '../../api/referencias';
import type { CasoCriado, CasoEntrada, CasoResumo, ErroCampo } from '../../api/types';
import { Button } from '../../components/Button';
import { LoadingLine } from '../../components/LoadingLine';
import { PainelFalha } from '../../components/PainelFalha';
import { formatarDataHora, plural } from '../../lib/format';
import { chaveDoCampoServidor, descreverChave, type Rascunho } from './modelo';
import { NotaConsistencia } from './NotaConsistencia';

/** "Feminino" -> "feminino": sexo sempre por extenso (nunca "F", que se confunde com código CID). */
function sexoPorExtenso(catalogo: Catalogo, codigo: string): string {
  return catalogo.rotuloOpcao('sexo', codigo).toLowerCase();
}

interface Props {
  catalogo: Catalogo;
  criado: CasoCriado;
  perfil: CasoEntrada['perfil'];
  enviado: Rascunho;
  onNovoCaso: () => void;
  onConsultarPerfil: () => void;
}

export const CasoRegistrado = forwardRef<HTMLHeadingElement, Props>(function CasoRegistrado(
  { catalogo, criado, perfil, enviado, onNovoCaso, onConsultarPerfil },
  refTitulo,
) {
  const [copia, setCopia] = useState<'' | 'copiada' | 'falhou'>('');

  async function copiar() {
    try {
      await navigator.clipboard.writeText(criado.chave_pseudonima);
      setCopia('copiada');
    } catch {
      setCopia('falhou');
    }
  }

  const resumo = [
    perfil.cid10_principal,
    sexoPorExtenso(catalogo, perfil.sexo),
    catalogo.faixaEtaria(perfil.faixa_etaria_cod)?.rotulo ?? perfil.faixa_etaria_cod,
    plural(criado.tratamentos, 'tratamento', 'tratamentos'),
    plural(criado.reacoes, 'reação adversa', 'reações adversas'),
    formatarDataHora(criado.criado_em),
  ];

  const descreverAlerta = (a: ErroCampo) => {
    const chave = a.campo ? chaveDoCampoServidor(a.campo, enviado) : null;
    return chave ? `${descreverChave(chave, enviado)}: ${a.mensagem}` : a.mensagem;
  };

  return (
    <>
      <section className="caso-registrado" aria-labelledby="reg-caso-registrado">
        <span className="caso-registrado__icone" aria-hidden="true">
          <CircleCheck size={28} />
        </span>
        <h2 id="reg-caso-registrado" ref={refTitulo} tabIndex={-1} className="caso-registrado__titulo">
          Caso registrado
        </h2>
        <div className="caso-registrado__chave">
          <span className="micro">Chave pseudônima</span>
          <span className="code caso-registrado__chave-valor">{criado.chave_pseudonima}</span>
          <Button variante="secundario" icone={<Copy size={14} />} onClick={() => void copiar()}>
            Copiar
          </Button>
          <span className="caption" role="status">
            {copia === 'copiada' ? 'Chave copiada.' : copia === 'falhou' ? 'Não foi possível copiar; selecione a chave e copie manualmente.' : ''}
          </span>
        </div>
        <p className="caso-registrado__resumo">{resumo.join(' · ')}</p>
        {criado.alertas.length > 0 && (
          <div className="caso-registrado__alertas">
            <p className="caption">Notas de consistência (não bloqueiam):</p>
            {criado.alertas.map((a, i) => (
              <NotaConsistencia key={i}>{descreverAlerta(a)}</NotaConsistencia>
            ))}
          </div>
        )}
        <div className="caso-registrado__acoes">
          <Button variante="primario" onClick={onNovoCaso}>
            Registrar novo caso
          </Button>
          <Button variante="secundario" onClick={onConsultarPerfil}>
            Consultar este perfil
          </Button>
        </div>
      </section>

      <CasosRecentes catalogo={catalogo} />
    </>
  );
});

function CasosRecentes({ catalogo }: { catalogo: Catalogo }) {
  const [tentativa, setTentativa] = useState(0);
  const [casos, setCasos] = useState<CasoResumo[] | null>(null);
  const [erros, setErros] = useState<ErroCampo[] | null>(null);

  useEffect(() => {
    const controle = new AbortController();
    setErros(null);
    setCasos(null);
    listarCasos(10, controle.signal)
      .then(setCasos)
      .catch((e: unknown) => {
        if (controle.signal.aborted) return;
        setErros(e instanceof ErroApi ? e.erros : [{ campo: '', mensagem: 'Falha ao carregar os casos recentes.' }]);
      });
    return () => controle.abort();
  }, [tentativa]);

  return (
    <section className="casos-recentes" aria-labelledby="reg-casos-recentes">
      <h2 id="reg-casos-recentes" className="casos-recentes__titulo">
        Casos recentes
        <span className="caption">este hospital</span>
      </h2>
      {erros ? (
        <PainelFalha
          titulo="Não foi possível carregar os casos recentes."
          acao={
            <Button variante="secundario" onClick={() => setTentativa((t) => t + 1)}>
              Tentar novamente
            </Button>
          }
        >
          {erros.map((e, i) => (
            <p key={i}>{e.mensagem}</p>
          ))}
        </PainelFalha>
      ) : casos === null ? (
        <LoadingLine ativo rotulo="Carregando casos recentes…" />
      ) : casos.length === 0 ? (
        <p className="casos-recentes__vazio">Nenhum caso registrado nesta base ainda.</p>
      ) : (
        <div className="casos-recentes__rolagem">
          <table className="casos-recentes__tabela texto-tabela">
            <thead>
              <tr>
                <th scope="col" className="micro">Chave</th>
                <th scope="col" className="micro">CID-10</th>
                <th scope="col" className="micro">Sexo</th>
                <th scope="col" className="micro">Faixa</th>
                <th scope="col" className="micro num">Tratamentos</th>
                <th scope="col" className="micro num">Reações</th>
                <th scope="col" className="micro">Registrado</th>
              </tr>
            </thead>
            <tbody>
              {casos.map((c) => (
                <tr key={c.id}>
                  <td className="code">{c.chave_pseudonima}</td>
                  <td className="code">{c.cid10_principal}</td>
                  <td>{sexoPorExtenso(catalogo, c.sexo)}</td>
                  <td>{catalogo.faixaEtaria(c.faixa_etaria_cod)?.rotulo ?? c.faixa_etaria_cod}</td>
                  <td className="num">{c.tratamentos.length}</td>
                  <td className="num">{c.n_reacoes}</td>
                  <td>{formatarDataHora(c.criado_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
