const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizarUrlNuvem } = require('./nuvem.cjs');

test('guarda só o endereço-base', () => {
  assert.equal(normalizarUrlNuvem('https://bolso-certo.onrender.com'), 'https://bolso-certo.onrender.com');
  assert.equal(normalizarUrlNuvem('  https://bolso-certo.onrender.com/painel-web/entrar?x=1  '), 'https://bolso-certo.onrender.com');
  assert.equal(normalizarUrlNuvem('HTTPS://Bolso-Certo.onrender.com/'), 'https://bolso-certo.onrender.com');
});

test('http só vale no próprio computador', () => {
  assert.equal(normalizarUrlNuvem('http://localhost:3000'), 'http://localhost:3000');
  assert.equal(normalizarUrlNuvem('http://127.0.0.1:3300/'), 'http://127.0.0.1:3300');
  assert.throws(() => normalizarUrlNuvem('http://bolso-certo.onrender.com'), /https/);
  assert.throws(() => normalizarUrlNuvem('http://192.168.0.10:3000'), /https/);
});

test('recusa o que não é endereço', () => {
  assert.throws(() => normalizarUrlNuvem('bolso-certo.onrender.com'), /inválido/);
  assert.throws(() => normalizarUrlNuvem(''), /inválido/);
  assert.throws(() => normalizarUrlNuvem('ftp://x.com'), /https/);
  assert.throws(() => normalizarUrlNuvem('javascript:alert(1)'), /https/);
});
