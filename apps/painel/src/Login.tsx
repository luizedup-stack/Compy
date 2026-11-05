import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ErroApi, guardarSessao, login } from './api';

const MSG_CLIENTE = 'Esta área é para mercados. Use o aplicativo Bolso Certo.';

export default function Login() {
  const navigate = useNavigate();
  // Aviso deixado por outra tela (ex.: "Senha alterada" depois de redefinir a senha).
  const estado: unknown = useLocation().state;
  const aviso = (estado as { aviso?: unknown } | null)?.aviso;
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEntrando(true);
    try {
      const r = await login(email.trim(), senha);
      if (r.papel === 'cliente') {
        setErro(MSG_CLIENTE);
        return;
      }
      guardarSessao({ token: r.token, papel: r.papel });
      navigate('/planilha', { replace: true });
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível falar com o servidor');
    } finally {
      setEntrando(false);
    }
  }

  return (
    <section className="cartao">
      <h1>Entrar</h1>
      <p>Acesse com o e-mail e a senha da conta do seu mercado.</p>
      {typeof aviso === 'string' && aviso && (
        <div role="status">
          <p className="aviso aviso-ok">{aviso}</p>
        </div>
      )}
      <form onSubmit={aoEnviar}>
        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label htmlFor="senha">Senha</label>
        <input
          id="senha"
          type="password"
          autoComplete="current-password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
        {erro && (
          <p role="alert" className="aviso aviso-erro">
            {erro}
          </p>
        )}
        <button type="submit" className="botao" disabled={entrando}>
          {entrando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <p>
        <Link to="/esqueci-senha">Esqueci minha senha</Link>
      </p>
    </section>
  );
}
