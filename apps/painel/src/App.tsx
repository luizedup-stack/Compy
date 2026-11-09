// Estrutura do painel "Compy Mercado": cabeçalho (nome, menu, seletor de mercado, sair) e as rotas das telas.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Mercados from './admin/Mercados';
import {
  EVENTO_LISTA_ATUALIZADA,
  EVENTO_MERCADOS_MUDARAM,
  guardarMercadoEscolhido,
  lerMercadoEscolhido,
  lerMeusMercadosGuardados,
  lerSessao,
  limparSessao,
  type Papel,
  type ResumoDoMercado,
} from './api';
import CadastrarMercado from './CadastrarMercado';
import Cobranca from './Cobranca';
import EnviarPlanilha from './EnviarPlanilha';
import EsqueciSenha from './EsqueciSenha';
import Login from './Login';
import MeuMercado from './MeuMercado';
import Produtos from './Produtos';
import Marca from './Marca';
import { escolherTema, temaEmUso, type Tema } from './tema';

/** Botão do cabeçalho que alterna entre o tema claro e o escuro (fica guardado neste navegador). */
function AlternarTema() {
  const [tema, setTema] = useState<Tema>(temaEmUso);
  const escuro = tema === 'escuro';
  return (
    <button
      type="button"
      className="botao-tema"
      aria-pressed={escuro}
      onClick={() => {
        const novo: Tema = escuro ? 'claro' : 'escuro';
        escolherTema(novo);
        setTema(novo);
      }}
    >
      {escuro ? '☀️ Modo claro' : '🌙 Modo escuro'}
    </button>
  );
}

/** Sem sessão volta para o login; com `papel`, quem tem outro papel cai em /produtos. */
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

/**
 * Seletor "Mercado:" do topo, só para quem tem MAIS DE UM mercado (usuário de mercado). Trocar de mercado muda o mercado
 * de todas as telas (Produtos, Planilha, Meu mercado...): `aoTrocar` faz o conteúdo recarregar.
 */
function SeletorDeMercado({ aoTrocar }: { aoTrocar: () => void }) {
  const [lista, setLista] = useState<ResumoDoMercado[]>([]);
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const papel = lerSessao()?.papel;

  // Lê a última lista recebida do servidor (guardada ao entrar, ao abrir "Meu mercado" e ao cadastrar um mercado);
  // o cabeçalho não faz chamada própria.
  const carregar = useCallback(() => {
    if (papel !== 'mercado') return;
    const meus = lerMeusMercadosGuardados();
    // O mercado guardado precisa ser um dos meus; senão volta para o primeiro.
    const guardado = lerMercadoEscolhido();
    const valido = meus.some((m) => m.id === guardado) ? guardado : (meus[0]?.id ?? null);
    if (valido !== guardado) guardarMercadoEscolhido(valido);
    setLista(meus);
    setEscolhido(valido);
  }, [papel]);

  useEffect(() => {
    carregar();
    window.addEventListener(EVENTO_MERCADOS_MUDARAM, carregar);
    window.addEventListener(EVENTO_LISTA_ATUALIZADA, carregar);
    return () => {
      window.removeEventListener(EVENTO_MERCADOS_MUDARAM, carregar);
      window.removeEventListener(EVENTO_LISTA_ATUALIZADA, carregar);
    };
  }, [carregar]);

  if (lista.length < 2) return null;
  return (
    <label className="seletor-mercado-topo">
      Mercado:{' '}
      <select
        value={escolhido ?? ''}
        onChange={(e) => {
          const id = Number(e.target.value);
          guardarMercadoEscolhido(id);
          setEscolhido(id);
          aoTrocar();
        }}
      >
        {lista.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nome}
          </option>
        ))}
      </select>
    </label>
  );
}

function Cabecalho({ aoTrocarMercado }: { aoTrocarMercado: () => void }) {
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
        <Marca />
      </div>
      <AlternarTema />
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
          <SeletorDeMercado aoTrocar={aoTrocarMercado} />
          <button type="button" className="botao botao-secundario" onClick={sair}>
            Sair
          </button>
        </>
      )}
    </header>
  );
}

export default function App() {
  // Sobe a cada troca/cadastro de mercado: o conteúdo (`main`) é recriado e as telas carregam os dados do mercado certo.
  const [versaoDoMercado, setVersaoDoMercado] = useState(0);
  const recarregarTelas = useCallback(() => setVersaoDoMercado((v) => v + 1), []);

  useEffect(() => {
    window.addEventListener(EVENTO_MERCADOS_MUDARAM, recarregarTelas);
    return () => window.removeEventListener(EVENTO_MERCADOS_MUDARAM, recarregarTelas);
  }, [recarregarTelas]);

  return (
    <>
      <Cabecalho aoTrocarMercado={recarregarTelas} />
      <main className="conteudo" key={versaoDoMercado}>
        <Routes>
          <Route path="/entrar" element={<Login />} />
          {/* Pública: o mercado cria a conta só com e-mail e senha (sem confirmação de e-mail). */}
          <Route path="/cadastrar" element={<CadastrarMercado />} />
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
