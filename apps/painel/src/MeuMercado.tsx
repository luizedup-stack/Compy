// Tela "Meu comércio": é aqui que o mercado cadastra e edita os seus dados (nome, endereço completo e telefone).
// - Conta nova (sem nenhum mercado): mostra o formulário para CADASTRAR o primeiro mercado.
// - Com mercado: mostra os dados do comércio em uso para EDITAR e, embaixo, "Meus comércios" com o botão
//   "Adicionar outro comércio" (um usuário pode ter mais de um; o seletor do topo escolhe com qual trabalhar).
import { useEffect, useState } from 'react';
import { DIAS_PRECO_VELHO, formatarCep, formatarTelefone } from '@mercado/shared';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ErroApi,
  MSG_SEM_MERCADO,
  atualizarMercado,
  avisarListaAtualizada,
  avisarMudancaDeMercados,
  criarMercado,
  guardarMercadoEscolhido,
  listarMeusMercados,
  mensagemDoErro,
  obterMercado,
  sessaoRecusada,
  type DadosDoMercado,
  type MercadoPainel,
  type ResumoDoMercado,
} from './api';
import FormularioMercado, { DADOS_VAZIOS } from './FormularioMercado';

const plural = (n: number, singular: string, pluralTexto: string) => (n === 1 ? singular : pluralTexto);

/** Do mercado salvo para os campos do formulário (CEP e telefone já com a pontuação). */
function paraFormulario(m: MercadoPainel): DadosDoMercado {
  const d = m.detalhes;
  return {
    nome: m.nome,
    logradouro: d?.logradouro ?? '',
    numero: d?.numero ?? '',
    complemento: d?.complemento ?? '',
    bairro: d?.bairro ?? '',
    cidade: d?.cidade ?? '',
    uf: d?.uf ?? '',
    cep: d ? formatarCep(d.cep) : '',
    telefone: m.telefone ? formatarTelefone(m.telefone) : '',
  };
}

export default function MeuMercado() {
  const navigate = useNavigate();
  const aviso = (useLocation().state as { aviso?: unknown } | null)?.aviso;
  const [mercado, setMercado] = useState<MercadoPainel | null>(null);
  const [lista, setLista] = useState<ResumoDoMercado[]>([]);
  const [semMercado, setSemMercado] = useState(false);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [adicionando, setAdicionando] = useState(false);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      try {
        const meus = await listarMeusMercados();
        if (!ativo) return;
        setLista(meus);
        if (meus.length === 0) {
          setSemMercado(true);
          return;
        }
        const atual = await obterMercado();
        if (!ativo) return;
        setMercado(atual);
      } catch (e) {
        if (!ativo) return;
        if (sessaoRecusada(e)) navigate('/entrar', { replace: true });
        else if (e instanceof ErroApi && e.message === MSG_SEM_MERCADO) setSemMercado(true);
        else setErroCarga(mensagemDoErro(e));
      }
    }
    void carregar();
    return () => {
      ativo = false;
    };
  }, [navigate]);

  /** Cadastra um mercado (o primeiro ou mais um), passa a trabalhar nele e recarrega o painel. */
  async function cadastrar(dados: DadosDoMercado) {
    try {
      const novo = await criarMercado(dados);
      guardarMercadoEscolhido(novo.id);
      await listarMeusMercados(); // atualiza a lista guardada, que o seletor do topo lê
      avisarMudancaDeMercados();
      navigate('/meu-mercado', { replace: true, state: { aviso: `Comércio cadastrado: ${novo.nome}. Agora você está trabalhando nele.` } });
    } catch (e) {
      if (sessaoRecusada(e)) navigate('/entrar', { replace: true });
      throw new Error(mensagemDoErro(e));
    }
  }

  async function salvar(dados: DadosDoMercado) {
    setSucesso(false);
    try {
      const novo = await atualizarMercado({ ...dados, uf: dados.uf });
      setMercado(novo);
      setLista((l) => l.map((m) => (m.id === novo.id ? { ...m, nome: novo.nome, endereco: novo.endereco, perfilCompleto: novo.perfilCompleto } : m)));
      setSucesso(true);
      // O nome pode ter mudado: atualiza a lista guardada e o seletor do topo, sem recarregar esta tela.
      await listarMeusMercados();
      avisarListaAtualizada();
    } catch (e) {
      if (sessaoRecusada(e)) navigate('/entrar', { replace: true });
      throw new Error(mensagemDoErro(e));
    }
  }

  return (
    <section className="cartao">
      <h1>Meu comércio</h1>
      <div role="status">{typeof aviso === 'string' && aviso && <p className="aviso aviso-ok">{aviso}</p>}</div>
      {erroCarga && (
        <p role="alert" className="aviso aviso-erro">
          {erroCarga}
        </p>
      )}
      {!mercado && !semMercado && !erroCarga && <p>Carregando…</p>}

      {semMercado && (
        <>
          <h2>Cadastre o seu comércio</h2>
          <p>
            Informe os dados do seu comércio. O endereço precisa estar completo (com CEP e número) e o telefone com DDD. Depois você
            poderá cadastrar os produtos.
          </p>
          <FormularioMercado inicial={DADOS_VAZIOS} rotuloBotao="Cadastrar comércio" prefixo="novo" aoEnviar={cadastrar} />
        </>
      )}

      {mercado && (
        <>
          <p className="resumo">
            <strong>
              {mercado.totalProdutos} {plural(mercado.totalProdutos, 'produto', 'produtos')}
            </strong>{' '}
            cadastrados
          </p>
          {!mercado.perfilCompleto && (
            <p role="alert" className="aviso aviso-erro">
              Complete o endereço e o telefone do seu comércio e salve.
            </p>
          )}
          {mercado.produtosDesatualizados > 0 && (
            <div className="faixa-amarela">
              <p>
                {`${mercado.produtosDesatualizados} ${plural(mercado.produtosDesatualizados, 'produto', 'produtos')} com preço de mais de ${DIAS_PRECO_VELHO} dias`}
              </p>
              <Link to="/produtos">Ver produtos</Link>
            </div>
          )}
          <FormularioMercado
            key={mercado.id + mercado.nome + (mercado.telefone ?? '')}
            inicial={paraFormulario(mercado)}
            rotuloBotao="Salvar"
            prefixo="meu"
            aoEnviar={salvar}
          />
          <div role="status">{sucesso && <p className="aviso aviso-ok">Dados atualizados</p>}</div>

          <h2>Meus comércios</h2>
          <ul className="lista-mercados" aria-label="Meus comércios">
            {lista.map((m) => (
              <li key={m.id}>
                <strong>{m.nome}</strong>
                {m.id === mercado.id && <span className="selo"> em uso</span>}
                <br />
                <small>{m.endereco}</small>
              </li>
            ))}
          </ul>
          {!adicionando ? (
            <p>
              <button type="button" className="botao botao-secundario" onClick={() => setAdicionando(true)}>
                Adicionar outro comércio
              </button>
            </p>
          ) : (
            <div className="novo-produto" role="group" aria-label="Adicionar outro comércio">
              <h3>Adicionar outro comércio</h3>
              <FormularioMercado
                inicial={DADOS_VAZIOS}
                rotuloBotao="Cadastrar comércio"
                prefixo="outro"
                aoEnviar={cadastrar}
                aoCancelar={() => setAdicionando(false)}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
