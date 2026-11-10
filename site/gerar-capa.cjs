// Gera site/capa.png (1200 x 630): a imagem que aparece quando o link do site é compartilhado (WhatsApp, Instagram, etc.).
// Como usar: .\node_modules\electron\dist\electron.exe site\gerar-capa.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const AQUI = __dirname;
const ICONE = fs.readFileSync(path.join(AQUI, 'icone.svg'), 'utf8').replace(/<\?xml[^>]*\?>/, '').replace(/width="\d+" height="\d+"/, 'width="100%" height="100%"');

const HTML = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; font-family: 'Segoe UI', Arial, sans-serif; overflow: hidden; }
  body { background: radial-gradient(circle at 85% 15%, #2E6BFF 0%, transparent 45%), linear-gradient(135deg, #0B1F5B 0%, #081646 100%); display: flex; align-items: center; gap: 56px; padding: 0 90px; color: #fff; }
  .icone { width: 260px; height: 260px; border-radius: 58px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,.35); flex: none; }
  h1 { font-size: 86px; font-weight: 900; line-height: 1.02; letter-spacing: -1px; }
  p { font-size: 34px; font-weight: 500; color: #D7E0FF; margin-top: 14px; }
  em { font-style: normal; color: #FF8A00; }
</style></head>
<body>
  <div class="icone">${ICONE}</div>
  <div><h1>Compy</h1><p><em>Compare antes</em> de comprar.</p></div>
</body></html>`;

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const janela = new BrowserWindow({ width: 1200, height: 630, show: false, useContentSize: true });
  janela.setContentSize(1200, 630);
  await janela.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(HTML));
  await new Promise((r) => setTimeout(r, 400));
  const imagem = await janela.webContents.capturePage();
  fs.writeFileSync(path.join(AQUI, 'capa.png'), imagem.toPNG());
  console.log('gerado site/capa.png', imagem.getSize());
  app.quit();
});
