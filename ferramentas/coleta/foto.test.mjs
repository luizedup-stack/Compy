import assert from 'node:assert/strict';
import test from 'node:test';
import { urlDaFoto } from './foto.mjs';

test('texto simples vira https', () => {
  assert.equal(urlDaFoto('https://atacadao.vtexassets.com/arquivos/ids/1/a.jpg?v=1'), 'https://atacadao.vtexassets.com/arquivos/ids/1/a.jpg?v=1');
  assert.equal(urlDaFoto('http://loja.com/a.jpg'), 'https://loja.com/a.jpg');
  assert.equal(urlDaFoto('//cdn.loja.com/a.jpg'), 'https://cdn.loja.com/a.jpg');
  assert.equal(urlDaFoto('  https://loja.com/a.jpg  '), 'https://loja.com/a.jpg');
});

test('lista: pega a primeira utilizável', () => {
  assert.equal(urlDaFoto(['', 'lixo', 'https://loja.com/b.jpg', 'https://loja.com/c.jpg']), 'https://loja.com/b.jpg');
});

test('objeto de imagem estruturada (url, contentUrl, imageUrl) e lista de objetos', () => {
  assert.equal(urlDaFoto({ '@type': 'ImageObject', url: 'https://loja.com/a.jpg' }), 'https://loja.com/a.jpg');
  assert.equal(urlDaFoto({ contentUrl: 'https://loja.com/b.jpg' }), 'https://loja.com/b.jpg');
  assert.equal(urlDaFoto([{ imageUrl: 'https://loja.com/c.jpg' }]), 'https://loja.com/c.jpg');
});

test('sem foto ou valor estranho: texto vazio', () => {
  for (const v of [undefined, null, '', [], {}, 42, 'foto', 'ftp://x.com/a.jpg', { url: 5 }]) assert.equal(urlDaFoto(v), '', String(v));
});
