// Gera os ícones da marca Compy (app do celular, programa de Windows e painel) a partir dos desenhos em marca/*.svg.
// Uso (na pasta do projeto):  node marca/gerar-icones.cjs
// Precisa do Playwright (que desenha o SVG num navegador): npm i -D playwright  (e um navegador instalado, ex.: npx playwright install chromium).
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..');
const MARCA = __dirname;
const MOBILE = path.join(RAIZ, 'apps/mobile/assets');
const DESKTOP = path.join(RAIZ, 'apps/desktop/icones');
const PAINEL = path.join(RAIZ, 'apps/painel/public');

const lerSvg = (nome) => fs.readFileSync(path.join(MARCA, nome), 'utf8');

/** Desenha o SVG no tamanho pedido (fundo transparente) e devolve o PNG. */
async function desenhar(pagina, nomeSvg, tamanho) {
  const svg = lerSvg(nomeSvg).replace(/width="\d+" height="\d+"/, `width="${tamanho}" height="${tamanho}"`);
  await pagina.setViewportSize({ width: tamanho, height: tamanho });
  await pagina.setContent(`<body style="margin:0;background:transparent">${svg}</body>`);
  return pagina.screenshot({ omitBackground: true });
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

(async () => {
  const navegador = await chromium.launch();
  const pagina = await navegador.newPage();
  const grava = (destino, dados) => fs.writeFileSync(destino, dados);

  // App do celular
  grava(path.join(MOBILE, 'icon.png'), await desenhar(pagina, 'icone-compy-quadrado.svg', 1024));
  grava(path.join(MOBILE, 'splash-icon.png'), await desenhar(pagina, 'icone-compy.svg', 1024));
  grava(path.join(MOBILE, 'favicon.png'), await desenhar(pagina, 'icone-compy.svg', 48));
  grava(path.join(MOBILE, 'android-icon-background.png'), await desenhar(pagina, 'fundo-compy.svg', 512));
  grava(path.join(MOBILE, 'android-icon-foreground.png'), await desenhar(pagina, 'glifo-compy.svg', 512));
  grava(path.join(MOBILE, 'android-icon-monochrome.png'), await desenhar(pagina, 'glifo-compy-mono.svg', 432));
  // Programa de computador
  fs.mkdirSync(DESKTOP, { recursive: true });
  grava(path.join(DESKTOP, 'icone.png'), await desenhar(pagina, 'icone-compy.svg', 256));
  const pngs = [];
  for (const tamanho of [16, 24, 32, 48, 64, 128, 256]) pngs.push({ tamanho, dados: await desenhar(pagina, 'icone-compy.svg', tamanho) });
  grava(path.join(DESKTOP, 'icone.ico'), montarIco(pngs));
  // Painel (aba do navegador e cabeçalho)
  fs.mkdirSync(PAINEL, { recursive: true });
  fs.copyFileSync(path.join(MARCA, 'icone-compy.svg'), path.join(PAINEL, 'icone-compy.svg'));

  await navegador.close();
  console.log('Ícones da marca Compy gerados.');
})();
