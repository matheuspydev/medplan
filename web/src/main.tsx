// Fonte (SIL OFL 1.1, auto-hospedada): Inter variável com eixo óptico. Em aparelhos Apple vale a do sistema.
import '@fontsource-variable/inter/opsz.css';
import './styles/tokens.css';
import './styles/base.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ReferenciasProvider } from './api/referencias';
import { App } from './app/App';
import { normalizarUrlInicial } from './app/rotas';
import { aplicarTema, lerTemaSalvo, TemaProvider } from './app/tema';

// Antes do primeiro render: evita piscar o tema errado e corrige "/" para "/consulta".
aplicarTema(lerTemaSalvo());
normalizarUrlInicial();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TemaProvider>
      <ReferenciasProvider>
        <App />
      </ReferenciasProvider>
    </TemaProvider>
  </StrictMode>,
);
