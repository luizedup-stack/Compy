// Cadastro da CONTA do mercado: só o básico (e-mail e senha), sem confirmação de e-mail: a pessoa entra com o e-mail que quiser.
// O mercado em si (nome, endereço completo, telefone) é cadastrado depois, na tela "Meu mercado".
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cadastrarMercado, mensagemDoErro } from './api';

const TAMANHO_MINIMO_SENHA = 8;
export const MSG_SENHA_CURTA = 'A senha precisa de pelo menos 8 caracteres';
export const MSG_SENHAS_DIFERENTES = 'As senhas não são iguais';
export const MSG_CONTA_CRIADA = 'Conta criada. Entre com o seu e-mail e a senha.';

export default function CadastrarMercado() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [repetir, setRepetir] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    // Confere aqui o que dá para conferir sem o servidor.
    if (senha.length < TAMANHO_MINIMO_SENHA) {
      setErro(MSG_SENHA_CURTA);
      return;
    }
    if (senha !== repetir) {
      setErro(MSG_SENHAS_DIFERENTES);
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      await cadastrarMercado({ email: email.trim(), senha });
      // Conta criada: volta para a tela de entrar (com o aviso) para a pessoa entrar com o e-mail e a senha que acabou de criar.
      navigate('/entrar', { replace: true, state: { aviso: MSG_CONTA_CRIADA } });
    } catch (falha) {
      setErro(mensagemDoErro(falha));
      setEnviando(false);
    }
  }

  return (
    <section className="cartao">
      <h1>Criar conta</h1>
      <p>
        Informe seu e-mail e escolha uma senha. Depois de entrar, você cadastra os dados do seu mercado (endereço completo e
        telefone) na tela <strong>Meu mercado</strong>. Só você vê e edita o que é seu.
      </p>
      <form onSubmit={aoEnviar} noValidate>
        <label htmlFor="email-cadastro">E-mail</label>
        <input id="email-cadastro" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="senha-cadastro">Senha (mínimo de 8 caracteres)</label>
        <input
          id="senha-cadastro"
          type="password"
          autoComplete="new-password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
        <label htmlFor="repetir-senha">Repita a senha</label>
        <input
          id="repetir-senha"
          type="password"
          autoComplete="new-password"
          required
          value={repetir}
          onChange={(e) => setRepetir(e.target.value)}
        />
        {erro && (
          <p role="alert" className="aviso aviso-erro">
            {erro}
          </p>
        )}
        <button type="submit" className="botao" disabled={enviando}>
          {enviando ? 'Criando…' : 'Criar conta'}
        </button>
      </form>
      <p>
        <Link to="/entrar">Já tenho conta</Link>
      </p>
    </section>
  );
}
