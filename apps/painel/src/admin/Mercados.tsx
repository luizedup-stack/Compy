import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  apagarMercado,
  criarAcesso,
  listarMercadosAdmin,
  mensagemDoErro,
  reativarMercado,
  removerMercado,
  sessaoRecusada,
  type MercadoAdmin,
  type PrazoSemAcesso,
} from '../api';

const MSG_COPIA_FALHOU = 'Não foi possível copiar; anote a senha manualmente.';

/** A senha temporária só existe aqui, no estado da linha, enquanto o painel está na tela. */
interface SenhaTemporaria {
  valor: string;
  email: string;
}

type Unidade = 'dias' | 'meses' | 'anos';

/** "12/12/2026", no fuso do navegador. */
function dataCurta(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Quanto tempo falta, em palavras simples ("faltam 12 dias"). Só informa; a data exata é a que vale. */
function faltam(iso: string): string {
  const dias = Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
  return dias === 0 ? 'volta hoje' : dias === 1 ? 'falta 1 dia' : `faltam ${dias} dias`;
}

interface LinhaProps {
  mercado: MercadoAdmin;
  aoAcessoCriado: (id: number) => void;
  /** O mercado ficou sem acesso (`ate` = quando volta, ou null se permanente). */
  aoSemAcesso: (id: number, ate: string | null) => void;
  aoReativado: (id: number) => void;
  aoApagado: (id: number) => void;
  aoSessaoRecusada: () => void;
}

/** A data em que o prazo escolhido termina, como o servidor vai calcular (só para mostrar na hora; a lista é recarregada do servidor depois). */
function dataPrevista(quantidade: number, unidade: Unidade): string {
  const d = new Date();
  if (unidade === 'dias') d.setUTCDate(d.getUTCDate() + quantidade);
  else if (unidade === 'meses') d.setUTCMonth(d.getUTCMonth() + quantidade);
  else d.setUTCFullYear(d.getUTCFullYear() + quantidade);
  return d.toISOString();
}

function Linha({ mercado, aoAcessoCriado, aoSemAcesso, aoReativado, aoApagado, aoSessaoRecusada }: LinhaProps) {
  const [formAberto, setFormAberto] = useState(false);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState<SenhaTemporaria | null>(null);
  const [copia, setCopia] = useState<'ok' | 'falhou' | null>(null);
  // O que a linha mostra na coluna Ações: os botões, o formulário de "Tirar acesso" ou a confirmação de "Apagar".
  const [modo, setModo] = useState<'ver' | 'tirar' | 'apagar'>('ver');
  const confirmando = modo !== 'ver';
  const [duracao, setDuracao] = useState<'permanente' | 'temporario'>('permanente');
  const [quantidade, setQuantidade] = useState('30');
  const [unidade, setUnidade] = useState<Unidade>('dias');
  const [erroAcesso, setErroAcesso] = useState<string | null>(null);
  const [erroRemocao, setErroRemocao] = useState<string | null>(null);
  const [acao, setAcao] = useState<'acesso' | 'remocao' | 'reativar' | 'apagar' | null>(null);
  const ocupado = acao !== null;

  const nome = useRef<HTMLElement>(null);
  const campoEmail = useRef<HTMLInputElement>(null);
  const botaoCriarAcesso = useRef<HTMLButtonElement>(null);
  const painelSenha = useRef<HTMLDivElement>(null);
  const botaoTirarAcesso = useRef<HTMLButtonElement>(null);
  const botaoApagar = useRef<HTMLButtonElement>(null);
  const botaoCancelarRemocao = useRef<HTMLButtonElement>(null);
  const idNome = `mercado-nome-${mercado.id}`;
  const idEmail = `mercado-email-${mercado.id}`;
  // Para onde o foco vai quando a linha troca de estado (o botão que o usuário apertou deixa de existir).
  const focoPendente = useRef<RefObject<HTMLElement> | null>(null);
  const temSenha = senha !== null;

  useEffect(() => {
    focoPendente.current?.current?.focus();
    focoPendente.current = null;
  }, [formAberto, modo, temSenha]);

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

  function abrir(novoModo: 'tirar' | 'apagar') {
    setErroRemocao(null);
    focoPendente.current = botaoCancelarRemocao;
    setModo(novoModo);
  }

  function cancelarModo() {
    setErroRemocao(null);
    focoPendente.current = modo === 'apagar' ? botaoApagar : botaoTirarAcesso;
    setModo('ver');
  }

  /** O prazo digitado, ou uma mensagem do que falta acertar. */
  function prazoEscolhido(): { ok: true; prazo: PrazoSemAcesso } | { ok: false; erro: string } {
    if (duracao === 'permanente') return { ok: true, prazo: { tipo: 'permanente' } };
    const n = Number(quantidade);
    if (!/^\d+$/.test(quantidade.trim()) || !Number.isInteger(n) || n < 1) return { ok: false, erro: 'Informe quantos dias, meses ou anos (um número inteiro, de 1 para cima).' };
    const maximo = { dias: 3650, meses: 120, anos: 10 }[unidade];
    if (n > maximo) return { ok: false, erro: `O prazo máximo é ${maximo} ${unidade}.` };
    return { ok: true, prazo: { tipo: 'temporario', quantidade: n, unidade } };
  }

  async function tirarAcesso(evento: FormEvent) {
    evento.preventDefault();
    if (ocupado) return;
    const escolha = prazoEscolhido();
    if (!escolha.ok) {
      setErroRemocao(escolha.erro);
      return;
    }
    setErroRemocao(null);
    setAcao('remocao');
    try {
      await removerMercado(mercado.id, escolha.prazo);
      focoPendente.current = nome; // os botões mudam; o foco fica no nome do mercado
      setModo('ver');
      aoSemAcesso(mercado.id, escolha.prazo.tipo === 'temporario' ? dataPrevista(escolha.prazo.quantidade, escolha.prazo.unidade) : null);
    } catch (e) {
      if (sessaoRecusada(e)) aoSessaoRecusada();
      else setErroRemocao(mensagemDoErro(e));
    } finally {
      setAcao(null);
    }
  }

  async function darAcessoDeNovo() {
    if (ocupado) return;
    setErroRemocao(null);
    setAcao('reativar');
    try {
      await reativarMercado(mercado.id);
      focoPendente.current = nome;
      aoReativado(mercado.id);
    } catch (e) {
      if (sessaoRecusada(e)) aoSessaoRecusada();
      else setErroRemocao(mensagemDoErro(e));
    } finally {
      setAcao(null);
    }
  }

  async function apagar() {
    if (ocupado) return;
    setErroRemocao(null);
    setAcao('apagar');
    try {
      await apagarMercado(mercado.id);
      aoApagado(mercado.id); // a linha some da lista
    } catch (e) {
      if (sessaoRecusada(e)) aoSessaoRecusada();
      else setErroRemocao(mensagemDoErro(e));
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
      <td data-label="Situação">
        {ativo ? (
          <span className="etiqueta etiqueta-ok">Ativo</span>
        ) : (
          <>
            <span className="etiqueta etiqueta-sem">Sem acesso</span>
            <span className="endereco">
              {mercado.removidoAte ? `até ${dataCurta(mercado.removidoAte)} (${faltam(mercado.removidoAte)})` : 'permanente: só volta se você der o acesso'}
            </span>
          </>
        )}
      </td>
      <td data-label="Produtos">{mercado.totalProdutos}</td>
      <td data-label="Login" className={senha || mostraFormulario ? 'acoes' : undefined}>
        {senha && (
          <div role="status" className="aviso aviso-ok senha-painel" tabIndex={-1} ref={painelSenha}>
            <p>
              Login criado para <strong>{senha.email}</strong>. Senha temporária:
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
        {!senha && mercado.temLogin && 'Já tem login'}
        {!senha && !mercado.temLogin && !ativo && 'Sem login'}
        {!senha && !mercado.temLogin && ativo && !formAberto && (
          <button
            ref={botaoCriarAcesso}
            type="button"
            className="botao botao-secundario botao-pequeno"
            aria-describedby={idNome}
            disabled={ocupado}
            onClick={abrirFormulario}
          >
            Criar login
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
        {!confirmando && (
          <div className="acoes-botoes">
            {ativo ? (
              <button
                ref={botaoTirarAcesso}
                type="button"
                className="botao botao-secundario botao-pequeno"
                aria-describedby={idNome}
                disabled={ocupado}
                onClick={() => abrir('tirar')}
              >
                Tirar acesso
              </button>
            ) : (
              <button
                type="button"
                className="botao botao-pequeno"
                aria-describedby={idNome}
                disabled={ocupado}
                onClick={darAcessoDeNovo}
              >
                {acao === 'reativar' ? 'Dando acesso…' : 'Dar acesso novamente'}
              </button>
            )}
            <button
              ref={botaoApagar}
              type="button"
              className="botao botao-perigo-suave botao-pequeno"
              aria-describedby={idNome}
              disabled={ocupado}
              onClick={() => abrir('apagar')}
            >
              Apagar
            </button>
          </div>
        )}
        {modo === 'tirar' && (
          <form onSubmit={tirarAcesso} noValidate aria-label={`Tirar acesso de ${mercado.nome}`} className="tirar-acesso">
            <p className="confirmacao">
              O mercado e os produtos dele somem do aplicativo na hora, e ele deixa de enviar planilhas. Os dados ficam guardados.
            </p>
            <fieldset disabled={ocupado}>
              <legend>Por quanto tempo?</legend>
              <label className="opcao">
                <input type="radio" name={`duracao-${mercado.id}`} checked={duracao === 'permanente'} onChange={() => setDuracao('permanente')} />
                Permanente (só volta se você der o acesso)
              </label>
              <label className="opcao">
                <input type="radio" name={`duracao-${mercado.id}`} checked={duracao === 'temporario'} onChange={() => setDuracao('temporario')} />
                Temporário (volta sozinho)
              </label>
              {duracao === 'temporario' && (
                <div className="prazo">
                  <label htmlFor={`prazo-qtd-${mercado.id}`}>Quanto tempo</label>
                  <input
                    id={`prazo-qtd-${mercado.id}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={quantidade}
                    onChange={(e) => setQuantidade(e.target.value)}
                  />
                  <label htmlFor={`prazo-un-${mercado.id}`}>Unidade</label>
                  <select id={`prazo-un-${mercado.id}`} value={unidade} onChange={(e) => setUnidade(e.target.value as Unidade)}>
                    <option value="dias">dias</option>
                    <option value="meses">meses</option>
                    <option value="anos">anos</option>
                  </select>
                </div>
              )}
            </fieldset>
            <div className="acoes-botoes">
              <button type="submit" className="botao botao-perigo botao-pequeno" aria-describedby={idNome} disabled={ocupado}>
                {acao === 'remocao' ? 'Tirando…' : 'Tirar acesso agora'}
              </button>
              <button
                ref={botaoCancelarRemocao}
                type="button"
                className="botao botao-secundario botao-pequeno"
                aria-describedby={idNome}
                disabled={ocupado}
                onClick={cancelarModo}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
        {modo === 'apagar' && (
          <div role="group" aria-label={`Apagar ${mercado.nome}`}>
            <p className="confirmacao">
              Apagar de vez? O mercado e os {mercado.totalProdutos} produtos dele serão apagados e <strong>não dá para desfazer</strong>. Para só esconder, use "Tirar acesso".
            </p>
            <div className="acoes-botoes">
              <button type="button" className="botao botao-perigo botao-pequeno" aria-describedby={idNome} disabled={ocupado} onClick={apagar}>
                {acao === 'apagar' ? 'Apagando…' : 'Sim, apagar'}
              </button>
              <button
                ref={botaoCancelarRemocao}
                type="button"
                className="botao botao-secundario botao-pequeno"
                aria-describedby={idNome}
                disabled={ocupado}
                onClick={cancelarModo}
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
  const aoSemAcesso = (id: number, ate: string | null) =>
    setMercados((lista) => lista.map((m) => (m.id === id ? { ...m, status: 'removido', removidoAte: ate } : m)));
  const aoReativado = (id: number) =>
    setMercados((lista) => lista.map((m) => (m.id === id ? { ...m, status: 'ativo', removidoAte: null } : m)));
  const aoApagado = (id: number) => setMercados((lista) => lista.filter((m) => m.id !== id));
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
                <th scope="col">Login</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>
              {mercados.map((m) => (
                <Linha
                  key={m.id}
                  mercado={m}
                  aoAcessoCriado={aoAcessoCriado}
                  aoSemAcesso={aoSemAcesso}
                  aoReativado={aoReativado}
                  aoApagado={aoApagado}
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
