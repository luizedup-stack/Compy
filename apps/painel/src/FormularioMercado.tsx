// Formulário dos dados de um mercado: nome, endereço completo (CEP, rua, número, complemento, bairro, cidade, estado)
// e telefone. Serve para CADASTRAR um mercado (novo) e para EDITAR o mercado em uso; quem usa define o que fazer ao enviar.
import { UFS, soDigitos, validarCep, validarTelefone } from '@mercado/shared';
import { useRef, useState, type FormEvent } from 'react';
import type { DadosDoMercado } from './api';
import { buscarCep } from './viaCep';

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
  /** Texto do botão: "Cadastrar comércio", "Salvar"... */
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
  if (d.nome.trim().length < 2) return 'Informe o nome do comércio';
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

  // Preenchimento pelo CEP: aviso mostrado embaixo do campo, último CEP consultado (para não repetir a consulta) e
  // número da consulta mais recente (uma resposta atrasada de um CEP que já foi trocado é ignorada).
  const [avisoCep, setAvisoCep] = useState<{ tipo: 'info' | 'ok' | 'erro'; texto: string } | null>(null);
  const ultimoCep = useRef('');
  const consultaAtual = useRef(0);
  const campoNumero = useRef<HTMLInputElement>(null);

  function mudar(campo: keyof DadosDoMercado, valor: string) {
    setDados((d) => ({ ...d, [campo]: valor }));
  }

  /**
   * Chamado a cada mudança no campo CEP. Quando os 8 números estão completos, consulta o endereço e preenche rua,
   * bairro, cidade e estado (o número e o complemento continuam com a pessoa). Se a consulta não der certo, a pessoa
   * preenche à mão: o formulário nunca trava por causa disso.
   */
  async function aoMudarCep(valor: string) {
    mudar('cep', valor);
    const digitos = soDigitos(valor);
    if (digitos.length !== 8) {
      // CEP incompleto: cancela qualquer consulta em andamento e limpa o aviso.
      consultaAtual.current += 1;
      ultimoCep.current = '';
      setAvisoCep(null);
      return;
    }
    if (digitos === ultimoCep.current || !validarCep(digitos).ok) return;
    ultimoCep.current = digitos;
    const numeroDaConsulta = ++consultaAtual.current;
    setAvisoCep({ tipo: 'info', texto: 'Buscando o endereço…' });

    const resultado = await buscarCep(digitos);
    if (numeroDaConsulta !== consultaAtual.current) return; // o CEP mudou enquanto a consulta andava
    if (resultado.situacao === 'achou') {
      const e = resultado.endereco;
      // Só preenche o que o CEP informa (alguns CEPs de cidade pequena não trazem rua ou bairro): o resto fica como está.
      setDados((d) => ({
        ...d,
        logradouro: e.logradouro || d.logradouro,
        bairro: e.bairro || d.bairro,
        cidade: e.cidade || d.cidade,
        uf: (UFS as readonly string[]).includes(e.uf) ? e.uf : d.uf,
      }));
      setAvisoCep({
        tipo: 'ok',
        texto: e.logradouro ? 'Endereço preenchido pelo CEP. Confira e informe o número.' : 'Cidade preenchida pelo CEP. Informe a rua, o bairro e o número.',
      });
      campoNumero.current?.focus();
    } else if (resultado.situacao === 'nao-achou') {
      ultimoCep.current = ''; // permite tentar de novo o mesmo CEP depois de corrigir
      setAvisoCep({ tipo: 'erro', texto: 'CEP não encontrado. Confira os números ou preencha o endereço à mão.' });
    } else {
      ultimoCep.current = '';
      setAvisoCep({ tipo: 'erro', texto: 'Não foi possível buscar o CEP agora. Preencha o endereço à mão.' });
    }
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
      <label htmlFor={id('nome')}>Nome do comércio</label>
      <input id={id('nome')} type="text" autoComplete="organization" value={dados.nome} onChange={(e) => mudar('nome', e.target.value)} />

      <label htmlFor={id('cep')}>CEP</label>
      <input
        id={id('cep')}
        type="text"
        inputMode="numeric"
        autoComplete="postal-code"
        placeholder="05501-000"
        value={dados.cep}
        onChange={(e) => void aoMudarCep(e.target.value)}
      />
      {avisoCep && (
        <p role="status" className={avisoCep.tipo === 'erro' ? 'aviso aviso-erro' : avisoCep.tipo === 'ok' ? 'aviso aviso-ok' : 'aviso'}>
          {avisoCep.texto}
        </p>
      )}

      <label htmlFor={id('logradouro')}>Rua ou avenida</label>
      <input
        id={id('logradouro')}
        type="text"
        autoComplete="address-line1"
        value={dados.logradouro}
        onChange={(e) => mudar('logradouro', e.target.value)}
      />

      <label htmlFor={id('numero')}>Número</label>
      <input ref={campoNumero} id={id('numero')} type="text" placeholder="120 ou S/N" value={dados.numero} onChange={(e) => mudar('numero', e.target.value)} />

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
