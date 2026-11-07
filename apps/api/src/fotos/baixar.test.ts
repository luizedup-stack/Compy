import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { baixarFoto, conferirUrlPublica, enderecoPrivado, ImagemInvalida, reduzirParaJpeg } from './baixar';
import { ErroTemporario } from './openFoodFacts';

const publico = async () => ['93.184.216.34'];
const png = (l = 800, a = 600, fundo = '#ff0000') => sharp({ create: { width: l, height: a, channels: 4, background: fundo } }).png().toBuffer();
const resposta = (corpo: Buffer | string, init: { status?: number; headers?: Record<string, string> } = {}) =>
  new Response(corpo as BodyInit, { status: init.status ?? 200, headers: init.headers });
const comoFetch = (f: (u: string) => Response | Promise<Response>) => vi.fn(async (u: string) => f(u)) as unknown as typeof fetch;

describe('enderecoPrivado', () => {
  it.each(['127.0.0.1', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.1.2.3', 'lixo'])('%s é privado', (ip) => {
    expect(enderecoPrivado(ip)).toBe(true);
  });
  it.each(['8.8.8.8', '93.184.216.34', '172.15.0.1', '172.32.0.1', '2606:4700:4700::1111'])('%s é público', (ip) => {
    expect(enderecoPrivado(ip)).toBe(false);
  });
});

describe('conferirUrlPublica (o link vem de fora: não confia)', () => {
  it('aceita https em endereço público', async () => {
    expect((await conferirUrlPublica('https://images.exemplo.com/a.jpg', publico)).hostname).toBe('images.exemplo.com');
  });

  it.each([
    ['http://images.exemplo.com/a.jpg', /https/],
    ['ftp://x.com/a.jpg', /https/],
    ['https://user:senha@exemplo.com/a.jpg', /inválido/],
    ['https://exemplo.com:8443/a.jpg', /porta/],
    ['https://localhost/a.jpg', /interno/],
    ['https://servidor.local/a.jpg', /interno/],
    ['https://127.0.0.1/a.jpg', /interno/],
    ['https://169.254.169.254/latest/meta-data/', /interno/],
    ['https://[::1]/a.jpg', /interno/],
    ['não é link', /inválido/],
  ])('recusa %s', async (link, motivo) => {
    await expect(conferirUrlPublica(link, publico)).rejects.toThrow(motivo);
  });

  it('recusa um nome que aponta para a rede interna (mesmo parecendo um site)', async () => {
    await expect(conferirUrlPublica('https://parece-inocente.com/a.jpg', async () => ['10.0.0.8'])).rejects.toBeInstanceOf(ImagemInvalida);
    await expect(conferirUrlPublica('https://misto.com/a.jpg', async () => ['93.184.216.34', '192.168.0.1'])).rejects.toBeInstanceOf(ImagemInvalida);
  });

  it('nome que não resolve é falha passageira (pode ser a rede), não definitiva', async () => {
    await expect(conferirUrlPublica('https://nao-existe.exemplo.com/a.jpg', async () => { throw new Error('ENOTFOUND'); })).rejects.toBeInstanceOf(ErroTemporario);
  });
});

describe('reduzirParaJpeg', () => {
  it('reduz para no máximo 400 px mantendo a proporção, em JPEG', async () => {
    const texto = await reduzirParaJpeg(await png(1600, 1200));
    expect(texto.startsWith('data:image/jpeg;base64,')).toBe(true);
    const meta = await sharp(Buffer.from(texto.split(',')[1]!, 'base64')).metadata();
    expect(meta.format).toBe('jpeg');
    expect([meta.width, meta.height]).toEqual([400, 300]);
  });

  it('não amplia imagem pequena', async () => {
    const meta = await sharp(Buffer.from((await reduzirParaJpeg(await png(120, 80))).split(',')[1]!, 'base64')).metadata();
    expect([meta.width, meta.height]).toEqual([120, 80]);
  });

  it('PNG transparente vira fundo branco, não preto', async () => {
    const jpeg = Buffer.from((await reduzirParaJpeg(await png(50, 50, 'rgba(0,0,0,0)'))).split(',')[1]!, 'base64');
    const { data } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(240); // vermelho do primeiro pixel: branco
  });

  it('o que não é imagem (texto, HTML) é recusado', async () => {
    await expect(reduzirParaJpeg(Buffer.from('<html>não sou imagem</html>'))).rejects.toBeInstanceOf(ImagemInvalida);
  });
});

describe('baixarFoto', () => {
  it('baixa, reduz e devolve o JPEG como texto; manda User-Agent e pede só imagem', async () => {
    const fetchFn = comoFetch(async () => resposta(await png(), { headers: { 'content-type': 'image/png' } }));
    const texto = await baixarFoto('https://img.exemplo.com/a.png', { fetchFn, resolver: publico });
    expect(texto.startsWith('data:image/jpeg;base64,')).toBe(true);
    const [, init] = (fetchFn as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect((init.headers as Record<string, string>).Accept).toBe('image/*');
    expect((init.headers as Record<string, string>)['User-Agent']).toContain('BolsoCerto');
    expect(init.redirect).toBe('manual');
  });

  it('segue redirecionamento, conferindo cada destino', async () => {
    const fetchFn = comoFetch(async (u) => (u.includes('/velho') ? resposta('', { status: 301, headers: { location: 'https://cdn.exemplo.com/novo.png' } }) : resposta(await png())));
    expect((await baixarFoto('https://img.exemplo.com/velho', { fetchFn, resolver: publico })).startsWith('data:image/jpeg')).toBe(true);
  });

  it('redirecionamento para a rede interna é recusado (não vaza o servidor)', async () => {
    const fetchFn = comoFetch(async () => resposta('', { status: 302, headers: { location: 'https://169.254.169.254/latest/meta-data/' } }));
    await expect(baixarFoto('https://img.exemplo.com/a', { fetchFn, resolver: publico })).rejects.toMatchObject({ name: 'ImagemInvalida', message: expect.stringContaining('interno') });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('muitos redirecionamentos: recusa', async () => {
    const fetchFn = comoFetch(async () => resposta('', { status: 302, headers: { location: 'https://img.exemplo.com/outro' } }));
    await expect(baixarFoto('https://img.exemplo.com/a', { fetchFn, resolver: publico })).rejects.toBeInstanceOf(ImagemInvalida);
  });

  it('404/403 são definitivos; 429, 5xx e rede caindo são passageiros', async () => {
    for (const s of [404, 403, 410]) {
      await expect(baixarFoto('https://img.exemplo.com/a', { fetchFn: comoFetch(() => resposta('', { status: s })), resolver: publico })).rejects.toBeInstanceOf(ImagemInvalida);
    }
    for (const s of [429, 500, 503]) {
      await expect(baixarFoto('https://img.exemplo.com/a', { fetchFn: comoFetch(() => resposta('', { status: s })), resolver: publico })).rejects.toBeInstanceOf(ErroTemporario);
    }
    const queda = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
    await expect(baixarFoto('https://img.exemplo.com/a', { fetchFn: queda, resolver: publico })).rejects.toBeInstanceOf(ErroTemporario);
  });

  it('arquivo grande demais (declarado ou na prática) é recusado sem baixar tudo', async () => {
    const declarado = comoFetch(() => resposta('x', { headers: { 'content-length': String(6 * 1024 * 1024) } }));
    await expect(baixarFoto('https://img.exemplo.com/a', { fetchFn: declarado, resolver: publico })).rejects.toMatchObject({ message: expect.stringContaining('grande') });
    const naPratica = comoFetch(() => resposta(Buffer.alloc(6 * 1024 * 1024, 1)));
    await expect(baixarFoto('https://img.exemplo.com/a', { fetchFn: naPratica, resolver: publico })).rejects.toBeInstanceOf(ImagemInvalida);
  });

  it('um "JPEG" que na verdade é uma página HTML é recusado', async () => {
    const fetchFn = comoFetch(() => resposta('<html>login</html>', { headers: { 'content-type': 'image/jpeg' } }));
    await expect(baixarFoto('https://img.exemplo.com/a.jpg', { fetchFn, resolver: publico })).rejects.toBeInstanceOf(ImagemInvalida);
  });
});
