import { useEffect, useRef, useState, type RefObject } from 'react';
import type { ProdutoPainel } from '@mercado/shared';
import { Link, useNavigate } from 'react-router-dom';
import { ErroDeFoto, reduzirImagem } from './foto';
import NovoProduto from './NovoProduto';
import {
  ErroApi,
  MSG_SEM_MERCADO,
  colocarEmPromocao,
  editarProduto,
  enviarFotoDoProduto,
  guardarMercadoEscolhido,
  lerMercadoEscolhido,
  lerSessao,
  listarMercadosAdmin,
  listarProdutos,
  mensagemDoErro,
  removerFotoDoProduto,
  removerProduto,
  sessaoRecusada,
  urlDaFoto,
  type CamposProduto,
  type MercadoAdmin,
} from './api';

const POR_PAGINA = 50;
const SEM_VALOR = '—';

const formatadorNumero = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatarPreco = (valor: number) => `R$ ${formatadorNumero.format(valor)}`;
/** Data no fuso de Brasília, para o dia não mudar conforme o computador de quem olha. */
const formatarData = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
const plural = (n: number) => `${n} ${n === 1 ? 'produto' : 'produtos'}`;

/** Preço digitado como `15,90`, `15.90` ou `1.234,50` vira número; o que não der para ler segue como texto. */
function lerPreco(texto: string): number | string {
  const t = texto.trim().replace(/^R\$\s*/, '');
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'));
  if (/^\d+([.,]\d+)?$/.test(t)) return Number(t.replace(',', '.'));
  return t;
}

interface Rascunho {
  nome: string;
  preco: string;
  quantidade: string;
  categoria: string;
  disponivel: boolean;
}

const rascunhoDe = (p: ProdutoPainel): Rascunho => ({
  nome: p.nome,
  preco: formatadorNumero.format(p.preco).replace(/\./g, ''),
  quantidade: p.quantidadeTexto ?? '',
  categoria: p.categoria ?? '',
  disponivel: p.disponivel,
});

/** Só o que mudou em relação ao produto como está salvo. */
function camposAlterados(p: ProdutoPainel, r: Rascunho): CamposProduto {
  const campos: CamposProduto = {};
  const nome = r.nome.trim();
  if (nome !== p.nome) campos.nome = nome;
  // R27: preço editado é preço enviado, mesmo que o número seja igual ao salvo (isso renova a data do preço).
  if (r.preco !== rascunhoDe(p).preco) campos.preco = lerPreco(r.preco);
  const quantidade = r.quantidade.trim();
  if (quantidade !== (p.quantidadeTexto ?? '')) campos.quantidade = quantidade === '' ? null : quantidade;
  const categoria = r.categoria.trim();
  if (categoria !== (p.categoria ?? '')) campos.categoria = categoria === '' ? null : categoria;
  if (r.disponivel !== p.disponivel) campos.disponivel = r.disponivel;
  return campos;
}

interface LinhaProps {
  produto: ProdutoPainel;
  aoAtualizar: (p: ProdutoPainel) => void;
  aoRemover: (codigo: string) => void;
  /** Chamado depois de um pedido de promoção, com a mensagem para mostrar na tela. */
  aoPromover: (mensagem: string) => void;
  aoSessaoRecusada: () => void;
}

function Linha({ produto, aoAtualizar, aoRemover, aoPromover, aoSessaoRecusada }: LinhaProps) {
  const [modo, setModo] = useState<'ver' | 'editar' | 'remover' | 'promocao'>('ver');
  const [rascunho, setRascunho] = useState<Rascunho>(() => rascunhoDe(produto));
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const botaoEditar = useRef<HTMLButtonElement>(null);
  const botaoRemover = useRef<HTMLButtonElement>(null);
  const botaoPromocao = useRef<HTMLButtonElement>(null);
  const campoNome = useRef<HTMLInputElement>(null);
  const botaoCancelarRemocao = useRef<HTMLButtonElement>(null);
  const campoPrecoPromocional = useRef<HTMLInputElement>(null);
  // Promoção (sem planilha): preço promocional e validade; a cobrança e a aprovação seguem a mesma regra de sempre.
  const [precoPromocional, setPrecoPromocional] = useState('');
  const [validoAte, setValidoAte] = useState('');
  const [erroPromocao, setErroPromocao] = useState<string | null>(null);
  const [enviandoPromocao, setEnviandoPromocao] = useState(false);
  const entradaFoto = useRef<HTMLInputElement>(null);
  // Muda quando a foto é trocada: o navegador guarda a imagem antiga pelo endereço, então o endereço ganha um sufixo novo.
  const [versaoFoto, setVersaoFoto] = useState(0);
  const [fotoOcupada, setFotoOcupada] = useState(false);
  const idNome = `nome-${produto.codigoBarras}`;
  // Para onde o foco vai quando a linha troca de modo (o botão que o usuário apertou deixa de existir).
  const focoPendente = useRef<RefObject<HTMLElement> | null>(null);

  useEffect(() => {
    focoPendente.current?.current?.focus();
    focoPendente.current = null;
  }, [modo]);

  function mudar<K extends keyof Rascunho>(campo: K, valor: Rascunho[K]) {
    setRascunho((r) => ({ ...r, [campo]: valor }));
  }

  function iniciarEdicao() {
    setRascunho(rascunhoDe(produto));
    setErro(null);
    focoPendente.current = campoNome;
    setModo('editar');
  }

  function cancelarEdicao() {
    setErro(null);
    focoPendente.current = botaoEditar;
    setModo('ver');
  }

  function pedirRemocao() {
    setErro(null);
    focoPendente.current = botaoCancelarRemocao;
    setModo('remover');
  }

  function cancelarRemocao() {
    setErro(null);
    focoPendente.current = botaoRemover;
    setModo('ver');
  }

  function iniciarPromocao() {
    setPrecoPromocional('');
    setValidoAte('');
    setErroPromocao(null);
    focoPendente.current = campoPrecoPromocional;
    setModo('promocao');
  }

  function cancelarPromocao() {
    setErroPromocao(null);
    focoPendente.current = botaoPromocao;
    setModo('ver');
  }

  async function enviarPromocao(e: React.FormEvent) {
    e.preventDefault();
    if (precoPromocional.trim() === '' || validoAte.trim() === '') {
      setErroPromocao('Preencha o preço promocional e a data de validade');
      return;
    }
    setErroPromocao(null);
    setEnviandoPromocao(true);
    try {
      const resultado = await colocarEmPromocao(produto.codigoBarras, { precoPromocional: precoPromocional.trim(), validoAte: validoAte.trim() });
      focoPendente.current = botaoPromocao;
      setModo('ver');
      aoPromover(
        resultado.retida
          ? `${produto.nome}: promoção enviada, fica em destaque depois que a administração aprovar o pagamento.`
          : `${produto.nome}: promoção aplicada, já está em destaque.`,
      );
    } catch (e2) {
      if (sessaoRecusada(e2)) aoSessaoRecusada();
      else setErroPromocao(mensagemDoErro(e2));
    } finally {
      setEnviandoPromocao(false);
    }
  }

  async function salvar() {
    const campos = camposAlterados(produto, rascunho);
    if (Object.keys(campos).length === 0) {
      cancelarEdicao();
      return;
    }
    setErro(null);
    setOcupado(true);
    try {
      const atualizado = await editarProduto(produto.codigoBarras, campos);
      focoPendente.current = botaoEditar;
      setModo('ver');
      aoAtualizar(atualizado);
    } catch (e) {
      if (sessaoRecusada(e)) aoSessaoRecusada();
      else setErro(mensagemDoErro(e));
    } finally {
      setOcupado(false);
    }
  }

  /** Confirma que o preço atual continua valendo: reenvia o mesmo preço para o servidor renovar a data. */
  async function confirmarPreco() {
    setErro(null);
    setOcupado(true);
    try {
      aoAtualizar(await editarProduto(produto.codigoBarras, { preco: produto.preco }));
    } catch (e) {
      if (sessaoRecusada(e)) aoSessaoRecusada();
      else setErro(mensagemDoErro(e));
    } finally {
      setOcupado(false);
    }
  }

  async function remover() {
    setErro(null);
    setOcupado(true);
    try {
      await removerProduto(produto.codigoBarras);
      aoRemover(produto.codigoBarras);
    } catch (e) {
      if (sessaoRecusada(e)) aoSessaoRecusada();
      else setErro(mensagemDoErro(e));
      setOcupado(false);
    }
  }

  /** Escolhida a imagem: reduz e envia. A foto é do código de barras (vale para todos os mercados que vendem o produto). */
  async function aoEscolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = ''; // permite escolher o mesmo arquivo de novo
    if (!arquivo) return;
    setErro(null);
    setFotoOcupada(true);
    try {
      const resposta = await enviarFotoDoProduto(produto.codigoBarras, await reduzirImagem(arquivo));
      setVersaoFoto(Date.now());
      aoAtualizar({ ...produto, foto: resposta.foto, fotoOrigem: resposta.fotoOrigem, fotoSoDoMercado: resposta.fotoSoDoMercado });
    } catch (e2) {
      if (sessaoRecusada(e2)) aoSessaoRecusada();
      else setErro(e2 instanceof ErroDeFoto ? e2.message : mensagemDoErro(e2));
    } finally {
      setFotoOcupada(false);
    }
  }

  async function removerFoto() {
    setErro(null);
    setFotoOcupada(true);
    try {
      const restante = await removerFotoDoProduto(produto.codigoBarras);
      // Só havia a foto própria do mercado: volta a valer a de todos (restante). Era a de todos: o produto fica sem foto.
      aoAtualizar({ ...produto, foto: restante?.foto ?? null, fotoOrigem: restante?.fotoOrigem ?? null, fotoSoDoMercado: false });
    } catch (e2) {
      if (sessaoRecusada(e2)) aoSessaoRecusada();
      else setErro(mensagemDoErro(e2));
    } finally {
      setFotoOcupada(false);
    }
  }

  const editando = modo === 'editar';

  return (
    <tr>
      <td data-label="Código de barras">
        {editando ? (
          <input type="text" aria-label="Código de barras" value={produto.codigoBarras} disabled readOnly />
        ) : (
          produto.codigoBarras
        )}
      </td>
      <td data-label="Produto" id={idNome}>
        {editando ? (
          <input
            ref={campoNome}
            type="text"
            aria-label="Produto"
            value={rascunho.nome}
            onChange={(e) => mudar('nome', e.target.value)}
          />
        ) : (
          produto.nome
        )}
      </td>
      <td data-label="Foto" className="coluna-foto">
        {produto.foto ? (
          <img
            className="foto-produto"
            src={`${urlDaFoto(produto.foto)}${versaoFoto ? `${produto.foto.includes('?') ? '&' : '?'}v=${versaoFoto}` : ''}`}
            alt={`Foto de ${produto.nome}`}
            width={48}
            height={48}
            loading="lazy"
          />
        ) : (
          <span className="sem-foto">Sem foto</span>
        )}
        {produto.fotoOrigem === 'ilustrativa' && <span className="sem-foto">Foto ilustrativa (do tipo de produto)</span>}
        {produto.fotoSoDoMercado && <span className="sem-foto">Esta foto aparece só no seu comércio (o produto já tinha outra foto)</span>}
        <div className="acoes-botoes">
          <input
            ref={entradaFoto}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            aria-label={`Escolher foto de ${produto.nome}`}
            onChange={(e) => void aoEscolherFoto(e)}
          />
          <button
            type="button"
            className="botao botao-secundario botao-pequeno"
            aria-describedby={idNome}
            disabled={fotoOcupada || ocupado}
            onClick={() => entradaFoto.current?.click()}
          >
            {fotoOcupada ? 'Enviando…' : produto.foto && produto.fotoOrigem !== 'ilustrativa' ? 'Trocar foto' : 'Enviar foto'}
          </button>
          {produto.fotoOrigem === 'mercado' && (
            <button
              type="button"
              className="botao botao-secundario botao-pequeno"
              aria-describedby={idNome}
              disabled={fotoOcupada || ocupado}
              onClick={() => void removerFoto()}
            >
              Remover foto
            </button>
          )}
        </div>
      </td>
      <td data-label="Preço">
        {editando ? (
          <input
            type="text"
            inputMode="decimal"
            aria-label="Preço"
            value={rascunho.preco}
            onChange={(e) => mudar('preco', e.target.value)}
          />
        ) : (
          formatarPreco(produto.preco)
        )}
      </td>
      <td data-label="Quantidade">
        {editando ? (
          <input
            type="text"
            aria-label="Quantidade"
            value={rascunho.quantidade}
            onChange={(e) => mudar('quantidade', e.target.value)}
          />
        ) : (
          (produto.quantidadeTexto ?? SEM_VALOR)
        )}
      </td>
      <td data-label="Categoria">
        {editando ? (
          <input
            type="text"
            aria-label="Categoria"
            value={rascunho.categoria}
            onChange={(e) => mudar('categoria', e.target.value)}
          />
        ) : (
          (produto.categoria ?? SEM_VALOR)
        )}
      </td>
      <td data-label="Disponível">
        {editando ? (
          <input
            type="checkbox"
            aria-label="Disponível"
            checked={rascunho.disponivel}
            onChange={(e) => mudar('disponivel', e.target.checked)}
          />
        ) : produto.disponivel ? (
          'Sim'
        ) : (
          'Não'
        )}
      </td>
      <td data-label="Atualizado">
        <time dateTime={produto.atualizadoEm}>{formatarData(produto.atualizadoEm)}</time>
        {produto.desatualizado && <span className="selo">Preço antigo</span>}
      </td>
      <td data-label="Ações" className="acoes">
        {modo === 'ver' && (
          <div className="acoes-botoes">
            <button
              type="button"
              className="botao botao-secundario botao-pequeno"
              aria-describedby={idNome}
              disabled={ocupado}
              onClick={confirmarPreco}
            >
              Confirmar preço
            </button>
            <button
              ref={botaoEditar}
              type="button"
              className="botao botao-secundario botao-pequeno"
              aria-describedby={idNome}
              disabled={ocupado}
              onClick={iniciarEdicao}
            >
              Editar
            </button>
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
            <button
              ref={botaoPromocao}
              type="button"
              className="botao botao-secundario botao-pequeno"
              aria-describedby={idNome}
              disabled={ocupado}
              onClick={iniciarPromocao}
            >
              Colocar em promoção
            </button>
          </div>
        )}
        {modo === 'promocao' && (
          <form aria-label={`Colocar ${produto.nome} em promoção`} onSubmit={(e) => void enviarPromocao(e)}>
            <label htmlFor={`promo-preco-${produto.codigoBarras}`}>Preço promocional</label>
            <input
              id={`promo-preco-${produto.codigoBarras}`}
              ref={campoPrecoPromocional}
              type="text"
              inputMode="decimal"
              placeholder="12,90"
              value={precoPromocional}
              onChange={(e) => setPrecoPromocional(e.target.value)}
            />
            <label htmlFor={`promo-validoate-${produto.codigoBarras}`}>Válido até</label>
            <input
              id={`promo-validoate-${produto.codigoBarras}`}
              type="text"
              inputMode="numeric"
              placeholder="dd/mm/aaaa"
              value={validoAte}
              onChange={(e) => setValidoAte(e.target.value)}
            />
            {erroPromocao && (
              <p role="alert" className="aviso aviso-erro">
                {erroPromocao}
              </p>
            )}
            <div className="acoes-botoes">
              <button type="submit" className="botao botao-pequeno" disabled={enviandoPromocao}>
                {enviandoPromocao ? 'Enviando…' : 'Confirmar promoção'}
              </button>
              <button
                type="button"
                className="botao botao-secundario botao-pequeno"
                disabled={enviandoPromocao}
                onClick={cancelarPromocao}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
        {editando && (
          <div className="acoes-botoes">
            <button type="button" className="botao botao-pequeno" disabled={ocupado} onClick={salvar}>
              {ocupado ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              type="button"
              className="botao botao-secundario botao-pequeno"
              disabled={ocupado}
              onClick={cancelarEdicao}
            >
              Cancelar
            </button>
          </div>
        )}
        {modo === 'remover' && (
          <div role="group" aria-label="Confirmar remoção">
            <p className="confirmacao">Remover este produto?</p>
            <div className="acoes-botoes">
              <button type="button" className="botao botao-perigo botao-pequeno" disabled={ocupado} onClick={remover}>
                Confirmar remoção
              </button>
              <button
                ref={botaoCancelarRemocao}
                type="button"
                className="botao botao-secundario botao-pequeno"
                disabled={ocupado}
                onClick={cancelarRemocao}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
        {erro && (
          <p role="alert" className="aviso aviso-erro">
            {erro}
          </p>
        )}
      </td>
    </tr>
  );
}

export default function Produtos() {
  const navigate = useNavigate();
  const [pagina, setPagina] = useState(1);
  const [itens, setItens] = useState<ProdutoPainel[]>([]);
  const [total, setTotal] = useState(0);
  const [paginaCarregada, setPaginaCarregada] = useState(0); // a página a que `itens` pertence
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState('');
  const [tentativa, setTentativa] = useState(0);
  const titulo = useRef<HTMLHeadingElement>(null);

  // Busca por nome ou código de barras (aplicada ao enviar, para não pesar a cada tecla).
  const [textoBusca, setTextoBusca] = useState('');
  const [busca, setBusca] = useState('');

  // O administrador escolhe de qual mercado quer ver e editar os produtos.
  const ehAdmin = lerSessao()?.papel === 'admin';
  const [mercados, setMercados] = useState<MercadoAdmin[]>([]);
  const [mercadoEscolhido, setMercadoEscolhido] = useState<number | null>(() => (ehAdmin ? lerMercadoEscolhido() : null));
  const [carregouMercados, setCarregouMercados] = useState(!ehAdmin);
  const precisaEscolher = ehAdmin && mercadoEscolhido === null;

  useEffect(() => {
    if (!ehAdmin) return;
    let ativo = true;
    listarMercadosAdmin().then(
      (lista) => {
        if (!ativo) return;
        const ativos = (Array.isArray(lista) ? lista : []).filter((m) => m.status === 'ativo');
        setMercados(ativos);
        setMercadoEscolhido((atual) => {
          const valido = ativos.some((m) => m.id === atual) ? atual : (ativos[0]?.id ?? null);
          guardarMercadoEscolhido(valido);
          return valido;
        });
        setCarregouMercados(true);
      },
      (e: unknown) => {
        if (!ativo) return;
        if (sessaoRecusada(e)) navigate('/entrar', { replace: true });
        else {
          setErro(mensagemDoErro(e));
          setCarregouMercados(true);
        }
      },
    );
    return () => {
      ativo = false;
    };
  }, [ehAdmin, navigate]);

  function escolherMercado(id: number) {
    guardarMercadoEscolhido(id);
    setMercadoEscolhido(id);
    setPagina(1);
    setMensagem('');
  }

  function aplicarBusca(e: React.FormEvent) {
    e.preventDefault();
    setPagina(1);
    setMensagem('');
    setBusca(textoBusca.trim());
  }

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  useEffect(() => {
    if (!carregouMercados || precisaEscolher) {
      setCarregando(!carregouMercados);
      return;
    }
    let ativo = true;
    setCarregando(true);
    setErro(null);
    listarProdutos(pagina, busca).then(
      (r) => {
        if (!ativo) return;
        setItens(r.itens);
        setTotal(r.total);
        setPaginaCarregada(pagina);
        setCarregando(false);
      },
      (e: unknown) => {
        if (!ativo) return;
        if (sessaoRecusada(e)) {
          navigate('/entrar', { replace: true });
          return;
        }
        // Conta de mercado nova, que ainda não cadastrou o mercado: leva para "Meu comércio" para cadastrar.
        if (e instanceof ErroApi && e.message === MSG_SEM_MERCADO && lerSessao()?.papel === 'mercado') {
          navigate('/meu-mercado', { replace: true, state: { aviso: 'Cadastre o seu comércio para começar a cadastrar produtos.' } });
          return;
        }
        setErro(mensagemDoErro(e));
        setCarregando(false);
      },
    );
    return () => {
      ativo = false;
    };
  }, [pagina, tentativa, busca, mercadoEscolhido, carregouMercados, precisaEscolher, navigate]);

  // Página sem itens apesar de haver produtos (a última foi esvaziada, ou a página passou do fim): volta
  // para uma página que existe. Decide pelo estado atual, nunca por uma cópia antiga dele.
  useEffect(() => {
    if (carregando || erro || paginaCarregada !== pagina) return; // ainda não chegou a página pedida
    if (itens.length > 0 || total === 0 || pagina <= 1) return;
    setPagina(Math.min(pagina - 1, Math.max(1, Math.ceil(total / POR_PAGINA))));
  }, [carregando, erro, itens, total, pagina, paginaCarregada]);

  function irParaPagina(nova: number) {
    setMensagem('');
    setPagina(nova);
  }

  function aoAtualizar(p: ProdutoPainel) {
    setItens((lista) => lista.map((i) => (i.codigoBarras === p.codigoBarras ? p : i)));
    setMensagem('Produto atualizado');
  }

  function aoCriar(p: ProdutoPainel, avisoPromocao?: string) {
    // O produto novo entra na ordem alfabética: recarrega a primeira página, sem busca, para ele aparecer.
    setMensagem(`Produto cadastrado: ${p.nome}${avisoPromocao ? ` — ${avisoPromocao}` : ''}`);
    setTextoBusca('');
    setBusca('');
    setPagina(1);
    setTentativa((t) => t + 1);
  }

  function aoRemover(codigo: string) {
    // Atualização funcional: várias remoções em andamento ao mesmo tempo não podem ressuscitar linhas.
    setItens((lista) => lista.filter((i) => i.codigoBarras !== codigo));
    setTotal((t) => Math.max(0, t - 1));
    setMensagem('Produto removido');
    titulo.current?.focus(); // a linha removida levava o foco junto
  }

  const aoSessaoRecusada = () => navigate('/entrar', { replace: true });

  const aoPromover = (texto: string) => setMensagem(texto);

  return (
    <section className="cartao cartao-largo">
      <h1 ref={titulo} tabIndex={-1}>
        Produtos
      </h1>
      <div role="status" className="mensagem-viva">
        {mensagem}
      </div>

      {ehAdmin && carregouMercados && (
        <p className="seletor-mercado">
          <label>
            Mercado:{' '}
            <select
              value={mercadoEscolhido ?? ''}
              onChange={(e) => escolherMercado(Number(e.target.value))}
              disabled={mercados.length === 0}
            >
              {mercados.length === 0 && <option value="">Nenhum comércio ainda</option>}
              {mercados.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome} ({m.totalProdutos})
                </option>
              ))}
            </select>
          </label>
        </p>
      )}

      {ehAdmin && carregouMercados && mercados.length === 0 && (
        <div className="vazio">
          <p>Nenhum comércio cadastrado. Envie uma planilha para criar o primeiro.</p>
          <Link to="/planilha" className="botao botao-link">
            Enviar planilha
          </Link>
        </div>
      )}

      {/* Cadastro de produto novo à mão (além da planilha). O administrador só vê depois de escolher o mercado. */}
      {!precisaEscolher && !(ehAdmin && mercados.length === 0) && (
        <NovoProduto aoCriar={aoCriar} aoSessaoRecusada={aoSessaoRecusada} />
      )}

      {!precisaEscolher && (
        <form className="busca-produtos" role="search" onSubmit={aplicarBusca}>
          <label>
            Buscar por nome ou código de barras{' '}
            <input type="search" value={textoBusca} onChange={(e) => setTextoBusca(e.target.value)} />
          </label>{' '}
          <button type="submit" className="botao botao-secundario">
            Buscar
          </button>
          {busca !== '' && (
            <>
              {' '}
              <button
                type="button"
                className="botao botao-secundario"
                onClick={() => {
                  setTextoBusca('');
                  setBusca('');
                  setPagina(1);
                }}
              >
                Limpar busca
              </button>
            </>
          )}
        </form>
      )}

      {carregando && <p>Carregando produtos…</p>}

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

      {!carregando && !erro && !precisaEscolher && total === 0 && busca !== '' && (
        <p>Nenhum produto encontrado para essa busca.</p>
      )}

      {!carregando && !erro && !precisaEscolher && total === 0 && busca === '' && !(ehAdmin && mercados.length === 0) && (
        <div className="vazio">
          <p>Nenhum produto ainda. Cadastre um produto ou envie uma planilha.</p>
          <Link to="/planilha" className="botao botao-link">
            Enviar planilha
          </Link>
        </div>
      )}

      {!carregando && !erro && !precisaEscolher && total > 0 && (
        <>
          <p className="resumo">{plural(total)}</p>
          <div className="tabela-rolagem">
            <table className="tabela-produtos">
              <caption className="so-leitor">Produtos do comércio</caption>
              <thead>
                <tr>
                  <th scope="col">Código de barras</th>
                  <th scope="col">Produto</th>
                  <th scope="col">Foto</th>
                  <th scope="col">Preço</th>
                  <th scope="col">Quantidade</th>
                  <th scope="col">Categoria</th>
                  <th scope="col">Disponível</th>
                  <th scope="col">Atualizado</th>
                  <th scope="col">Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((p) => (
                  <Linha
                    key={p.codigoBarras}
                    produto={p}
                    aoAtualizar={aoAtualizar}
                    aoRemover={aoRemover}
                    aoPromover={aoPromover}
                    aoSessaoRecusada={aoSessaoRecusada}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <nav aria-label="Páginas de produtos" className="paginacao">
            <button
              type="button"
              className="botao botao-secundario"
              disabled={pagina <= 1}
              onClick={() => irParaPagina(pagina - 1)}
            >
              Anterior
            </button>
            <span>{`Página ${pagina} de ${paginas}`}</span>
            <button
              type="button"
              className="botao botao-secundario"
              disabled={pagina >= paginas}
              onClick={() => irParaPagina(pagina + 1)}
            >
              Próxima
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
