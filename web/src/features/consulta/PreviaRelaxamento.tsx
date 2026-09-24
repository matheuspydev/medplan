/**
 * Estado inicial: prévia ao vivo, derivada do catálogo, da ordem em que a escada ignoraria critérios
 * para o perfil informado. Nada é calculado sobre a base.
 */
import type { Catalogo } from '../../api/referencias';
import { formatarInteiro } from '../../lib/format';
import { LinkMetodologia } from '../metodologia/contexto';
import type { Formulario } from './formulario';
import { previaRelaxamento } from './previa';
import { grupoDaSubstituicao, ValorSubstituido } from './ValorSubstituido';

export function PreviaRelaxamento({ form, catalogo }: { form: Formulario; catalogo: Catalogo }) {
  const itens = previaRelaxamento(form, catalogo);
  const faixa = form.faixa ? catalogo.faixaEtaria(form.faixa)?.rotulo : null;
  const sexo = form.sexo ? catalogo.rotuloOpcao('sexo', form.sexo).toLowerCase() : null;
  const comorbidades = form.com.length === 0 ? 'sem comorbidades' : `com ${form.com.join(', ')}`;

  return (
    <section className="previa" aria-labelledby="previa-titulo">
      <h2 id="previa-titulo" className="previa__titulo">
        Se faltarem casos, o sistema ignora nesta ordem
      </h2>
      <p className="previa__sub">
        Para no primeiro nível em que algum medicamento atinge n mínimo {formatarInteiro(form.nmin)}.{' '}
        <LinkMetodologia ancora="coorte">Como funciona</LinkMetodologia>
      </p>

      <ol className="previa__lista">
        <li className="previa__item">
          <span className="previa__nivel">0</span>
          <span className="previa__criterio">Perfil completo</span>
          <span className="previa__valor">
            <span className="code">{form.dx ?? '—'}</span> · {sexo ?? '—'} · {faixa ?? '—'} · {comorbidades}
          </span>
        </li>
        {itens.map((item) => (
          <li key={item.nivel} className="previa__item">
            <span className="previa__nivel">{item.nivel}</span>
            <span className="previa__criterio">Ignora {item.criterio}</span>
            <span className="previa__valor">
              <ValorSubstituido criterio={item.criterio} informado={item.valor_informado} usado={item.valor_usado} />
              {item.codigos_grupo &&
                (item.grupo_amplia ? (
                  <span className="previa__codigos">{item.codigos_grupo.join(' ')}</span>
                ) : (
                  <span className="previa__codigos">
                    o grupo {grupoDaSubstituicao(item.valor_usado!)} contém só {item.codigos_grupo.join(' ')}
                  </span>
                ))}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
