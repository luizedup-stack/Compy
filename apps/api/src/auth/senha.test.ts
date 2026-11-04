import { describe, expect, it } from 'vitest';
import { conferirSenha, hashSenha } from './senha';

describe('senha', () => {
  it('gera um hash que não é a senha e que confere com ela', async () => {
    const hash = await hashSenha('segredo123');
    expect(hash).not.toBe('segredo123');
    expect(await conferirSenha('segredo123', hash)).toBe(true);
  });

  it('rejeita senha diferente', async () => {
    const hash = await hashSenha('segredo123');
    expect(await conferirSenha('segredo124', hash)).toBe(false);
    expect(await conferirSenha('', hash)).toBe(false);
  });

  it('gera hashes diferentes para a mesma senha (sal aleatório)', async () => {
    expect(await hashSenha('segredo123')).not.toBe(await hashSenha('segredo123'));
  });
});
