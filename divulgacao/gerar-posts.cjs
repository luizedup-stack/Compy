// Gera as imagens das publicações do Instagram (1080 x 1350) a partir do texto que está aqui embaixo.
//
// Como usar (na pasta do projeto, pelo PowerShell):
//     .\node_modules\electron\dist\electron.exe divulgacao\gerar-posts.cjs
// As imagens saem em divulgacao\instagram\post-01.png ... post-09.png. Para mudar um texto, troque-o na lista SLIDES abaixo
// e rode o comando de novo. Não usa nenhum serviço da internet nem programa pago: o Electron (que já está no projeto) desenha
// a página e tira a "foto".
//
// Os preços e nomes de comércios das imagens são EXEMPLOS inventados (não são de nenhum comércio real).
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');
const SAIDA = path.join(__dirname, 'instagram');
const ICONE = fs.readFileSync(path.join(RAIZ, 'marca', 'icone-bolso-certo.svg'), 'utf8').replace(/<\?xml[^>]*\?>/, '').replace(/width="\d+" height="\d+"/, 'width="100%" height="100%"');
const ARROBA = '@bolsocerto';

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1080px; height: 1350px; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1F2933; overflow: hidden; position: relative; }
  .azul { background: radial-gradient(circle at 85% 12%, #22a9cc 0%, transparent 42%), linear-gradient(150deg, #0F7D99 0%, #0B5F76 100%); color: #fff; }
  .laranja { background: linear-gradient(150deg, #FFA149 0%, #F28C28 55%, #DD6F14 100%); color: #fff; }
  .claro { background: linear-gradient(180deg, #F4FBFD 0%, #E6F5F9 100%); color: #0B5F76; }
  .pagina { position: absolute; inset: 0; padding: 90px 84px 150px; display: flex; flex-direction: column; justify-content: center; gap: 36px; }
  h1 { font-size: 112px; line-height: 1.02; font-weight: 900; letter-spacing: -2px; }
  h2 { font-size: 88px; line-height: 1.05; font-weight: 900; letter-spacing: -1px; }
  p.t { font-size: 46px; line-height: 1.3; font-weight: 500; }
  em { font-style: normal; color: #FFD08A; }
  .claro em { color: #F28C28; }
  .rodape { position: absolute; left: 84px; right: 84px; bottom: 56px; display: flex; align-items: center; justify-content: space-between; font-size: 34px; font-weight: 800; }
  .rodape .logo { display: flex; align-items: center; gap: 16px; }
  .rodape .logo span.ic { width: 62px; height: 62px; display: block; border-radius: 16px; overflow: hidden; }
  .selo { display: inline-block; align-self: flex-start; background: #F28C28; color: #fff; font-weight: 900; font-size: 40px; padding: 12px 30px; border-radius: 999px; }
  .selo.branco { background: #fff; color: #B85C00; }
  .cartao { background: #fff; color: #1F2933; border-radius: 32px; padding: 34px 40px; box-shadow: 0 18px 40px rgba(0,0,0,.18); display: flex; align-items: center; justify-content: space-between; gap: 20px; }
  .cartao b { font-size: 42px; }
  .cartao small { display: block; font-size: 30px; color: #52606D; font-weight: 500; }
  .cartao .preco { font-size: 70px; font-weight: 900; }
  .cartao.verde { outline: 8px solid #F28C28; }
  .cartao.promo { background: #FFF3E0; border: 8px solid #F28C28; flex-direction: column; align-items: stretch; }
  .cartao.promo .faixa { background: #F28C28; color: #fff; font-weight: 900; font-size: 40px; border-radius: 14px; padding: 8px 22px; display: flex; justify-content: space-between; margin-bottom: 14px; }
  .cartao.promo .preco { color: #B85C00; font-size: 104px; }
  .cartao.promo .preco s { font-size: 46px; color: #52606D; font-weight: 600; margin-left: 18px; }
  .passos { display: flex; flex-direction: column; gap: 30px; }
  .passo { display: flex; gap: 32px; align-items: center; background: rgba(255,255,255,.14); border-radius: 30px; padding: 30px 36px; }
  .claro .passo { background: #fff; box-shadow: 0 10px 28px rgba(15,125,153,.12); }
  .passo .n { flex: none; width: 96px; height: 96px; border-radius: 50%; background: #F28C28; color: #fff; font-weight: 900; font-size: 56px; display: grid; place-items: center; }
  .passo b { font-size: 50px; display: block; line-height: 1.1; }
  .passo span.d { font-size: 34px; opacity: .92; }
  .chips { display: flex; flex-wrap: wrap; gap: 18px; }
  .chip { font-size: 40px; font-weight: 800; padding: 16px 34px; border-radius: 999px; border: 4px solid #fff; }
  .chip.on { background: #fff; color: #0B5F76; }
  .chip.l { border-color: #0F7D99; color: #0B5F76; }
  .chip.l.on { background: #0B5F76; color: #fff; }
  .preco-gigante { font-size: 230px; font-weight: 900; line-height: 1; }
  .nota { font-size: 30px; opacity: .8; }
`;

const logoRodape = `<div class="logo"><span class="ic">${ICONE}</span><span>Bolso Certo</span></div><span>${ARROBA}</span>`;

/** Cada item é uma publicação: classe do fundo + o miolo (HTML). */
const SLIDES = [
  {
    nome: 'post-01-apresentacao',
    fundo: 'azul',
    miolo: `
      <div style="width:230px;height:230px;border-radius:56px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.3)">${ICONE}</div>
      <h1>Bolso Certo</h1>
      <p class="t"><em>Compare preços.</em><br>Economize de verdade.</p>
      <span class="selo">Já disponível para Android</span>`,
  },
  {
    nome: 'post-02-mesmo-produto',
    fundo: 'claro',
    miolo: `
      <h2>O mesmo produto.<br><em>Preços diferentes.</em></h2>
      <div class="cartao"><div><b>Comércio A</b><small>Arroz 5 kg</small></div><div class="preco">R$ 24,90</div></div>
      <div class="cartao"><div><b>Comércio B</b><small>Arroz 5 kg</small></div><div class="preco">R$ 27,50</div></div>
      <div class="cartao verde"><div><b>Comércio C ✅</b><small>Arroz 5 kg · mais barato</small></div><div class="preco" style="color:#B85C00">R$ 22,90</div></div>
      <p class="nota" style="color:#52606D">Exemplo ilustrativo. O Bolso Certo mostra isso para você, em segundos.</p>`,
  },
  {
    nome: 'post-03-como-funciona',
    fundo: 'azul',
    miolo: `
      <h2>Como funciona<br><em>o app</em></h2>
      <div class="passos">
        <div class="passo"><div class="n">1</div><div><b>Procure</b><span class="d">Digite o produto. Sem criar conta.</span></div></div>
        <div class="passo"><div class="n">2</div><div><b>Compare</b><span class="d">Veja o preço em cada comércio.</span></div></div>
        <div class="passo"><div class="n">3</div><div><b>Vá até lá</b><span class="d">Google Maps ou Waze com um toque.</span></div></div>
      </div>`,
  },
  {
    nome: 'post-04-ordenar-filtrar',
    fundo: 'claro',
    miolo: `
      <h2>Ordene.<br><em>Filtre.</em><br>Ache mais rápido.</h2>
      <p class="t" style="font-weight:800">Ordenar por</p>
      <div class="chips"><span class="chip l on">Relevância</span><span class="chip l">Menor preço</span><span class="chip l">Maior preço</span><span class="chip l">Recentes</span></div>
      <p class="t" style="font-weight:800">Filtros</p>
      <div class="chips"><span class="chip l">💲 Faixa de preço</span><span class="chip l">⚖️ Quantidade</span><span class="chip l">🔥 Só promoções</span><span class="chip l">🏪 Comércios</span></div>`,
  },
  {
    nome: 'post-05-promocao',
    fundo: 'laranja',
    miolo: `
      <span class="selo branco">🔥 PROMOÇÃO NO APP</span>
      <h2>Oferta boa<br>a gente destaca.</h2>
      <div class="cartao promo">
        <div class="faixa"><span>🔥 PROMOÇÃO</span><span>até 15/11</span></div>
        <b>Comércio Exemplo</b>
        <div class="preco">R$ 19,90<s>R$ 24,90</s></div>
        <small>Arroz 5 kg · R$ 3,98 por kg</small>
      </div>
      <p class="t">Preço antigo riscado. Data final à vista.</p>`,
  },
  {
    nome: 'post-06-sem-internet',
    fundo: 'azul',
    miolo: `
      <h2>Sem conta.<br>Sem custo.<br><em>Sem sinal?</em></h2>
      <p class="t">O app guarda uma cópia dos produtos no seu celular. Você consulta até sem internet e ele atualiza quando o sinal volta.</p>
      <div class="chips"><span class="chip on">📴 Funciona offline</span><span class="chip on">🆓 Grátis</span><span class="chip on">📸 Com foto</span></div>`,
  },
  {
    nome: 'post-07-comercios',
    fundo: 'claro',
    miolo: `
      <span class="selo">PARA COMÉRCIOS</span>
      <h2>Seu comércio<br>no <em>Bolso Certo</em></h2>
      <div class="passos">
        <div class="passo"><div class="n">1</div><div><b>Crie a conta</b><span class="d">Só e-mail e senha.</span></div></div>
        <div class="passo"><div class="n">2</div><div><b>Envie uma planilha</b><span class="d">Produtos e preços de uma vez.</span></div></div>
        <div class="passo"><div class="n">3</div><div><b>Apareça para quem procura</b><span class="d">Clientes comparam e vão até você.</span></div></div>
      </div>`,
  },
  {
    nome: 'post-08-promocoes-comercio',
    fundo: 'laranja',
    miolo: `
      <span class="selo branco">PROMOÇÕES PARA COMÉRCIOS</span>
      <h2>Destaque suas ofertas</h2>
      <div class="preco-gigante">R$ 5</div>
      <p class="t">por produto em promoção.<br>Preencha a aba <b>Descontos</b> da planilha, pague por <b>Pix</b> e pronto: sua oferta aparece em laranja para todo mundo.</p>`,
  },
  {
    nome: 'post-09-chamada',
    fundo: 'azul',
    miolo: `
      <div style="width:200px;height:200px;border-radius:50px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.3)">${ICONE}</div>
      <h2>Compare antes<br><em>de comprar.</em></h2>
      <p class="t">📲 Baixe o app (Android)<br>🏪 Cadastre seu comércio</p>
      <span class="selo">Link na bio 👆</span>`,
  },
];

function html(s) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${CSS}</style></head>
    <body class="${s.fundo}"><div class="pagina">${s.miolo}</div><div class="rodape">${logoRodape}</div></body></html>`;
}

async function tirarFoto(janela, conteudo, arquivo) {
  await janela.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(conteudo));
  await new Promise((r) => setTimeout(r, 400)); // dá tempo de desenhar
  const imagem = await janela.webContents.capturePage();
  fs.writeFileSync(arquivo, imagem.toPNG());
  console.log('gerado', path.relative(RAIZ, arquivo), imagem.getSize());
}

app.commandLine.appendSwitch('force-device-scale-factor', '1'); // sempre 1080 x 1350, mesmo com a tela do Windows ampliada
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  fs.mkdirSync(SAIDA, { recursive: true });
  const janela = new BrowserWindow({ width: 1080, height: 1350, show: false, useContentSize: true, webPreferences: { offscreen: false, zoomFactor: 1 } });
  janela.setContentSize(1080, 1350);
  for (const s of SLIDES) await tirarFoto(janela, html(s), path.join(SAIDA, `${s.nome}.png`));
  app.quit();
});
