// Programa de computador "Bolso Certo - Mercado" (Electron).
//
// O que ele faz, em ordem:
//   1. abre uma janela de "carregando";
//   2. liga a API dentro do próprio programa (arquivo api.cjs, gerado de apps/api + apps/desktop/api-embutida.ts)
//      na porta PORTA_API, que é a que o aplicativo do celular consulta;
//   3. serve o painel do mercado (pasta painel/) numa porta local livre e mostra na janela;
//   4. ao fechar, grava os dados em arquivo (veja api-embutida.ts) para voltarem na próxima abertura.
// Não precisa de internet nem de instalar mais nada. Quem mexe só neste arquivo mexe na "casca" do programa;
// as regras do sistema ficam em apps/api e apps/painel.
const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const PORTA_API = Number(process.env.BOLSO_PORTA_API) || 3000; // 3000 por padrão: o app do celular aponta para ela
let portaPainel = 0; // qualquer porta livre (a 3001, por exemplo, pode estar em uso por outro programa)
// Conta do DESENVOLVEDOR (papel "admin"): enxerga todos os mercados e pode escolher qualquer um no painel.
// Os mercados comuns se cadastram sozinhos (tela "Cadastrar meu mercado") e só veem o que é deles.
// Esta senha é só para teste local; antes de publicar na internet ela precisa ser trocada (variáveis ADMIN_EMAIL e
// ADMIN_SENHA da API) e não deve ficar escrita no código.
const ADMIN_EMAIL = 'admin@bolsocerto.local';
const ADMIN_SENHA = 'BolsoCerto-Teste-2026';

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

let apiEmbutida = null; // o módulo api.cjs (emailsRecentes, iniciarApi)
let api = null; // a API em execução (app, salvarAgora, apagarSalvos)
let saindo = false;
let servidorPainel = null;
let janela = null;
let janelaCodigos = null;
let janelaEmail = null;

const escapar = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Endereços IPv4 do computador na rede (o celular usa um deles para falar com a API). */
function enderecosDaRede() {
  const lista = [];
  for (const [nome, itens] of Object.entries(os.networkInterfaces())) {
    for (const i of itens ?? []) if (i.family === 'IPv4' && !i.internal) lista.push({ nome, ip: i.address });
  }
  return lista;
}

function paginaDeCodigos() {
  const enderecos = enderecosDaRede();
  const rede = enderecos.length
    ? enderecos.map((e) => `<li><b>http://${escapar(e.ip)}:${PORTA_API}</b> <small>(${escapar(e.nome)})</small></li>`).join('')
    : '<li>Este computador não está em nenhuma rede.</li>';
  const emails = apiEmbutida?.emailsRecentes() ?? [];
  const itens = emails.length
    ? emails
        .map(
          (m) =>
            `<article><small>${escapar(new Date(m.quando).toLocaleString('pt-BR'))} · para ${escapar(m.para)} · <b>${escapar(m.situacao)}</b></small><h3>${escapar(m.assunto)}</h3><pre>${escapar(m.texto)}</pre></article>`,
        )
        .join('')
    : '<p>Nenhum e-mail ainda. Quando alguém criar uma conta no app, o código de confirmação aparece aqui.</p>';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>Códigos de e-mail e celular</title>
<style>body{font:15px Segoe UI,Arial,sans-serif;margin:24px;color:#1f2933}h1{color:#0f7d99;font-size:22px}h2{font-size:17px;margin-top:28px}
article{border:1px solid #c8d6dc;border-radius:8px;padding:10px 14px;margin:10px 0}pre{white-space:pre-wrap;font:14px Consolas,monospace;margin:4px 0}h3{margin:6px 0}li{margin:4px 0}</style></head><body>
<h1>Bolso Certo - Mercado</h1>
<h2>Endereço para o celular (Configurar servidor no app)</h2><ul>${rede}</ul>
<p><small>O celular precisa estar na mesma rede Wi-Fi deste computador. Se o Windows perguntar sobre o firewall, permita em "Redes privadas".</small></p>
<h2>Códigos de e-mail (a página atualiza sozinha)</h2>
<p><small>Se os e-mails não chegam para as pessoas, o envio ainda não está configurado: use o menu <b>Bolso Certo → Configurar e-mail…</b>. Enquanto isso, o código de cada pessoa aparece aqui.</small></p>${itens}</body></html>`;
}

/** Tela "Configurar e-mail": situação, botão para abrir o arquivo de configuração e envio de um e-mail de teste. */
function paginaDeEmail() {
  const st = apiEmbutida.statusDoEmail();
  const situacao = st.configurado
    ? `<p class="ok">Configurado. Os e-mails saem como <b>${escapar(st.de)}</b>.</p>`
    : `<p class="erro">Ainda NÃO configurado (${escapar(st.motivo)}). Os códigos só aparecem na tela "Códigos de e-mail".</p>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Configurar e-mail</title>
<style>body{font:15px Segoe UI,Arial,sans-serif;margin:24px;color:#1f2933;max-width:640px}h1{color:#0f7d99;font-size:22px}
.ok{color:#116611}.erro{color:#a32d2d}button,input{font:inherit;padding:6px 10px}button{cursor:pointer}pre{background:#f2f7f9;padding:8px;border-radius:6px;white-space:pre-wrap}</style></head><body>
<h1>Configurar o envio de e-mail</h1>
${situacao}
<p>Para que os códigos de confirmação cheguem na caixa de entrada das pessoas, o programa precisa de uma conta de e-mail para enviar
(servidor SMTP, usuário e senha). <b>1)</b> Clique em "Abrir arquivo de configuração", <b>2)</b> preencha os campos e salve,
<b>3)</b> envie um e-mail de teste abaixo. Não precisa fechar o programa.</p>
<p><button id="abrir">Abrir arquivo de configuração</button></p>
<p><small>Arquivo: ${escapar(st.arquivo || '')}</small></p>
<h2>E-mail de teste</h2>
<p><input id="para" type="email" placeholder="seu e-mail" size="32"> <button id="testar">Enviar teste</button></p>
<pre id="resultado" hidden></pre>
<script>
const cab = { 'Content-Type': 'application/json', 'x-bolso': '1' };
const mostrar = (t) => { const r = document.getElementById('resultado'); r.hidden = false; r.textContent = t; };
document.getElementById('abrir').onclick = async () => { await fetch('/__abrir-config', { method: 'POST', headers: cab, body: '{}' }); mostrar('Arquivo aberto. Salve depois de preencher e volte aqui para testar.'); };
document.getElementById('testar').onclick = async () => {
  const para = document.getElementById('para').value.trim();
  if (!para) { mostrar('Digite o e-mail que vai receber o teste.'); return; }
  mostrar('Enviando…');
  const r = await fetch('/__testar-email', { method: 'POST', headers: cab, body: JSON.stringify({ para }) });
  const j = await r.json();
  mostrar((j.ok ? 'OK: ' : 'FALHOU: ') + j.mensagem);
  if (j.ok) setTimeout(() => location.reload(), 1500);
};
</script></body></html>`;
}

/** Entrega os arquivos do painel; qualquer endereço sem arquivo cai no index.html (rotas do painel). */
function iniciarServidorDoPainel(pasta) {
  const servidor = http.createServer((req, res) => {
    const caminhoUrl = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (caminhoUrl === '/__email' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(paginaDeEmail());
      return;
    }
    if (req.method === 'POST' && (caminhoUrl === '/__abrir-config' || caminhoUrl === '/__testar-email')) {
      // O cabeçalho x-bolso impede que uma página qualquer da internet acione estas ações (o navegador exigiria permissão).
      if (req.headers['x-bolso'] !== '1') {
        res.writeHead(403).end();
        return;
      }
      let corpo = '';
      req.on('data', (parte) => (corpo += parte));
      req.on('end', async () => {
        let resposta = { ok: true, mensagem: 'ok' };
        try {
          if (caminhoUrl === '/__abrir-config') {
            const arq = arquivoConfigEmail();
            if (!fs.existsSync(arq)) fs.writeFileSync(arq, apiEmbutida.MODELO_CONFIG_EMAIL, 'utf8');
            await shell.openPath(arq);
          } else {
            const { para } = JSON.parse(corpo || '{}');
            resposta = await apiEmbutida.enviarEmailDeTeste(String(para || ''));
          }
        } catch (e) {
          resposta = { ok: false, mensagem: e && e.message ? e.message : String(e) };
        }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(resposta));
      });
      return;
    }
    if (caminhoUrl === '/__codigos') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(paginaDeCodigos());
      return;
    }
    let arquivo = path.normalize(path.join(pasta, caminhoUrl));
    if (!arquivo.startsWith(pasta)) {
      res.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) arquivo = path.join(pasta, 'index.html');
    res.writeHead(200, { 'content-type': TIPOS[path.extname(arquivo).toLowerCase()] ?? 'application/octet-stream' });
    fs.createReadStream(arquivo).pipe(res);
  });
  return new Promise((resolver, rejeitar) => {
    servidor.once('error', rejeitar);
    servidor.listen(0, "127.0.0.1", () => {
      portaPainel = servidor.address().port;
      resolver(servidor);
    });
  });
}

function abrirCodigos() {
  if (janelaCodigos && !janelaCodigos.isDestroyed()) {
    janelaCodigos.focus();
    return;
  }
  janelaCodigos = new BrowserWindow({ width: 640, height: 560, title: 'Códigos de e-mail e celular', icon: iconeDaJanela() });
  janelaCodigos.setMenu(null);
  janelaCodigos.loadURL(`http://127.0.0.1:${portaPainel}/__codigos`);
}

/** Onde fica o arquivo em que o dono preenche os dados do servidor de e-mail (SMTP). */
function arquivoConfigEmail() {
  return path.join(app.getPath('userData'), 'configuracao-email.json');
}

function abrirConfigEmail() {
  if (janelaEmail && !janelaEmail.isDestroyed()) {
    janelaEmail.loadURL(`http://127.0.0.1:${portaPainel}/__email`);
    janelaEmail.focus();
    return;
  }
  janelaEmail = new BrowserWindow({ width: 700, height: 620, title: 'Configurar e-mail', icon: iconeDaJanela() });
  janelaEmail.setMenu(null);
  janelaEmail.loadURL(`http://127.0.0.1:${portaPainel}/__email`);
}

function iconeDaJanela() {
  const arquivo = path.join(__dirname, 'icone.png');
  return fs.existsSync(arquivo) ? arquivo : undefined;
}

function apagarSalvosERecomecar() {
  const resposta = dialog.showMessageBoxSync(janela, {
    type: 'warning',
    buttons: ['Cancelar', 'Apagar e recomeçar'],
    defaultId: 0,
    cancelId: 0,
    title: 'Bolso Certo - Mercado',
    message: 'Apagar tudo o que foi salvo?',
    detail: 'Contas de clientes e correções feitas à mão serão perdidas. O programa abre de novo com as planilhas originais.',
  });
  if (resposta !== 1) return;
  api?.apagarSalvos();
  app.relaunch();
  app.exit(0);
}

function montarMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Bolso Certo',
        submenu: [
          { label: 'Códigos de e-mail e endereço do celular', accelerator: 'CmdOrCtrl+E', click: abrirCodigos },
          { label: 'Configurar e-mail…', click: abrirConfigEmail },
          { label: 'Recarregar', accelerator: 'CmdOrCtrl+R', click: () => janela?.reload() },
          { label: 'Apagar os dados salvos e recomeçar…', click: apagarSalvosERecomecar },
          { type: 'separator' },
          { label: 'Sair', accelerator: 'Alt+F4', click: () => app.quit() },
        ],
      },
      { label: 'Exibir', submenu: [{ role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { role: 'togglefullscreen' }] },
    ]),
  );
}

async function iniciar() {
  montarMenu();
  janela = new BrowserWindow({ width: 1200, height: 800, title: 'Bolso Certo - Mercado', icon: iconeDaJanela(), backgroundColor: '#f2f7f9' });
  janela.loadURL(
    'data:text/html;charset=utf-8,' +
      encodeURIComponent(
        '<body style="font:18px Segoe UI,Arial;display:flex;height:100vh;align-items:center;justify-content:center;color:#0f7d99;background:#f2f7f9">Iniciando o Bolso Certo - Mercado… (carregando as planilhas)</body>',
      ),
  );
  janela.on('closed', () => app.quit());

  try {
    apiEmbutida = require(path.join(__dirname, 'api.cjs'));
    api = await apiEmbutida.iniciarApi({
      porta: PORTA_API,
      pastaDados: path.join(__dirname, 'dados'),
      pastaSalvos: path.join(app.getPath('userData'), 'salvos'),
      arquivoConfigEmail: arquivoConfigEmail(),
      adminEmail: ADMIN_EMAIL,
      adminSenha: ADMIN_SENHA,
    });
    servidorPainel = await iniciarServidorDoPainel(path.join(__dirname, 'painel'));
  } catch (erro) {
    const emUso = erro && erro.code === 'EADDRINUSE';
    dialog.showErrorBox(
      'Bolso Certo - Mercado',
      emUso
        ? `A porta ${erro.port ?? ''} já está em uso. Feche o Bolso Certo - Mercado que já estiver aberto (ou as janelas do "npm run testar") e abra de novo.`
        : `Não foi possível iniciar: ${erro && erro.message ? erro.message : erro}`,
    );
    app.exit(1);
    return;
  }
  janela.loadURL(`http://127.0.0.1:${portaPainel}/`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (janela) {
      if (janela.isMinimized()) janela.restore();
      janela.focus();
    }
  });
  app.whenReady().then(iniciar);
  app.on('window-all-closed', () => app.quit());
  // Ao sair, grava os dados antes de fechar (o fechamento espera a gravação terminar).
  app.on('before-quit', (evento) => {
    if (saindo) return;
    evento.preventDefault();
    saindo = true;
    (async () => {
      try {
        await api?.salvarAgora();
      } catch {
        // Sem espaço ou sem permissão: sai mesmo assim.
      }
      servidorPainel?.close();
      await api?.app?.close().catch(() => undefined);
      app.exit(0);
    })();
  });
}
