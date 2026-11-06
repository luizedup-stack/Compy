import { describe, expect, it } from 'vitest';
import {
  MSG_CEP_INVALIDO,
  MSG_TELEFONE_INVALIDO,
  UFS,
  formatarCep,
  formatarTelefone,
  montarEndereco,
  validarCep,
  validarTelefone,
} from './endereco';

describe('validarCep', () => {
  it.each([
    ['05501-000', '05501000'],
    ['05501000', '05501000'],
    [' 05.501-000 ', '05501000'],
  ])('aceita %j', (entrada, esperado) => {
    expect(validarCep(entrada)).toEqual({ ok: true, valor: esperado });
  });

  it.each(['', '123', '0550100', '055010000', '00000-000', 'abcdefgh'])('recusa %j', (entrada) => {
    expect(validarCep(entrada)).toEqual({ ok: false, motivo: MSG_CEP_INVALIDO });
  });
});

describe('validarTelefone', () => {
  it.each([
    ['(11) 91234-5678', '11912345678'],
    ['11 91234 5678', '11912345678'],
    ['+55 11 91234-5678', '11912345678'],
    ['(11) 3333-4444', '1133334444'],
    ['1133334444', '1133334444'],
  ])('aceita %j', (entrada, esperado) => {
    expect(validarTelefone(entrada)).toEqual({ ok: true, valor: esperado });
  });

  it.each([
    '',
    '12345',
    '91234-5678', // sem DDD
    '(11) 81234-5678', // 11 dígitos precisam começar com 9 depois do DDD
    '(10) 91234-5678', // DDD inexistente
    '(11) 03333-4444',
    '(11) 1333-4444', // fixo não começa com 0 nem 1
    '119123456789',
  ])('recusa %j', (entrada) => {
    expect(validarTelefone(entrada)).toEqual({ ok: false, motivo: MSG_TELEFONE_INVALIDO });
  });
});

describe('formatação', () => {
  it('CEP e telefone', () => {
    expect(formatarCep('05501000')).toBe('05501-000');
    expect(formatarTelefone('11912345678')).toBe('(11) 91234-5678');
    expect(formatarTelefone('1133334444')).toBe('(11) 3333-4444');
  });

  it('endereço em uma linha, com e sem complemento', () => {
    const base = { logradouro: 'Rua dos Ipês', numero: '120', complemento: null, bairro: 'Vila Sônia', cidade: 'São Paulo', uf: 'SP', cep: '05501000' };
    expect(montarEndereco(base)).toBe('Rua dos Ipês, 120 - Vila Sônia, São Paulo - SP, CEP 05501-000');
    expect(montarEndereco({ ...base, complemento: 'Loja 2' })).toBe('Rua dos Ipês, 120, Loja 2 - Vila Sônia, São Paulo - SP, CEP 05501-000');
  });

  it('a lista de UFs tem os 27 estados', () => {
    expect(UFS).toHaveLength(27);
  });
});
