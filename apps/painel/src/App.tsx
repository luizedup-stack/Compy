import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { lerSessao, limparSessao } from './api';
import EnviarPlanilha from './EnviarPlanilha';
import Login from './Login';

function RotaProtegida({ children }: { children: ReactNode }) {
  return lerSessao() ? <>{children}</> : <Navigate to="/entrar" replace />;
}

function Cabecalho() {
  const navigate = useNavigate();
  useLocation(); // refaz a leitura da sessão a cada troca de tela
  const logado = lerSessao() !== null;

  function sair() {
    limparSessao();
    navigate('/entrar', { replace: true });
  }

  return (
    <header className="cabecalho">
      <div className="marca">
        <img src="/icone-bolso-certo.svg" alt="" width="32" height="32" />
        <span>
          Bolso Certo <small>Painel do mercado</small>
        </span>
      </div>
      {logado && (
        <button type="button" className="botao botao-secundario" onClick={sair}>
          Sair
        </button>
      )}
    </header>
  );
}

export default function App() {
  return (
    <>
      <Cabecalho />
      <main className="conteudo">
        <Routes>
          <Route path="/entrar" element={<Login />} />
          <Route
            path="/planilha"
            element={
              <RotaProtegida>
                <EnviarPlanilha />
              </RotaProtegida>
            }
          />
          <Route path="*" element={<Navigate to="/planilha" replace />} />
        </Routes>
      </main>
    </>
  );
}
