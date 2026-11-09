import { describe, expect, it } from 'vitest';
import { criarAmbiente } from './apoioTeste';

describe('GET /privacidade', () => {
  it('responde 200 em HTML, sem token, com o texto da política', async () => {
    const { app } = await criarAmbiente();
    const res = await app.inject({ method: 'GET', url: '/privacidade' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    const html = res.body;
    expect(html).toContain('<html lang="pt-BR">');
    expect(html).toContain('Compy');
    expect(html).toMatch(/e-mail/i);
    expect(html).toMatch(/criptografada/i);
    expect(html).toContain('buscas');
    expect(html).toContain('Excluir minha conta');
    expect(html).toMatch(/anonimiza/i);
    expect(html).toMatch(/vendid|compartilh/i);
    expect(html).toContain('Contato: a definir pelo Compy');
  });

  it('conta dos registros técnicos do servidor, sem o texto das buscas (R33b)', async () => {
    const { app } = await criarAmbiente();
    const html = (await app.inject({ method: 'GET', url: '/privacidade' })).body;
    expect(html).toMatch(/registros técnicos/i);
    expect(html).toMatch(/endereço/i);
    expect(html).toMatch(/sem o texto das buscas/i);
    expect(html).toMatch(/segurança/i);
  });
});
