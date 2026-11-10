import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  cancelarPedidoAdmin,
  centavosDe,
  mensagemDoErro,
  obterPromocoesAdmin,
  pagarPedido,
  reais,
  salvarConfigPromocao,
  sessaoRecusada,
  type ResumoPromocoesAdmin,
} from '../api';

const ROTULO = { aguardando: 'Aguardando pagamento', pago: 'Pago', cancelado: 'Cancelado' } as const;
const dataBr = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

/**
 * Administração das promoções (só a dona): quem pagou, quem deixou de pagar, quantas promoções existem, quanto entrou e quanto falta;
 * marcar um pedido como PAGO (isso libera a planilha retida), cancelar, e mudar o valor por promoção e a chave Pix.
 */
export default function PromocoesAdmin() {
  const navigate = useNavigate();
  const [dados, setDados] = useState<ResumoPromocoesAdmin | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [valor, setValor] = useState('');
  const [pix, setPix] = useState('');

  const tratar = useCallback(
    (e: unknown) => {
      if (sessaoRecusada(e)) navigate('/entrar', { replace: true });
      else setErro(mensagemDoErro(e));
    },
    [navigate],
  );

  const carregar = useCallback(async () => {
    try {
      const d = await obterPromocoesAdmin();
      setDados(d);
      setValor(String(d.config.valorCentavos / 100).replace('.', ','));
      setPix(d.config.pixChave ?? '');
    } catch (e) {
      tratar(e);
    }
  }, [tratar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function aoSalvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    const centavos = centavosDe(valor);
    if (centavos === null) {
      setErro('Informe o valor em reais, por exemplo 5 ou 5,50.');
      return;
    }
    setOcupado(true);
    try {
      await salvarConfigPromocao({ valorCentavos: centavos, pixChave: pix.trim() });
      setAviso('Configurações salvas. O valor novo vale só para os pedidos que ainda vão ser feitos.');
      await carregar();
    } catch (e2) {
      tratar(e2);
    } finally {
      setOcupado(false);
    }
  }

  async function agir(acao: () => Promise<unknown>, mensagem: string) {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      await acao();
      setAviso(mensagem);
      await carregar();
    } catch (e) {
      tratar(e);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="cartao">
      <h1>Promoções</h1>
      {erro && (
        <p role="alert" className="aviso aviso-erro">
          {erro}
        </p>
      )}
      {aviso && (
        <p role="status" className="aviso aviso-ok">
          {aviso}
        </p>
      )}
      {!dados && !erro && <p>Carregando…</p>}
      {dados && (
        <>
          <div className="cartoes-resumo">
            <div className="resumo-item">
              <span className="resumo-numero">{dados.resumo.promocoesPagas}</span>
              <span>promoções pagas</span>
            </div>
            <div className="resumo-item">
              <span className="resumo-numero">{dados.resumo.promocoesAguardando}</span>
              <span>aguardando pagamento</span>
            </div>
            <div className="resumo-item">
              <span className="resumo-numero">{reais(dados.resumo.recebidoCentavos)}</span>
              <span>recebido</span>
            </div>
            <div className="resumo-item">
              <span className="resumo-numero">{reais(dados.resumo.aReceberCentavos)}</span>
              <span>a receber</span>
            </div>
          </div>

          <h2>Valor e Pix</h2>
          <form onSubmit={aoSalvar} noValidate className="formulario-promocao">
            <label htmlFor="valor-promocao">Valor de cada promoção (R$)</label>
            <input id="valor-promocao" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
            <label htmlFor="chave-pix">Chave Pix que os comércios veem para pagar</label>
            <input id="chave-pix" value={pix} maxLength={140} onChange={(e) => setPix(e.target.value)} />
            <button type="submit" className="botao" disabled={ocupado}>
              Salvar
            </button>
          </form>

          <h2>Por comércio</h2>
          {dados.porComercio.length === 0 ? (
            <p>Ainda não há pedidos.</p>
          ) : (
            <table className="tabela-produtos">
              <caption className="so-leitor">Pagamentos por comércio</caption>
              <thead>
                <tr>
                  <th scope="col">Comércio</th>
                  <th scope="col">Pedidos pagos</th>
                  <th scope="col">Recebido</th>
                  <th scope="col">Pedidos em aberto</th>
                  <th scope="col">Falta pagar</th>
                </tr>
              </thead>
              <tbody>
                {dados.porComercio.map((c) => (
                  <tr key={c.mercadoId}>
                    <td data-label="Comércio">{c.nome}</td>
                    <td data-label="Pedidos pagos">{c.pagas}</td>
                    <td data-label="Recebido">{reais(c.recebidoCentavos)}</td>
                    <td data-label="Pedidos em aberto">{c.aguardando}</td>
                    <td data-label="Falta pagar">{reais(c.devidoCentavos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2>Pedidos</h2>
          {dados.pedidos.length === 0 ? (
            <p>Nenhum pedido de promoção ainda.</p>
          ) : (
            <table className="tabela-produtos">
              <caption className="so-leitor">Pedidos de promoção</caption>
              <thead>
                <tr>
                  <th scope="col">Pedido</th>
                  <th scope="col">Comércio</th>
                  <th scope="col">Data</th>
                  <th scope="col">Promoções</th>
                  <th scope="col">Total</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Ações</th>
                </tr>
              </thead>
              <tbody>
                {dados.pedidos.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Pedido">Nº {p.id}</td>
                    <td data-label="Comércio">{p.mercadoNome}</td>
                    <td data-label="Data">{dataBr(p.criadoEm)}</td>
                    <td data-label="Promoções">
                      {p.quantidade} × {reais(p.valorUnitarioCentavos)}
                    </td>
                    <td data-label="Total">{reais(p.totalCentavos)}</td>
                    <td data-label="Situação">
                      <span className="etiqueta">{ROTULO[p.situacao]}</span>
                      {p.situacao === 'aguardando' && p.avisouPagamentoEm && <div className="endereco">Avisou que pagou em {dataBr(p.avisouPagamentoEm)}</div>}
                      {p.situacao === 'pago' && p.pagoEm && <div className="endereco">Pago em {dataBr(p.pagoEm)}</div>}
                    </td>
                    <td data-label="Ações">
                      {p.situacao === 'aguardando' && (
                        <div className="acoes-botoes">
                          <button
                            type="button"
                            className="botao botao-pequeno"
                            disabled={ocupado}
                            aria-label={`Marcar o pedido ${p.id} como pago`}
                            onClick={() => void agir(() => pagarPedido(p.id), `Pedido ${p.id} liberado: a planilha foi aplicada.`)}
                          >
                            Marcar como pago
                          </button>
                          <button
                            type="button"
                            className="botao botao-secundario botao-pequeno"
                            disabled={ocupado}
                            aria-label={`Cancelar o pedido ${p.id}`}
                            onClick={() => void agir(() => cancelarPedidoAdmin(p.id), `Pedido ${p.id} cancelado.`)}
                          >
                            Cancelar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
