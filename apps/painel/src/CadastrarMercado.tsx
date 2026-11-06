import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cadastrarMercado, mensagemDoErro } from './api';

const TAMANHO_MINIMO_SENHA = 8;
export const MSG_SENHA_CURTA = 'A senha precisa de pelo menos 8 caracteres';
export const MSG_SENHAS_DIFERENTES = 'As senhas não são iguais';

/** O próprio mercado cria a sua conta: nome, endereço, e-mail e senha. Depois confirma o e-mail com o código recebido. */
export default function CadastrarMercado() {
  const navigate = useNavigate();
  const [nome, setNome] = useState('');
  const [endereco, setEndereco] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [repetir, setRepetir] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
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
      await cadastrarMercado({ nome: nome.trim(), endereco: endereco.trim(), email: email.trim(), senha });
      navigate('/confirmar-email', { replace: true, state: { email: email.trim() } });
    } catch (falha) {
      setErro(mensagemDoErro(falha));
      setEnviando(false);
    }
  }

  return (
    <section className="cartao">
      <h1>Cadastrar meu mercado</h1>
      <p>Crie a conta do seu mercado. Você poderá cadastrar os seus produtos e preços, e só você vê e edita o que é seu.</p>
      <form onSubmit={aoEnviar} noValidate>
        <label htmlFor="nome-mercado">Nome do mercado</label>
        <input id="nome-mercado" type="text" autoComplete="organization" required value={nome} onChange={(e) => setNome(e.target.value)} />
        <label htmlFor="endereco-mercado">Endereço</label>
        <input
          id="endereco-mercado"
          type="text"
          autoComplete="street-address"
          required
          value={endereco}
          onChange={(e) => setEndereco(e.target.value)}
        />
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
          {enviando ? 'Cadastrando…' : 'Cadastrar mercado'}
        </button>
      </form>
      <p>
        <Link to="/entrar">Já tenho conta</Link>
      </p>
    </section>
  );
}
