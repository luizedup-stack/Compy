// Gera os ícones (PNG do app, ícone do .exe) a partir do desenho em marca/icone-bolso-certo.svg.
// Roda dentro do Electron, que desenha o SVG: npx electron apps/desktop/gerar-icones.cjs
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '../..');
const MOBILE = path.join(RAIZ, 'apps/mobile/assets');
const SAIDA = path.join(__dirname, 'icones');
const COR = '#0F7D99';

const GLIFO = `
  <circle cx="50" cy="22" r="10" fill="#EF9F27"/>
  <circle cx="50" cy="22" r="5.5" fill="none" stroke="#FAC775" stroke-width="1.5"/>
  <path d="M18 28 H62 V48 Q62 62 40 71 Q18 62 18 48 Z" fill="#FFFFFF"/>
  <line x1="24" y1="34" x2="56" y2="34" stroke="#A5DDEB" stroke-width="1.5" stroke-dasharray="3 3"/>
  <path d="M30 49 L37 56 L51 41" fill="none" stroke="${COR}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;

// Cada desenho: [arquivo, tamanho, svg]
const svg = (viewBox, miolo) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%">${miolo}</svg>`;
const MONO = `
  <defs><mask id="m"><rect x="-20" y="-20" width="120" height="120" fill="#fff"/>
    <path d="M30 49 L37 56 L51 41" fill="none" stroke="#000" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></mask></defs>
  <g mask="url(#m)"><circle cx="50" cy="22" r="10" fill="#000"/><path d="M18 28 H62 V48 Q62 62 40 71 Q18 62 18 48 Z" fill="#000"/></g>`;

const DESENHOS = [
  ['quadrado', 1024, svg('0 0 80 80', `<rect width="80" height="80" fill="${COR}"/>${GLIFO}`)],
  ['arredondado', 1024, svg('0 0 80 80', `<rect width="80" height="80" rx="18" fill="${COR}"/>${GLIFO}`)],
  ['fundo-adaptivo', 512, svg('0 0 80 80', `<rect width="80" height="80" fill="${COR}"/>`)],
  ['frente-adaptiva', 512, svg('-10 -10 100 100', GLIFO)],
  ['monocromatico', 432, svg('-10 -10 100 100', MONO)],
];

// O Electron só desenha com confiança em janelas pequenas (e uma de cada vez): desenhamos sempre em 512 e
// ajustamos o tamanho depois (os desenhos são formas lisas, então o resultado fica nítido).
const BASE = 512;
let janela = null;

async function desenhar(tamanho, conteudo) {
  janela ??= new BrowserWindow({ width: BASE, height: BASE, show: false, frame: false, backgroundColor: '#00000000', webPreferences: { offscreen: true } });
  const html = `<html><body style="margin:0;background:transparent;overflow:hidden;width:${BASE}px;height:${BASE}px">${conteudo}</body></html>`;
  await janela.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 400));
  const imagem = await janela.webContents.capturePage();
  const tam = imagem.getSize();
  return tam.width === tamanho && tam.height === tamanho ? imagem : imagem.resize({ width: tamanho, height: tamanho, quality: 'best' });
}

/** Arquivo .ico com PNGs dentro (formato aceito desde o Windows Vista). */
function montarIco(pngs) {
  const cabecalho = Buffer.alloc(6);
  cabecalho.writeUInt16LE(1, 2);
  cabecalho.writeUInt16LE(pngs.length, 4);
  const entradas = [];
  let deslocamento = 6 + 16 * pngs.length;
  for (const { tamanho, dados } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(tamanho >= 256 ? 0 : tamanho, 0);
    e.writeUInt8(tamanho >= 256 ? 0 : tamanho, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(dados.length, 8);
    e.writeUInt32LE(deslocamento, 12);
    deslocamento += dados.length;
    entradas.push(e);
  }
  return Buffer.concat([cabecalho, ...entradas, ...pngs.map((p) => p.dados)]);
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  fs.mkdirSync(SAIDA, { recursive: true });
  const feitos = {};
  for (const [nome, tamanho, conteudo] of DESENHOS) feitos[nome] = await desenhar(tamanho, conteudo);

  const grava = (destino, imagem, tamanho) => {
    const redim = tamanho && imagem.getSize().width !== tamanho ? imagem.resize({ width: tamanho, height: tamanho, quality: 'best' }) : imagem;
    fs.writeFileSync(destino, redim.toPNG());
  };
  // App do celular
  grava(path.join(MOBILE, 'icon.png'), feitos.quadrado, 1024);
  grava(path.join(MOBILE, 'splash-icon.png'), feitos.arredondado, 1024);
  grava(path.join(MOBILE, 'favicon.png'), feitos.arredondado, 48);
  grava(path.join(MOBILE, 'android-icon-background.png'), feitos['fundo-adaptivo'], 512);
  grava(path.join(MOBILE, 'android-icon-foreground.png'), feitos['frente-adaptiva'], 512);
  grava(path.join(MOBILE, 'android-icon-monochrome.png'), feitos.monocromatico, 432);
  // Programa de computador
  grava(path.join(SAIDA, 'icone.png'), feitos.arredondado, 256);
  const tamanhos = [16, 24, 32, 48, 64, 128, 256];
  const pngs = tamanhos.map((t) => ({ tamanho: t, dados: feitos.arredondado.resize({ width: t, height: t, quality: 'best' }).toPNG() }));
  fs.writeFileSync(path.join(SAIDA, 'icone.ico'), montarIco(pngs));
  console.log('Ícones gerados.');
  app.quit();
});
