import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  avisarPagamento,
  cancelarPedido,
  listarPromocoes,
  mensagemDoErro,
  obterCobranca,
  reais,
  sessaoRecusada,
  type Cobranca as DadosCobranca,
  type ConfigPromocao,
  type PedidoPromocao,
  type SituacaoConta,
} from './api';

const ROTULO_SITUACAO: Record<SituacaoConta, string> = {
  gratuita: 'gratuita',
  ativa: 'ativa',
  em_atraso: 'em atraso',
};

const ROTULO_PEDIDO = { aguardando: 'Aguardando pagamento', pago: 'Pago', cancelado: 'Cancelado' } as const;

const dataBr = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

/**
 * Cobrança do comércio. Mostra a situação da conta e as PROMOÇÕES: cada linha da aba "Descontos" da planilha é uma promoção
 * cobrada (valor por promoção definido pela administração). A planilha com promoções só vai ao ar depois que o pagamento (Pix) é
 * confirmado; aqui o comércio vê o que pagar, avisa "Já paguei" ou cancela o pedido.
 */
export default function Cobranca() {
  const navigate = useNavigate();
  const [dados, setDados] = useState<DadosCobranca | null>(null);
  const [config, setConfig] = useState<ConfigPromocao | null>(null);
  const [pedidos, setPedidos] = useState<PedidoPromocao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);

  function tratar(e: unknown) {
    if (sessaoRecusada(e)) navigate('/entrar', { replace: true });
    else setErro(mensagemDoErro(e));
  }

  useEffect(() => {
    let ativo = true;
    Promise.all([obterCobranca(), listarPromocoes()]).then(
      ([d, p]) => {
        if (!ativo) return;
        setDados(d);
        setConfig(p.config);
        setPedidos(p.pedidos);
      },
      (e: unknown) => {
        if (ativo) tratar(e);
      },
    );
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir a tela
  }, []);

  async function agir(id: number, acao: (id: number) => Promise<PedidoPromocao>) {
    setErro(null);
    setOcupado(id);
    try {
      const novo = await acao(id);
      setPedidos((lista) => lista.map((p) => (p.id === id ? { ...p, ...novo } : p)));
    } catch (e) {
      tratar(e);
    } finally {
      setOcupado(null);
    }
  }

  return (
    <section className="cartao">
      <h1>Cobrança</h1>
      {erro && (
        <p role="alert" className="aviso aviso-erro">
          {erro}
        </p>
      )}
      {!dados && !erro && <p>Carregando…</p>}
      {dados && (
        <>
          <p className="cobranca-mensagem">{dados.mensagem}</p>
          <p className="cobranca-situacao">
            Situação da conta: <span className="etiqueta">{ROTULO_SITUACAO[dados.situacao] ?? dados.situacao}</span>
          </p>

          <h2>Promoções</h2>
          <p>
            Cada produto em promoção (cada linha da aba <strong>Descontos</strong> da planilha) custa{' '}
            <strong>{config ? reais(config.valorCentavos) : '—'}</strong>. Quando você envia uma planilha com promoções, ela fica guardada
            e só vai ao ar depois que o pagamento é confirmado.
          </p>
          {config && (
            <p className="cobranca-pix">
              {config.pixChave ? (
                <>
                  Pague por <strong>Pix</strong> para a chave: <strong>{config.pixChave}</strong>. Escreva o <strong>número do pedido</strong> na
                  mensagem do Pix.
                </>
              ) : (
                <>A chave Pix para pagar ainda não foi informada. Fale com a administração.</>
              )}
            </p>
          )}

          {pedidos.length === 0 ? (
            <p>Você ainda não tem pedidos de promoção.</p>
          ) : (
            <table className="tabela-produtos">
              <caption className="so-leitor">Pedidos de promoção</caption>
              <thead>
                <tr>
                  <th scope="col">Pedido</th>
                  <th scope="col">Data</th>
                  <th scope="col">Promoções</th>
                  <th scope="col">Total</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Ações</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Pedido">Nº {p.id}</td>
                    <td data-label="Data">{dataBr(p.criadoEm)}</td>
                    <td data-label="Promoções">
                      {p.quantidade} × {reais(p.valorUnitarioCentavos)}
                    </td>
                    <td data-label="Total">{reais(p.totalCentavos)}</td>
                    <td data-label="Situação">
                      <span className="etiqueta">{ROTULO_PEDIDO[p.situacao]}</span>
                      {p.situacao === 'aguardando' && p.avisouPagamentoEm && <div className="endereco">Você avisou em {dataBr(p.avisouPagamentoEm)}</div>}
                      {p.situacao === 'pago' && p.pagoEm && <div className="endereco">Liberado em {dataBr(p.pagoEm)}</div>}
                    </td>
                    <td data-label="Ações">
                      {p.situacao === 'aguardando' && (
                        <div className="acoes-botoes">
                          <button
                            type="button"
                            className="botao botao-pequeno"
                            disabled={ocupado === p.id || p.avisouPagamentoEm !== null}
                            aria-label={`Já paguei o pedido ${p.id}`}
                            onClick={() => void agir(p.id, avisarPagamento)}
                          >
                            Já paguei
                          </button>
                          <button
                            type="button"
                            className="botao botao-secundario botao-pequeno"
                            disabled={ocupado === p.id}
                            aria-label={`Cancelar o pedido ${p.id}`}
                            onClick={() => void agir(p.id, cancelarPedido)}
                          >
                            Cancelar pedido
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
