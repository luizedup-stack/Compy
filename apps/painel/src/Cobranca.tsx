import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mensagemDoErro, obterCobranca, sessaoRecusada, type Cobranca as DadosCobranca, type SituacaoConta } from './api';

const ROTULO_SITUACAO: Record<SituacaoConta, string> = {
  gratuita: 'gratuita',
  ativa: 'ativa',
  em_atraso: 'em atraso',
};

export default function Cobranca() {
  const navigate = useNavigate();
  const [dados, setDados] = useState<DadosCobranca | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    obterCobranca().then(
      (d) => {
        if (ativo) setDados(d);
      },
      (e: unknown) => {
        if (!ativo) return;
        if (sessaoRecusada(e)) navigate('/entrar', { replace: true });
        else setErro(mensagemDoErro(e));
      },
    );
    return () => {
      ativo = false;
    };
  }, [navigate]);

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
          <p>Promoções ainda não estão disponíveis; quando estiverem, o pagamento será feito aqui.</p>
        </>
      )}
    </section>
  );
}
