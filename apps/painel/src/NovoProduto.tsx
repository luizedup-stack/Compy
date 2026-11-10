import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ProdutoPainel } from '@mercado/shared';
import { colocarEmPromocao, criarProduto, mensagemDoErro, sessaoRecusada } from './api';

interface Props {
  /** Chamado com o produto criado (a tela de produtos recarrega a lista); `avisoPromocao` só vem se a promoção foi preenchida. */
  aoCriar: (p: ProdutoPainel, avisoPromocao?: string) => void;
  aoSessaoRecusada: () => void;
}

/** Cadastro de um produto novo à mão (além da planilha): código de barras, nome e preço são obrigatórios. */
export default function NovoProduto({ aoCriar, aoSessaoRecusada }: Props) {
  const [aberto, setAberto] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [nome, setNome] = useState('');
  const [preco, setPreco] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [categoria, setCategoria] = useState('');
  const [disponivel, setDisponivel] = useState(true);
  // Promoção (opcional): se o preço promocional for preenchido, a promoção é criada logo após o produto.
  const [precoPromocional, setPrecoPromocional] = useState('');
  const [validoAte, setValidoAte] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const campoCodigo = useRef<HTMLInputElement>(null);
  const botaoAbrir = useRef<HTMLButtonElement>(null);
  const abriu = useRef(false);

  useEffect(() => {
    if (!abriu.current) return;
    if (aberto) campoCodigo.current?.focus();
    else botaoAbrir.current?.focus();
  }, [aberto]);

  function limpar() {
    setCodigo('');
    setNome('');
    setPreco('');
    setQuantidade('');
    setCategoria('');
    setDisponivel(true);
    setPrecoPromocional('');
    setValidoAte('');
    setErro(null);
  }

  function abrir() {
    abriu.current = true;
    limpar();
    setAberto(true);
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    // A promoção é opcional, mas se o preço promocional foi preenchido, o "Válido até" é obrigatório (o servidor também confere isso).
    if (precoPromocional.trim() !== '' && validoAte.trim() === '') {
      setErro('Preencha "Válido até" para colocar o produto em promoção');
      return;
    }
    setEnviando(true);
    try {
      const criado = await criarProduto({
        codigoBarras: codigo.trim(),
        nome: nome.trim(),
        preco: preco.trim(),
        quantidade: quantidade.trim() === '' ? null : quantidade.trim(),
        categoria: categoria.trim() === '' ? null : categoria.trim(),
        disponivel,
      });
      let avisoPromocao: string | undefined;
      if (precoPromocional.trim() !== '') {
        try {
          const resultado = await colocarEmPromocao(criado.codigoBarras, { precoPromocional: precoPromocional.trim(), validoAte: validoAte.trim() });
          avisoPromocao = resultado.retida
            ? 'Promoção enviada: fica em destaque depois que a administração aprovar o pagamento.'
            : 'Promoção aplicada: o produto já está em destaque.';
        } catch (falhaPromocao) {
          if (sessaoRecusada(falhaPromocao)) {
            aoSessaoRecusada();
            return;
          }
          avisoPromocao = `Produto cadastrado, mas a promoção não pôde ser criada: ${mensagemDoErro(falhaPromocao)}`;
        }
      }
      setAberto(false);
      aoCriar(criado, avisoPromocao);
    } catch (falha) {
      if (sessaoRecusada(falha)) aoSessaoRecusada();
      else setErro(mensagemDoErro(falha));
    } finally {
      setEnviando(false);
    }
  }

  if (!aberto) {
    return (
      <p>
        <button ref={botaoAbrir} type="button" className="botao" onClick={abrir}>
          Novo produto
        </button>
      </p>
    );
  }

  return (
    <form className="novo-produto" aria-label="Novo produto" onSubmit={aoEnviar} noValidate>
      <h2>Novo produto</h2>
      <label htmlFor="novo-codigo">Código de barras</label>
      <input
        id="novo-codigo"
        ref={campoCodigo}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        required
        value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
      />
      <label htmlFor="novo-nome">Produto</label>
      <input id="novo-nome" type="text" required value={nome} onChange={(e) => setNome(e.target.value)} />
      <label htmlFor="novo-preco">Preço</label>
      <input
        id="novo-preco"
        type="text"
        inputMode="decimal"
        placeholder="15,90"
        required
        value={preco}
        onChange={(e) => setPreco(e.target.value)}
      />
      <label htmlFor="novo-quantidade">Quantidade (opcional, por exemplo 12 rolos ou 5 kg)</label>
      <input id="novo-quantidade" type="text" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
      <label htmlFor="novo-categoria">Categoria (opcional)</label>
      <input id="novo-categoria" type="text" value={categoria} onChange={(e) => setCategoria(e.target.value)} />
      <label className="linha-marcar">
        <input type="checkbox" checked={disponivel} onChange={(e) => setDisponivel(e.target.checked)} /> Disponível
      </label>
      <p className="dica-promocao">
        Quer colocar este produto em promoção já ao cadastrar? Preencha o preço promocional e a data de validade (isso gera uma
        cobrança: veja em <strong>Cobrança</strong> como funciona).
      </p>
      <label htmlFor="novo-preco-promocional">Preço promocional (opcional)</label>
      <input
        id="novo-preco-promocional"
        type="text"
        inputMode="decimal"
        placeholder="12,90"
        value={precoPromocional}
        onChange={(e) => setPrecoPromocional(e.target.value)}
      />
      <label htmlFor="novo-valido-ate">Válido até {precoPromocional.trim() !== '' && '(obrigatório com preço promocional)'}</label>
      <input
        id="novo-valido-ate"
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        value={validoAte}
        onChange={(e) => setValidoAte(e.target.value)}
      />
      {erro && (
        <p role="alert" className="aviso aviso-erro">
          {erro}
        </p>
      )}
      <div className="acoes-botoes">
        <button type="submit" className="botao" disabled={enviando}>
          {enviando ? 'Cadastrando…' : 'Cadastrar produto'}
        </button>
        <button type="button" className="botao botao-secundario" disabled={enviando} onClick={() => setAberto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
