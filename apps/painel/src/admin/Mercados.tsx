import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  criarAcesso,
  listarMercadosAdmin,
  mensagemDoErro,
  removerMercado,
  sessaoRecusada,
  type MercadoAdmin,
} from '../api';

const MSG_COPIA_FALHOU = 'Não foi possível copiar; anote a senha manualmente.';

/** A senha temporária só existe aqui, no estado da linha, enquanto o painel está na tela. */
interface SenhaTemporaria {
  valor: string;
  email: string;
}

interface LinhaProps {
  mercado: MercadoAdmin;
  aoAcessoCriado: (id: number) => void;
  aoRemovido: (id: number) => void;
  aoSessaoRecusada: () => void;
}

function Linha({ mercado, aoAcessoCriado, aoRemovido, aoSessaoRecusada }: LinhaProps) {
  const [formAberto, setFormAberto] = useState(false);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState<SenhaTemporaria | null>(null);
  const [copia, setCopia] = useState<'ok' | 'falhou' | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [erroAcesso, setErroAcesso] = useState<string | null>(null);
  const [erroRemocao, setErroRemocao] = useState<string | null>(null);
  const [acao, setAcao] = useState<'acesso' | 'remocao' | null>(null);
  const ocupado = acao !== null;

  const nome = useRef<HTMLElement>(null);
  const campoEmail = useRef<HTMLInputElement>(null);
  const botaoCriarAcesso = useRef<HTMLButtonElement>(null);
  const painelSenha = useRef<HTMLDivElement>(null);
  const botaoRemover = useRef<HTMLButtonElement>(null);
  const botaoCancelarRemocao = useRef<HTMLButtonElement>(null);
  const idNome = `mercado-nome-${mercado.id}`;
  const idEmail = `mercado-email-${mercado.id}`;
  // Para onde o foco vai quando a linha troca de estado (o botão que o usuário apertou deixa de existir).
  const focoPendente = useRef<RefObject<HTMLElement> | null>(null);
  const temSenha = senha !== null;

  useEffect(() => {
    focoPendente.current?.current?.focus();
    focoPendente.current = null;
  }, [formAberto, confirmando, temSenha]);

  const ativo = mercado.status === 'ativo';

  function abrirFormulario() {
    setErroAcesso(null);
    focoPendente.current = campoEmail;
    setFormAberto(true);
  }

  function cancelarFormulario() {
    setErroAcesso(null);
    setEmail('');
    focoPendente.current = botaoCriarAcesso;
    setFormAberto(false);
  }

  async function enviarAcesso(evento: FormEvent) {
    evento.preventDefault();
    if (ocupado) return;
    const emailInformado = email.trim();
    setErroAcesso(null);
    setAcao('acesso');
    try {
      const { senhaTemporaria } = await criarAcesso(mercado.id, emailInformado);
      setCopia(null);
      setSenha({ valor: senhaTemporaria, email: emailInformado });
      setEmail('');
      focoPendente.current = painelSenha;
      setFormAberto(false);
      aoAcessoCriado(mercado.id);
    } catch (e) {
      if (sessaoRecusada(e)) aoSessaoRecusada();
      else setErroAcesso(mensagemDoErro(e));
    } finally {
      setAcao(null);
    }
  }

  async function copiarSenha() {
    if (!senha) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('sem área de transferência');
      await navigator.clipboard.writeText(senha.valor);
      setCopia('ok');
    } catch {
      setCopia('falhou');
    }
  }

  function fecharSenha() {
    setSenha(null);
    setCopia(null);
    focoPendente.current = nome;
  }

  function pedirRemocao() {
    setErroRemocao(null);
    focoPendente.current = botaoCancelarRemocao;
    setConfirmando(true);
  }

  function cancelarRemocao() {
    setErroRemocao(null);
    focoPendente.current = botaoRemover;
    setConfirmando(false);
  }

  async function remover() {
    if (ocupado) return;
    setErroRemocao(null);
    setAcao('remocao');
    try {
      await removerMercado(mercado.id);
      focoPendente.current = nome; // os botões somem; o foco fica no nome do mercado
      setConfirmando(false);
      aoRemovido(mercado.id);
    } catch (e) {
      if (sessaoRecusada(e)) aoSessaoRecusada();
      else setErroRemocao(mensagemDoErro(e));
    } finally {
      setAcao(null);
    }
  }

  const mostraFormulario = !senha && !mercado.temLogin && ativo && formAberto;

  return (
    <tr>
      <td data-label="Mercado">
        <div>
          <strong id={idNome} ref={nome} tabIndex={-1}>
            {mercado.nome}
          </strong>
          <span className="endereco">{mercado.endereco}</span>
        </div>
      </td>
      <td data-label="Situação">{ativo ? 'Ativo' : 'Removido'}</td>
      <td data-label="Produtos">{mercado.totalProdutos}</td>
      <td data-label="Acesso" className={senha || mostraFormulario ? 'acoes' : undefined}>
        {senha && (
          <div role="status" className="aviso aviso-ok senha-painel" tabIndex={-1} ref={painelSenha}>
            <p>
              Acesso criado para <strong>{senha.email}</strong>. Senha temporária:
            </p>
            <p>
              <code className="senha-temporaria">{senha.valor}</code>
            </p>
            <p className="confirmacao">Anote agora: esta senha não será mostrada de novo.</p>
            <div className="acoes-botoes">
              <button
                type="button"
                className="botao botao-secundario botao-pequeno"
                aria-describedby={idNome}
                onClick={copiarSenha}
              >
                Copiar senha
              </button>
              <button
                type="button"
                className="botao botao-pequeno"
                aria-describedby={idNome}
                onClick={fecharSenha}
              >
                Fechar
              </button>
            </div>
            {copia === 'ok' && <p>Senha copiada.</p>}
            {copia === 'falhou' && <p>{MSG_COPIA_FALHOU}</p>}
          </div>
        )}
        {!senha && mercado.temLogin && 'Já tem acesso'}
        {!senha && !mercado.temLogin && !ativo && 'Sem acesso'}
        {!senha && !mercado.temLogin && ativo && !formAberto && (
          <button
            ref={botaoCriarAcesso}
            type="button"
            className="botao botao-secundario botao-pequeno"
            aria-describedby={idNome}
            disabled={ocupado}
            onClick={abrirFormulario}
          >
            Criar acesso
          </button>
        )}
        {mostraFormulario && (
          <form onSubmit={enviarAcesso} noValidate>
            <label htmlFor={idEmail}>E-mail do mercado</label>
            <input
              id={idEmail}
              ref={campoEmail}
              type="email"
              inputMode="email"
              autoComplete="off"
              aria-describedby={idNome}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div className="acoes-botoes">
              <button type="submit" className="botao botao-pequeno" aria-describedby={idNome} disabled={ocupado}>
                {acao === 'acesso' ? 'Criando…' : 'Criar'}
              </button>
              <button
                type="button"
                className="botao botao-secundario botao-pequeno"
                aria-describedby={idNome}
                disabled={ocupado}
                onClick={cancelarFormulario}
              >
                Cancelar
              </button>
            </div>
            {erroAcesso && (
              <p role="alert" className="aviso aviso-erro">
                {erroAcesso}
              </p>
            )}
          </form>
        )}
      </td>
      <td data-label="Ações" className="acoes">
        {ativo && !confirmando && (
          <div className="acoes-botoes">
            <button
              ref={botaoRemover}
              type="button"
              className="botao botao-secundario botao-pequeno"
              aria-describedby={idNome}
              disabled={ocupado}
              onClick={pedirRemocao}
            >
              Remover
            </button>
          </div>
        )}
        {ativo && confirmando && (
          <div role="group" aria-label="Confirmar remoção">
            <p className="confirmacao">
              Remover este mercado? Os dados são mantidos, mas ele deixa de aparecer no aplicativo.
            </p>
            <div className="acoes-botoes">
              <button
                type="button"
                className="botao botao-perigo botao-pequeno"
                aria-describedby={idNome}
                disabled={ocupado}
                onClick={remover}
              >
                Confirmar remoção
              </button>
              <button
                ref={botaoCancelarRemocao}
                type="button"
                className="botao botao-secundario botao-pequeno"
                aria-describedby={idNome}
                disabled={ocupado}
                onClick={cancelarRemocao}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
        {erroRemocao && (
          <p role="alert" className="aviso aviso-erro">
            {erroRemocao}
          </p>
        )}
      </td>
    </tr>
  );
}

export default function Mercados() {
  const navigate = useNavigate();
  const [mercados, setMercados] = useState<MercadoAdmin[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro(null);
    listarMercadosAdmin().then(
      (lista) => {
        if (!ativo) return;
        setMercados(lista);
        setCarregando(false);
      },
      (e: unknown) => {
        if (!ativo) return;
        if (sessaoRecusada(e)) {
          navigate('/entrar', { replace: true });
          return;
        }
        setErro(mensagemDoErro(e));
        setCarregando(false);
      },
    );
    return () => {
      ativo = false;
    };
  }, [tentativa, navigate]);

  // Atualizações funcionais: ações em linhas diferentes, ao mesmo tempo, não podem desfazer uma à outra.
  const aoAcessoCriado = (id: number) =>
    setMercados((lista) => lista.map((m) => (m.id === id ? { ...m, temLogin: true } : m)));
  const aoRemovido = (id: number) =>
    setMercados((lista) => lista.map((m) => (m.id === id ? { ...m, status: 'removido' } : m)));
  const aoSessaoRecusada = () => navigate('/entrar', { replace: true });

  return (
    <section className="cartao cartao-largo">
      <h1>Mercados</h1>
      <p>
        Para adicionar um mercado, envie a planilha dele em <Link to="/planilha">Enviar planilha</Link>.
      </p>

      {carregando && <p>Carregando mercados…</p>}

      {!carregando && erro && (
        <>
          <p role="alert" className="aviso aviso-erro">
            {erro}
          </p>
          <p>
            <button type="button" className="botao botao-secundario" onClick={() => setTentativa((t) => t + 1)}>
              Tentar de novo
            </button>
          </p>
        </>
      )}

      {!carregando && !erro && mercados.length === 0 && (
        <div className="vazio">
          <p>Nenhum mercado ainda. Envie uma planilha.</p>
          <Link to="/planilha" className="botao botao-link">
            Enviar planilha
          </Link>
        </div>
      )}

      {!carregando && !erro && mercados.length > 0 && (
        <div className="tabela-rolagem">
          <table className="tabela-produtos tabela-mercados">
            <caption className="so-leitor">Mercados cadastrados</caption>
            <thead>
              <tr>
                <th scope="col">Mercado</th>
                <th scope="col">Situação</th>
                <th scope="col">Produtos</th>
                <th scope="col">Acesso</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>
              {mercados.map((m) => (
                <Linha
                  key={m.id}
                  mercado={m}
                  aoAcessoCriado={aoAcessoCriado}
                  aoRemovido={aoRemovido}
                  aoSessaoRecusada={aoSessaoRecusada}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
