/**
 * Tela /registro — Registro de caso.
 *
 * Título + chave pseudônima (gerada no servidor) · nota de privacidade (fixa) ·
 * formulário (Perfil, Tratamentos) + resumo lateral, ou, depois de salvar, a confirmação
 * CASO REGISTRADO e os casos recentes. Dados sintéticos; nenhum campo identificável ou de texto livre.
 */
import { Lock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ComReferencias } from '../../api/referencias';
import type { CasoCriado } from '../../api/types';
import { navegar } from '../../app/rotas';
import { CasoRegistrado } from './CasoRegistrado';
import { FormularioCaso } from './FormularioCaso';
import type { Rascunho } from './modelo';
import { fragmentoConsulta, montarPayload } from './payload';
import './registro.css';

interface Registrado {
  criado: CasoCriado;
  enviado: Rascunho;
}

export default function RegistroPage() {
  const [registrado, setRegistrado] = useState<Registrado | null>(null);
  const [anuncio, setAnuncio] = useState('');
  const refTituloTela = useRef<HTMLHeadingElement>(null);
  const refTituloConfirmacao = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (registrado) refTituloConfirmacao.current?.focus();
  }, [registrado]);

  function aoRegistrar(criado: CasoCriado, enviado: Rascunho) {
    setRegistrado({ criado, enviado });
    setAnuncio(`Caso ${criado.chave_pseudonima} registrado.`);
    window.scrollTo(0, 0);
  }

  function novoCaso() {
    setRegistrado(null);
    setAnuncio('');
    refTituloTela.current?.focus();
  }

  return (
    <div className="registro">
      <header className="registro__topo">
        <p className="registro__sobre">Registro de caso</p>
        <h1 ref={refTituloTela} tabIndex={-1} className="titulo-tela">
          Um tratamento, do início ao desfecho.
        </h1>
        <p className="registro__sub">Cada caso registrado passa a contar nas consultas desta base.</p>
        <div className="registro__chave">
          <span id="reg-chave-rotulo" className="micro">
            Chave pseudônima
          </span>
          <output aria-labelledby="reg-chave-rotulo" className={registrado ? 'registro__chave-poco code' : 'registro__chave-poco registro__chave-poco--vazio'}>
            {registrado ? registrado.criado.chave_pseudonima : 'gerada ao salvar'}
          </output>
        </div>
      </header>

      <div className="aviso-privacidade" role="note" aria-labelledby="reg-privacidade-rotulo">
        <span className="aviso-privacidade__icone" aria-hidden="true">
          <Lock size={14} />
        </span>
        <p>
          <strong id="reg-privacidade-rotulo" className="aviso-privacidade__rotulo">
            Privacidade
          </strong>{' '}
          Esta ficha não pede nome, CPF, prontuário, data de nascimento nem endereço. Neste protótipo, registre apenas casos fictícios.
        </p>
      </div>

      <p className="sr-only" aria-live="polite">
        {anuncio}
      </p>

      <ComReferencias>
        {(catalogo) =>
          registrado ? (
            <CasoRegistrado
              ref={refTituloConfirmacao}
              catalogo={catalogo}
              criado={registrado.criado}
              perfil={montarPayload(registrado.enviado).perfil}
              enviado={registrado.enviado}
              onNovoCaso={novoCaso}
              onConsultarPerfil={() => navegar('/consulta', fragmentoConsulta(montarPayload(registrado.enviado).perfil))}
            />
          ) : (
            <FormularioCaso catalogo={catalogo} onRegistrado={aoRegistrar} />
          )
        }
      </ComReferencias>
    </div>
  );
}
