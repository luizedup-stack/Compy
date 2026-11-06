import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { mensagemDoErro, verificarEmail } from './api';

export const MSG_EMAIL_CONFIRMADO = 'E-mail confirmado. Entre com a sua conta.';
const MSG_INFORME_CODIGO = 'Informe o código';

/** O código do e-mail pode chegar com espaços e quebras de linha ao colar: tira todos. */
const limparCodigo = (texto: string) => texto.replace(/\s+/g, '');

/** Confirma o e-mail da conta com o código recebido. Tela pública (logo depois do cadastro ou a qualquer hora). */
export default function ConfirmarEmail() {
  const navigate = useNavigate();
  const estado: unknown = useLocation().state;
  const email = (estado as { email?: unknown } | null)?.email;
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    const limpo = limparCodigo(codigo);
    if (limpo === '') {
      setErro(MSG_INFORME_CODIGO);
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      await verificarEmail(limpo);
      navigate('/entrar', { replace: true, state: { aviso: MSG_EMAIL_CONFIRMADO } });
    } catch (falha) {
      setErro(mensagemDoErro(falha));
      setEnviando(false);
    }
  }

  return (
    <section className="cartao">
      <h1>Confirmar e-mail</h1>
      <div role="status">
        <p className="aviso aviso-ok">
          {typeof email === 'string' && email
            ? `Conta criada. Enviamos um código para ${email}.`
            : 'Informe o código que enviamos para o seu e-mail.'}
        </p>
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
      <p>
        <Link to="/entrar">Confirmar depois e entrar</Link>
      </p>
    </section>
  );
}
