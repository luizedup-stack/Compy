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
