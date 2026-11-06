// Confirma o e-mail da conta com o código recebido por e-mail. Tela pública (logo depois do cadastro ou a qualquer hora).
// Se o e-mail não chegou, "Reenviar código" pede outro; se o envio de e-mail do programa não está configurado,
// a tela avisa onde achar o código.
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { mensagemDoErro, reenviarCodigo, verificarEmail } from './api';

export const MSG_EMAIL_CONFIRMADO = 'E-mail confirmado. Entre com a sua conta.';
const MSG_INFORME_CODIGO = 'Informe o código';
const MSG_INFORME_EMAIL = 'Informe o seu e-mail para receber outro código';

/** O código do e-mail pode chegar com espaços e quebras de linha ao colar: tira todos. */
const limparCodigo = (texto: string) => texto.replace(/\s+/g, '');

export default function ConfirmarEmail() {
  const navigate = useNavigate();
  const estado = useLocation().state as { email?: unknown; emailEnviado?: unknown } | null;
  const emailInicial = typeof estado?.email === 'string' ? estado.email : '';
  const emailNaoEnviado = estado?.emailEnviado === false;
  const [email, setEmail] = useState(emailInicial);
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    const limpo = limparCodigo(codigo);
    if (limpo === '') {
      setErro(MSG_INFORME_CODIGO);
      return;
    }
    setErro(null);
    setAviso(null);
    setEnviando(true);
    try {
      await verificarEmail(limpo);
      navigate('/entrar', { replace: true, state: { aviso: MSG_EMAIL_CONFIRMADO } });
    } catch (falha) {
      setErro(mensagemDoErro(falha));
      setEnviando(false);
    }
  }

  async function reenviar() {
    if (email.trim() === '') {
      setErro(MSG_INFORME_EMAIL);
      return;
    }
    setErro(null);
    setAviso(null);
    try {
      await reenviarCodigo(email.trim());
      setAviso('Se esse e-mail estiver cadastrado e ainda não confirmado, enviamos um novo código. Veja também a caixa de spam.');
    } catch (falha) {
      setErro(mensagemDoErro(falha));
    }
  }

  return (
    <section className="cartao">
      <h1>Confirmar e-mail</h1>
      <div role="status">
        {emailInicial !== '' && !emailNaoEnviado && (
          <p className="aviso aviso-ok">{`Conta criada. Enviamos um código para ${emailInicial}.`}</p>
        )}
        {emailInicial !== '' && emailNaoEnviado && (
          <p className="aviso aviso-erro">
            {`Conta criada, mas não foi possível enviar o e-mail para ${emailInicial}: o envio de e-mail ainda não está configurado neste programa. O código aparece no menu do programa: Bolso Certo → Códigos de e-mail.`}
          </p>
        )}
        {emailInicial === '' && <p className="aviso aviso-ok">Informe o código que enviamos para o seu e-mail.</p>}
        {aviso && <p className="aviso aviso-ok">{aviso}</p>}
      </div>
      <form onSubmit={aoEnviar} noValidate>
        <label htmlFor="codigo-email">Código recebido por e-mail</label>
        <input
          id="codigo-email"
          type="text"
          autoComplete="one-time-code"
          autoCapitalize="none"
          spellCheck={false}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
        />
        {erro && (
          <p role="alert" className="aviso aviso-erro">
            {erro}
          </p>
        )}
        <button type="submit" className="botao" disabled={enviando}>
          {enviando ? 'Confirmando…' : 'Confirmar e-mail'}
        </button>
      </form>

      <h2>Não recebeu o e-mail?</h2>
      <label htmlFor="email-reenvio">Seu e-mail</label>
      <input id="email-reenvio" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <p>
        <button type="button" className="botao botao-secundario" onClick={reenviar}>
          Reenviar código
        </button>
      </p>
      <p>
        <Link to="/entrar">Confirmar depois e entrar</Link>
      </p>
    </section>
  );
}
