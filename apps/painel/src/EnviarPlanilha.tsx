import { useState, type FormEvent } from 'react';
import type { RelatorioImportacao } from '@mercado/shared';
import { useNavigate } from 'react-router-dom';
import { baixarModelo, enviarPlanilha, ErroApi } from './api';

export default function EnviarPlanilha() {
  const navigate = useNavigate();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [relatorio, setRelatorio] = useState<RelatorioImportacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  /** Mostra o erro do servidor; sessão recusada (401) leva de volta ao login. */
  function tratar(e: unknown) {
    if (e instanceof ErroApi && e.status === 401) {
      navigate('/entrar', { replace: true });
      return;
    }
    setErro(e instanceof ErroApi ? e.message : 'Não foi possível falar com o servidor');
  }

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    if (!arquivo) return;
    setErro(null);
    setRelatorio(null);
    setEnviando(true);
    try {
      setRelatorio(await enviarPlanilha(arquivo));
    } catch (e) {
      tratar(e);
    } finally {
      setEnviando(false);
    }
  }

  async function aoBaixarModelo() {
    setErro(null);
    try {
      await baixarModelo();
    } catch (e) {
      tratar(e);
    }
  }

  return (
    <section className="cartao">
      <h1>Enviar planilha</h1>
      <p>
        Baixe a planilha-modelo e preencha com os dados do seu mercado e com os produtos. Uma única planilha
        tem tudo: os dados do mercado e a lista de produtos. Assim que você enviar, os preços já aparecem para
        os clientes.
      </p>
      <p>
        <button type="button" className="botao botao-secundario" onClick={aoBaixarModelo}>
          Baixar planilha-modelo
        </button>
      </p>
      <details className="dica">
        <summary>Dica: a sua planilha é diferente do modelo?</summary>
        <p>
          Peça a uma IA (como o ChatGPT, o Claude ou o Gemini) para ajustar a sua planilha ao nosso modelo. Envie <strong>a sua planilha e o
          nosso modelo juntos</strong> e escreva algo como:
        </p>
        <p className="exemplo-pedido">
          Reorganize a minha planilha para ficar igual ao modelo anexo: mesma aba "Mercado" e aba "Produtos" com as colunas Código de
          barras, Produto, Preço, Quantidade, Categoria, Disponível e Foto, nesta ordem. Código de barras como texto, preço com vírgula, e
          não invente nenhum dado.
        </p>
        <p>
          Depois, confira o resultado (principalmente códigos de barras e preços) antes de enviar. Mande para a IA só a lista de produtos,
          sem dados pessoais seus ou de clientes.
        </p>
      </details>
      <details className="dica">
        <summary>Como mandar as fotos dos produtos</summary>
        <p>
          Na coluna <strong>Foto</strong> da planilha, ponha o <strong>link</strong> da imagem (começando com https://) ou <strong>cole a
          imagem</strong> sobre a célula do produto (Inserir &gt; Imagem). Se o produto ainda não tem foto, a sua passa a valer para todos. Se
          já tem, a que existia continua para os outros e a sua fica guardada para o seu mercado.
        </p>
      </details>
      <form onSubmit={aoEnviar}>
        <label htmlFor="planilha">Planilha (.xlsx)</label>
        <input
          id="planilha"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
        />
        <button type="submit" className="botao" disabled={!arquivo || enviando}>
          {enviando ? 'Enviando…' : 'Enviar'}
        </button>
      </form>

      {erro && (
        <p role="alert" className="aviso aviso-erro">
          {erro}
        </p>
      )}

      {relatorio && (
        <div role="status" className="aviso aviso-ok">
          <p>
            <strong>{relatorio.mercadoCriado ? 'Mercado criado' : 'Mercado atualizado'}</strong>
          </p>
          <p>
            {relatorio.importadas} {relatorio.importadas === 1 ? 'produto importado' : 'produtos importados'}
          </p>
          {relatorio.fotosColadas ? (
            <p>
              {relatorio.fotosColadas} {relatorio.fotosColadas === 1 ? 'foto recebida' : 'fotos recebidas'} da planilha.
            </p>
          ) : null}
          {relatorio.erros.length > 0 && (
            <>
              <h2>Linhas com problema</h2>
              <p>O restante da planilha foi importado. Corrija estas linhas e envie de novo.</p>
              <ul>
                {relatorio.erros.map((e) => (
                  <li key={`${e.linha}-${e.motivo}`}>
                    Linha {e.linha}: {e.motivo}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
