import { useEffect, useState, type FormEvent } from 'react';
import { DIAS_PRECO_VELHO } from '@mercado/shared';
import { Link, useNavigate } from 'react-router-dom';
import { atualizarMercado, mensagemDoErro, obterMercado, sessaoRecusada, type MercadoPainel } from './api';

const plural = (n: number, singular: string, pluralTexto: string) => (n === 1 ? singular : pluralTexto);

export default function MeuMercado() {
  const navigate = useNavigate();
  const [mercado, setMercado] = useState<MercadoPainel | null>(null);
  const [nome, setNome] = useState('');
  const [endereco, setEndereco] = useState('');
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;
    obterMercado().then(
      (m) => {
        if (!ativo) return;
        setMercado(m);
        setNome(m.nome);
        setEndereco(m.endereco);
      },
      (e: unknown) => {
        if (!ativo) return;
        if (sessaoRecusada(e)) navigate('/entrar', { replace: true });
        else setErroCarga(mensagemDoErro(e));
      },
    );
    return () => {
      ativo = false;
    };
  }, [navigate]);

  async function aoSalvar(e: FormEvent) {
    e.preventDefault();
    if (!mercado) return;
    setErro(null);
    setSucesso(false);

    const campos: { nome?: string; endereco?: string } = {};
    if (nome.trim() !== mercado.nome) campos.nome = nome.trim();
    if (endereco.trim() !== mercado.endereco) campos.endereco = endereco.trim();
    if (Object.keys(campos).length === 0) {
      setErro('Nada para alterar');
      return;
    }

    setSalvando(true);
    try {
      const novo = await atualizarMercado(campos);
      setMercado(novo);
      setNome(novo.nome);
      setEndereco(novo.endereco);
      setSucesso(true);
    } catch (e) {
      if (sessaoRecusada(e)) navigate('/entrar', { replace: true });
      else setErro(mensagemDoErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="cartao">
      <h1>Meu mercado</h1>
      {erroCarga && (
        <p role="alert" className="aviso aviso-erro">
          {erroCarga}
        </p>
      )}
      {!mercado && !erroCarga && <p>Carregando…</p>}
      {mercado && (
        <>
          <p className="resumo">
            <strong>
              {mercado.totalProdutos} {plural(mercado.totalProdutos, 'produto', 'produtos')}
            </strong>{' '}
            cadastrados
          </p>
          {mercado.produtosDesatualizados > 0 && (
            <div className="faixa-amarela">
              <p>
                {`${mercado.produtosDesatualizados} ${plural(mercado.produtosDesatualizados, 'produto', 'produtos')} com preço de mais de ${DIAS_PRECO_VELHO} dias`}
              </p>
              <Link to="/produtos">Ver produtos</Link>
            </div>
          )}
          <form onSubmit={aoSalvar}>
            <label htmlFor="nome-mercado">Nome do mercado</label>
            <input
              id="nome-mercado"
              type="text"
              autoComplete="organization"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
            <label htmlFor="endereco-mercado">Endereço</label>
            <input
              id="endereco-mercado"
              type="text"
              autoComplete="street-address"
              required
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
            />
            {erro && (
              <p role="alert" className="aviso aviso-erro">
                {erro}
              </p>
            )}
            <div role="status">
              {sucesso && <p className="aviso aviso-ok">Dados atualizados</p>}
            </div>
            <button type="submit" className="botao" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
