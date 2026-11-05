import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { esqueciSenha, mensagemDoErro, redefinirSenha } from './api';

// Mesmos textos e regras da tela do aplicativo (apps/mobile/src/telas/EsqueciSenha.tsx).
export const MSG_CODIGO_ENVIADO = 'Se esse e-mail estiver cadastrado, enviamos um código.';
export const MSG_SENHA_ALTERADA = 'Senha alterada. Entre com a nova senha.';
const MSG_SENHA_CURTA = 'A senha precisa de pelo menos 8 caracteres';
const MSG_INFORME_CODIGO = 'Informe o código';
const TAMANHO_MINIMO_SENHA = 8;

/** O código do e-mail pode chegar com espaços e quebras de linha ao colar: tira todos. */
const limparCodigo = (texto: string) => texto.replace(/\s+/g, '');

export default function EsqueciSenha() {
  const navigate = useNavigate();
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const titulo = useRef<HTMLHeadingElement>(null);
  const trocouEtapa = useRef(false);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  // Ao trocar de etapa, o foco vai para o novo título (o conteúdo da tela mudou inteiro).
  useEffect(() => {
    if (!trocouEtapa.current) return;
    titulo.current?.focus();
  }, [etapa]);

  function irPara(nova: 1 | 2) {
    trocouEtapa.current = true;
    setErro(null);
    setEtapa(nova);
  }

  async function enviarCodigo(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await esqueciSenha(email.trim());
      if (montado.current) irPara(2);
    } catch (falha) {
      if (montado.current) setErro(mensagemDoErro(falha));
    } finally {
      if (montado.current) setEnviando(false);
    }
  }

  async function redefinir(e: FormEvent) {
    e.preventDefault();
    const codigoLimpo = limparCodigo(codigo);
    if (codigoLimpo === '') {
      setErro(MSG_INFORME_CODIGO);
      return;
    }
    if (senha.length < TAMANHO_MINIMO_SENHA) {
      setErro(MSG_SENHA_CURTA);
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      await redefinirSenha(codigoLimpo, senha);
      if (montado.current) navigate('/entrar', { replace: true, state: { aviso: MSG_SENHA_ALTERADA } });
    } catch (falha) {
      if (!montado.current) return;
      setErro(mensagemDoErro(falha));
      setEnviando(false);
    }
  }

  const alerta = erro && (
    <p role="alert" className="aviso aviso-erro">
      {erro}
    </p>
  );

  if (etapa === 1) {
    return (
      <section className="cartao">
        <h1 ref={titulo} tabIndex={-1}>
          Esqueci minha senha
        </h1>
        <p>Informe o e-mail da conta do seu mercado e enviaremos um código para criar uma nova senha.</p>
        <form onSubmit={enviarCodigo}>
          <label htmlFor="email-recuperacao">E-mail</label>
          <input
            id="email-recuperacao"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {alerta}
          <button type="submit" className="botao" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar código'}
          </button>
        </form>
        <p>
          <Link to="/entrar">Voltar para entrar</Link>
        </p>
      </section>
    );
  }

  return (
    <section className="cartao">
      <h1 ref={titulo} tabIndex={-1}>
        Nova senha
      </h1>
      <div role="status">
        <p className="aviso aviso-ok">{MSG_CODIGO_ENVIADO}</p>
      </div>
      <form onSubmit={redefinir} noValidate>
        <label htmlFor="codigo-recuperacao">Código recebido por e-mail</label>
        <input
          id="codigo-recuperacao"
          type="text"
          autoComplete="one-time-code"
          autoCapitalize="none"
          spellCheck={false}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
        />
        <label htmlFor="senha-nova">Nova senha</label>
        <input
          id="senha-nova"
          type="password"
          autoComplete="new-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
        {alerta}
        <button type="submit" className="botao" disabled={enviando}>
          {enviando ? 'Redefinindo…' : 'Redefinir senha'}
        </button>
      </form>
      <button type="button" className="botao-link" onClick={() => irPara(1)}>
        Usar outro e-mail
      </button>
    </section>
  );
}
