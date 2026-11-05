// Configuração do Metro para o monorepo: o app importa o pacote compartilhado (packages/shared),
// que fica fora da pasta apps/mobile. Incluímos a raiz do projeto e o destino real dos vínculos de
// node_modules/@mercado/* (importante quando o projeto é aberto por um atalho de unidade, como P:,
// usado para encurtar os caminhos no Windows ao gerar o APK).
const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const raiz = path.resolve(__dirname, '../..');
const pastas = new Set([...(config.watchFolders ?? []), raiz]);

const vinculos = path.join(raiz, 'node_modules', '@mercado');
try {
  for (const nome of fs.readdirSync(vinculos)) {
    try {
      pastas.add(fs.realpathSync(path.join(vinculos, nome)));
    } catch {
      // Vínculo quebrado: ignora.
    }
  }
} catch {
  // Sem a pasta @mercado (instalação diferente): a raiz já basta.
}

config.watchFolders = [...pastas];

module.exports = config;
