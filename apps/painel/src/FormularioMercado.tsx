// Formulário dos dados de um mercado: nome, endereço completo (CEP, rua, número, complemento, bairro, cidade, estado)
// e telefone. Serve para CADASTRAR um mercado (novo) e para EDITAR o mercado em uso; quem usa define o que fazer ao enviar.
import { UFS, validarCep, validarTelefone } from '@mercado/shared';
import { useState, type FormEvent } from 'react';
import type { DadosDoMercado } from './api';

export const DADOS_VAZIOS: DadosDoMercado = {
  nome: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  cep: '',
  telefone: '',
};

interface Props {
  /** Valores iniciais (vazios para cadastrar; os atuais para editar). */
  inicial: DadosDoMercado;
  /** Texto do botão: "Cadastrar mercado", "Salvar"... */
  rotuloBotao: string;
  /** Prefixo dos ids dos campos (vários formulários podem existir na mesma tela). */
  prefixo: string;
  /** Recebe os dados já conferidos. Se lançar erro, a mensagem aparece no formulário. */
  aoEnviar: (dados: DadosDoMercado) => Promise<void>;
  /** Cancelar (só aparece se informado). */
  aoCancelar?: () => void;
}

/** Confere no próprio navegador o que dá para conferir (o servidor confere tudo de novo). Devolve a mensagem ou null. */
export function conferirDados(d: DadosDoMercado): string | null {
  if (d.nome.trim().length < 2) return 'Informe o nome do mercado';
  const cep = validarCep(d.cep);
  if (!cep.ok) return cep.motivo;
  if (d.logradouro.trim().length < 3) return 'Informe a rua ou avenida';
  if (d.numero.trim() === '') return 'Informe o número (ou S/N)';
  if (d.bairro.trim().length < 2) return 'Informe o bairro';
  if (d.cidade.trim().length < 2) return 'Informe a cidade';
  if (!(UFS as readonly string[]).includes(d.uf)) return 'Informe o estado (UF), por exemplo SP';
  const telefone = validarTelefone(d.telefone);
  if (!telefone.ok) return telefone.motivo;
  return null;
}

export default function FormularioMercado({ inicial, rotuloBotao, prefixo, aoEnviar, aoCancelar }: Props) {
  const [dados, setDados] = useState<DadosDoMercado>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const id = (campo: string) => `${prefixo}-${campo}`;

  function mudar(campo: keyof DadosDoMercado, valor: string) {
    setDados((d) => ({ ...d, [campo]: valor }));
  }

  async function aoSubmeter(e: FormEvent) {
    e.preventDefault();
    const problema = conferirDados(dados);
    if (problema) {
      setErro(problema);
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      await aoEnviar(dados);
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível salvar');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={aoSubmeter} noValidate className="formulario-mercado">
      <label htmlFor={id('nome')}>Nome do mercado</label>
      <input id={id('nome')} type="text" autoComplete="organization" value={dados.nome} onChange={(e) => mudar('nome', e.target.value)} />

      <label htmlFor={id('cep')}>CEP</label>
      <input
        id={id('cep')}
        type="text"
        inputMode="numeric"
        autoComplete="postal-code"
        placeholder="05501-000"
        value={dados.cep}
        onChange={(e) => mudar('cep', e.target.value)}
      />

      <label htmlFor={id('logradouro')}>Rua ou avenida</label>
      <input
        id={id('logradouro')}
        type="text"
        autoComplete="address-line1"
        value={dados.logradouro}
        onChange={(e) => mudar('logradouro', e.target.value)}
      />

      <label htmlFor={id('numero')}>Número</label>
      <input id={id('numero')} type="text" placeholder="120 ou S/N" value={dados.numero} onChange={(e) => mudar('numero', e.target.value)} />

      <label htmlFor={id('complemento')}>Complemento (opcional)</label>
      <input
        id={id('complemento')}
        type="text"
        autoComplete="address-line2"
        value={dados.complemento}
        onChange={(e) => mudar('complemento', e.target.value)}
      />

      <label htmlFor={id('bairro')}>Bairro</label>
      <input id={id('bairro')} type="text" value={dados.bairro} onChange={(e) => mudar('bairro', e.target.value)} />

      <label htmlFor={id('cidade')}>Cidade</label>
      <input id={id('cidade')} type="text" autoComplete="address-level2" value={dados.cidade} onChange={(e) => mudar('cidade', e.target.value)} />

      <label htmlFor={id('uf')}>Estado (UF)</label>
      <select id={id('uf')} value={dados.uf} onChange={(e) => mudar('uf', e.target.value)}>
        <option value="">Escolha…</option>
        {UFS.map((uf) => (
          <option key={uf} value={uf}>
            {uf}
          </option>
        ))}
      </select>

      <label htmlFor={id('telefone')}>Telefone (com DDD)</label>
      <input
        id={id('telefone')}
        type="tel"
        autoComplete="tel"
        placeholder="(11) 91234-5678"
        value={dados.telefone}
        onChange={(e) => mudar('telefone', e.target.value)}
      />

      {erro && (
        <p role="alert" className="aviso aviso-erro">
          {erro}
        </p>
      )}
      <div className="acoes-botoes">
        <button type="submit" className="botao" disabled={enviando}>
          {enviando ? 'Salvando…' : rotuloBotao}
        </button>
        {aoCancelar && (
          <button type="button" className="botao botao-secundario" disabled={enviando} onClick={aoCancelar}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
