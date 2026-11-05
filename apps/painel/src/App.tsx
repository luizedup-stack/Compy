import type { ReactNode } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Mercados from './admin/Mercados';
import { lerSessao, limparSessao, type Papel } from './api';
import Cobranca from './Cobranca';
import EnviarPlanilha from './EnviarPlanilha';
import EsqueciSenha from './EsqueciSenha';
import Login from './Login';
import MeuMercado from './MeuMercado';
import Produtos from './Produtos';

/** Sem sessão volta para o login; com `papel`, quem tem outro papel cai em /planilha. */
function RotaProtegida({ children, papel }: { children: ReactNode; papel?: Papel }) {
  const sessao = lerSessao();
  if (!sessao) return <Navigate to="/entrar" replace />;
  if (papel && sessao.papel !== papel) return <Navigate to="/produtos" replace />;
  return <>{children}</>;
}

const ITENS_MERCADO = [
  { para: '/produtos', texto: 'Produtos' },
  { para: '/planilha', texto: 'Enviar planilha' },
  { para: '/meu-mercado', texto: 'Meu mercado' },
  { para: '/cobranca', texto: 'Cobrança' },
];
const ITENS_ADMIN = [
  { para: '/produtos', texto: 'Produtos' },
  { para: '/planilha', texto: 'Enviar planilha' },
  { para: '/admin/mercados', texto: 'Administração' },
];

function Cabecalho() {
  const navigate = useNavigate();
  useLocation(); // refaz a leitura da sessão a cada troca de tela
  const sessao = lerSessao();
  const itens = sessao?.papel === 'mercado' ? ITENS_MERCADO : sessao ? ITENS_ADMIN : [];

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
      {sessao && (
        <>
          <nav aria-label="Principal" className="navegacao">
            <ul>
              {itens.map((item) => (
                <li key={item.para}>
                  <NavLink to={item.para}>{item.texto}</NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <button type="button" className="botao botao-secundario" onClick={sair}>
            Sair
          </button>
        </>
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
          {/* Pública, como /entrar: quem está logado também pode abrir. */}
          <Route path="/esqueci-senha" element={<EsqueciSenha />} />
          <Route
            path="/planilha"
            element={
              <RotaProtegida>
                <EnviarPlanilha />
              </RotaProtegida>
            }
          />
          <Route
            path="/produtos"
            element={
              <RotaProtegida>
                <Produtos />
              </RotaProtegida>
            }
          />
          <Route
            path="/meu-mercado"
            element={
              <RotaProtegida papel="mercado">
                <MeuMercado />
              </RotaProtegida>
            }
          />
          <Route
            path="/cobranca"
            element={
              <RotaProtegida papel="mercado">
                <Cobranca />
              </RotaProtegida>
            }
          />
          <Route
            path="/admin/mercados"
            element={
              <RotaProtegida papel="admin">
                <Mercados />
              </RotaProtegida>
            }
          />
          <Route path="*" element={<Navigate to="/produtos" replace />} />
        </Routes>
      </main>
    </>
  );
}
