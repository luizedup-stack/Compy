// Testes das partes puras do coletor VTEX (sem internet): código de barras, categorias e leitura do produto.
import assert from 'node:assert/strict';
import test from 'node:test';
import { eanValido, folhas, registrosDe } from './coletar-vtex.mjs';

test('eanValido confere o dígito verificador e o tamanho', () => {
  assert.equal(eanValido('7891000100103'), true); // EAN-13
  assert.equal(eanValido('96385074'), true); // EAN-8
  assert.equal(eanValido('7891000100104'), false); // dígito errado
  assert.equal(eanValido('123'), false);
  assert.equal(eanValido('0000000000000'), false);
  assert.equal(eanValido('78910001001A3'), false);
});

test('folhas monta o caminho completo (a VTEX filtra por "C:/topo/filho/neto/") e usa o departamento como topo', () => {
  const arvore = [
    { id: 1, name: 'Loja', children: [{ id: 10, name: 'Mercearia', children: [{ id: 100, name: 'Arroz', children: [] }, { id: 101, name: 'Feijão', children: [] }] }, { id: 11, name: 'Bebidas', children: [] }] },
  ];
  assert.deepEqual(folhas(arvore), [
    { fq: 'C:/1/10/100/', topo: 'Mercearia' },
    { fq: 'C:/1/10/101/', topo: 'Mercearia' },
    { fq: 'C:/1/11/', topo: 'Bebidas' },
  ]);
  // Várias raízes: o nome da raiz é o departamento.
  assert.deepEqual(folhas([{ id: 5, name: 'Limpeza', children: [] }, { id: 6, name: 'Higiene', children: [] }]).map((x) => x.topo), ['Limpeza', 'Higiene']);
});

test('registrosDe guarda só item disponível, com preço e código de barras válido', () => {
  const produto = {
    productName: 'Arroz Tipo 1 5 kg', brand: 'Marca', link: 'https://loja/p',
    items: [
      { ean: '7891000100103', measurementUnit: 'un', unitMultiplier: 1, images: [{ imageUrl: 'http://img/a.jpg' }], sellers: [{ commertialOffer: { Price: 27.9, AvailableQuantity: 10 } }] },
      { ean: '7891000100103', sellers: [{ commertialOffer: { Price: 0, AvailableQuantity: 10 } }] }, // sem preço
      { ean: '7891000100110', sellers: [{ commertialOffer: { Price: 5, AvailableQuantity: 0 } }] }, // sem estoque
      { ean: '123', sellers: [{ commertialOffer: { Price: 5, AvailableQuantity: 3 } }] }, // código inválido
    ],
  };
  const r = registrosDe(produto, 'Mercearia');
  assert.equal(r.length, 1);
  assert.deepEqual({ ean: r[0].ean, nome: r[0].nome, preco: r[0].preco, categoria: r[0].categoria, foto: r[0].foto }, {
    ean: '7891000100103', nome: 'Arroz Tipo 1 5 kg', preco: 27.9, categoria: 'Mercearia', foto: 'https://img/a.jpg',
  });
});
