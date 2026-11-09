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
const { randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { normalizarUrlNuvem } = require('./nuvem.cjs');

const PORTA_API = Number(process.env.BOLSO_PORTA_API) || 3000; // 3000 por padrão: o app do celular aponta para ela
let portaPainel = 0; // qualquer porta livre (a 3001, por exemplo, pode estar em uso por outro programa)
// Conta do DESENVOLVEDOR (papel "admin"): enxerga todos os mercados e pode escolher qualquer um no painel.
// Os mercados comuns se cadastram sozinhos (tela "Cadastrar meu mercado") e só veem o que é deles.
// A senha NÃO fica escrita no código: é gerada (aleatória) na primeira abertura e guardada no arquivo
// senha-desenvolvedor.txt, na pasta de dados do programa. Ela aparece na tela "Códigos de e-mail e endereço do celular".
// (Variável de ambiente BOLSO_ADMIN_SENHA, se existir, tem prioridade.)
const ADMIN_EMAIL = 'admin@bolsocerto.local';

function senhaDoDesenvolvedor() {
  if (process.env.BOLSO_ADMIN_SENHA) return process.env.BOLSO_ADMIN_SENHA;
  const arquivo = path.join(app.getPath('userData'), 'senha-desenvolvedor.txt');
  try {
    const guardada = fs.readFileSync(arquivo, 'utf8').trim();
    if (guardada.length >= 12) return guardada;
  } catch {
    // primeira vez: cria abaixo
  }
  const nova = randomBytes(12).toString('base64url'); // 16 caracteres
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, nova, 'utf8');
  return nova;
}
let ADMIN_SENHA = ''; // preenchida ao iniciar (precisa do app pronto para saber a pasta de dados)

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
let janelaInternet = null;
let janelaNuvem = null;
let urlNuvem = null; // endereço do servidor na nuvem (modo nuvem) ou null (modo local, com a API dentro do programa)
let temporizadorNuvem = null;

// ---- Acesso pela internet (túnel temporário da Cloudflare) ---------------------------------------------------------
// O programa roda no seu computador; para alguém de longe usar o aplicativo, o servidor (porta PORTA_API) precisa de um
// endereço público. O túnel (programa cloudflared, gratuito e sem conta) cria um endereço https://xxxx.trycloudflare.com
// que leva até esta porta. O endereço MUDA a cada vez que o túnel é ligado, e só funciona enquanto o computador e este
// programa estiverem ligados.
const tunel = { ativo: false, url: null, erro: null, processo: null };

/** Onde está o cloudflared: variável CLOUDFLARED, pasta padrão da instalação (winget) ou o PATH. */
function acharCloudflared() {
  const candidatos = [
    process.env.CLOUDFLARED,
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
  ].filter(Boolean);
  return candidatos.find((c) => fs.existsSync(c)) ?? 'cloudflared';
}

function ligarTunel() {
  if (tunel.processo) return;
  tunel.erro = null;
  tunel.url = null;
  tunel.ativo = true;
  const filho = spawn(acharCloudflared(), ['tunnel', '--url', `http://localhost:${PORTA_API}`, '--no-autoupdate'], { windowsHide: true });
  tunel.processo = filho;
  // O cloudflared escreve o endereço no que ele imprime (saída de erro); pegamos o primeiro https://....trycloudflare.com.
  const ouvir = (dados) => {
    const achou = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i.exec(String(dados));
    if (achou && !tunel.url) tunel.url = achou[0];
  };
  filho.stdout.on('data', ouvir);
  filho.stderr.on('data', ouvir);
  filho.on('error', (e) => {
    tunel.erro = e.code === 'ENOENT' ? 'O programa cloudflared não foi encontrado. Instale com: winget install --id Cloudflare.cloudflared' : e.message;
    tunel.ativo = false;
    tunel.processo = null;
  });
  filho.on('exit', (codigo) => {
    if (tunel.processo === filho) {
      if (tunel.ativo && !tunel.url && !tunel.erro) tunel.erro = `O túnel fechou (código ${codigo}). Confira a internet e tente de novo.`;
      tunel.ativo = false;
      tunel.url = null;
      tunel.processo = null;
    }
  });
}

function desligarTunel() {
  const filho = tunel.processo;
  tunel.processo = null;
  tunel.ativo = false;
  tunel.url = null;
  if (filho) filho.kill();
}

function estadoDoTunel() {
  return { ativo: tunel.ativo, url: tunel.url, erro: tunel.erro };
}

/** Tela "Acesso pela internet": liga/desliga o túnel e mostra o endereço para passar a quem vai testar. */
function paginaDeInternet() {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Acesso pela internet</title>
<style>body{font:15px Segoe UI,Arial,sans-serif;margin:24px;color:#1f2933;max-width:680px}h1{color:#0f7d99;font-size:22px}
button{font:inherit;padding:7px 12px;cursor:pointer}.url{font:18px Consolas,monospace;background:#f2f7f9;padding:10px;border-radius:6px;word-break:break-all}
.aviso{background:#fff4d6;border:1px solid #e8b931;padding:8px 12px;border-radius:6px}.erro{color:#a32d2d}</style></head><body>
<h1>Acesso pela internet (temporário)</h1>
<p>Para alguém de longe usar o aplicativo, este programa precisa de um endereço na internet. Ligue o túnel e passe o endereço
abaixo para a pessoa: no aplicativo, tela de entrada, <b>Configurar servidor</b>.</p>
<div class="aviso"><b>Atenção:</b> o endereço <b>muda toda vez</b> que o túnel é ligado, e só funciona enquanto este computador e este programa
estiverem ligados. Qualquer pessoa com o endereço consegue criar conta no aplicativo.</div>
<p><button id="ligar">Ligar o túnel</button> <button id="desligar">Desligar</button></p>
<p id="estado">Verificando…</p>
<div id="caixa" hidden><p>Endereço para o aplicativo:</p><p class="url" id="url"></p><p><button id="copiar">Copiar endereço</button></p></div>
<script>
const cab = { 'Content-Type': 'application/json', 'x-bolso': '1' };
const $ = (id) => document.getElementById(id);
async function atualizar() {
  const e = await (await fetch('/__tunel-estado')).json();
  $('estado').className = e.erro ? 'erro' : '';
  $('estado').textContent = e.erro ? e.erro : e.url ? 'Túnel ligado.' : e.ativo ? 'Ligando o túnel… (pode levar alguns segundos)' : 'Túnel desligado.';
  $('caixa').hidden = !e.url;
  if (e.url) $('url').textContent = e.url;
}
$('ligar').onclick = async () => { await fetch('/__tunel-ligar', { method: 'POST', headers: cab, body: '{}' }); atualizar(); };
$('desligar').onclick = async () => { await fetch('/__tunel-desligar', { method: 'POST', headers: cab, body: '{}' }); atualizar(); };
$('copiar').onclick = async () => { await navigator.clipboard.writeText($('url').textContent); $('copiar').textContent = 'Copiado!'; };
atualizar(); setInterval(atualizar, 2000);
</script></body></html>`;
}

function abrirInternet() {
  if (janelaInternet && !janelaInternet.isDestroyed()) {
    janelaInternet.focus();
    return;
  }
  janelaInternet = new BrowserWindow({ width: 760, height: 620, title: 'Acesso pela internet', icon: iconeDaJanela() });
  janelaInternet.setMenu(null);
  janelaInternet.loadURL(`http://127.0.0.1:${portaPainel}/__internet`);
}

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
<h2>Login do desenvolvedor (vê todos os mercados)</h2>
<p>E-mail: <b>${escapar(ADMIN_EMAIL)}</b><br>Senha: <b>${escapar(ADMIN_SENHA)}</b><br><small>Gerada só para este computador. Não passe para ninguém.</small></p>
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
    if (caminhoUrl === '/__internet' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(paginaDeInternet());
      return;
    }
    if (caminhoUrl === '/__tunel-estado' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(estadoDoTunel()));
      return;
    }
    if (req.method === 'POST' && (caminhoUrl === '/__tunel-ligar' || caminhoUrl === '/__tunel-desligar')) {
      if (req.headers['x-bolso'] !== '1') {
        res.writeHead(403).end();
        return;
      }
      if (caminhoUrl === '/__tunel-ligar') ligarTunel();
      else desligarTunel();
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(estadoDoTunel()));
      return;
    }
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

/** Menu "Atualizar produtos com as planilhas": importa de novo as planilhas que vêm com o programa. */
async function atualizarProdutosAgora() {
  if (!api) {
    dialog.showMessageBoxSync(janela, { type: 'info', title: 'Bolso Certo - Mercado', message: 'Este modo não tem planilhas embutidas.' });
    return;
  }
  try {
    const r = await api.atualizarProdutos();
    dialog.showMessageBoxSync(janela, {
      type: 'info',
      title: 'Bolso Certo - Mercado',
      message: 'Produtos atualizados.',
      detail: `${r.produtos} produtos de ${r.planilhas} planilhas foram importados (os preços das planilhas substituem os atuais). Recarregue a tela para ver.`,
    });
    janela?.reload();
  } catch (erro) {
    dialog.showErrorBox('Bolso Certo - Mercado', `Não foi possível atualizar: ${erro && erro.message ? erro.message : erro}`);
  }
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

// ---- Modo "servidor na nuvem" ---------------------------------------------------------------------------------------
// Com um endereço de servidor configurado, o programa NÃO liga a API dentro dele: abre o painel que a API hospedada entrega
// (em /painel-web/) e tudo (contas, produtos, preços) fica no banco de dados da nuvem. Sem endereço, funciona como sempre,
// tudo no próprio computador. O endereço fica em servidor-nuvem.json (pasta de dados do programa), trocado pelo menu
// "Servidor na nuvem…"; BOLSO_SERVIDOR_NUVEM (variável de ambiente) tem prioridade, e nuvem-padrao.txt (gravado na hora de gerar
// o programa com BOLSO_URL_NUVEM) vale quando o usuário ainda não escolheu nada.
const CAMINHO_PAINEL_NUVEM = '/painel-web/';

function arquivoNuvem() {
  return path.join(app.getPath('userData'), 'servidor-nuvem.json');
}

function lerUrlNuvem() {
  try {
    if (process.env.BOLSO_SERVIDOR_NUVEM) return normalizarUrlNuvem(process.env.BOLSO_SERVIDOR_NUVEM);
    try {
      const guardado = JSON.parse(fs.readFileSync(arquivoNuvem(), 'utf8'));
      // url vazia = a pessoa escolheu voltar ao modo local (vale mais que o endereço padrão do programa).
      return guardado && guardado.url ? normalizarUrlNuvem(guardado.url) : null;
    } catch (e) {
      if (!e || e.code !== 'ENOENT') throw e;
    }
    const padrao = path.join(__dirname, 'nuvem-padrao.txt');
    return fs.existsSync(padrao) ? normalizarUrlNuvem(fs.readFileSync(padrao, 'utf8')) : null;
  } catch {
    return null; // arquivo estragado ou endereço inválido: cai no modo local em vez de não abrir
  }
}

const PAGINA_CARREGANDO = (texto) =>
  'data:text/html;charset=utf-8,' +
  encodeURIComponent(
    `<body style="font:18px Segoe UI,Arial;display:flex;height:100vh;align-items:center;justify-content:center;text-align:center;padding:0 40px;color:#0f7d99;background:#f2f7f9">${texto}</body>`,
  );

/** Abre o painel hospedado. Se o servidor não responde (o gratuito dorme e leva até ~1 minuto para acordar), tenta de novo sozinho. */
function abrirNaNuvem() {
  const destino = urlNuvem + CAMINHO_PAINEL_NUVEM;
  janela.loadURL(PAGINA_CARREGANDO('Conectando ao servidor na nuvem…<br><small>O servidor gratuito dorme quando ninguém usa e pode levar até 1 minuto para acordar.</small>'));
  janela.webContents.on('did-fail-load', (_evento, codigo, _descricao, _url, principal) => {
    if (!principal || codigo === -3) return; // -3: carregamento cancelado pela própria navegação
    janela.loadURL(PAGINA_CARREGANDO('Não consegui falar com o servidor.<br><small>Verifique a internet. Tentando de novo em alguns segundos…</small>'));
    clearTimeout(temporizadorNuvem);
    temporizadorNuvem = setTimeout(() => {
      if (janela && !janela.isDestroyed()) janela.loadURL(destino);
    }, 6000);
  });
  // Pequena pausa para a página de "conectando" aparecer antes de a navegação (que pode demorar) começar.
  setTimeout(() => janela && !janela.isDestroyed() && janela.loadURL(destino), 300);
}

function paginaDeNuvem(atual) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Servidor na nuvem</title>
<style>body{font:15px Segoe UI,Arial,sans-serif;margin:24px;color:#1f2933;max-width:560px}h1{color:#0f7d99;font-size:22px}
.erro{color:#a32d2d}button,input{font:inherit;padding:6px 10px}button{cursor:pointer}input{width:100%;box-sizing:border-box}</style></head><body>
<h1>Servidor na nuvem</h1>
<p>Com um endereço aqui, o programa usa o servidor e o banco de dados da nuvem (as contas, os produtos e os preços ficam lá). Deixe em branco para voltar a usar tudo só neste computador.</p>
<p><input id="url" placeholder="https://bolso-certo.onrender.com" value="${escapar(atual)}"></p>
<p><button id="salvar">Salvar e reiniciar o programa</button></p>
<p class="erro" id="erro" hidden></p>
<script>
document.getElementById('salvar').onclick = async () => {
  const r = await fetch('/salvar', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-bolso': '1' }, body: JSON.stringify({ url: document.getElementById('url').value }) });
  const j = await r.json();
  const e = document.getElementById('erro');
  if (!j.ok) { e.hidden = false; e.textContent = j.mensagem; }
};
</script></body></html>`;
}

function abrirConfigNuvem() {
  if (janelaNuvem && !janelaNuvem.isDestroyed()) {
    janelaNuvem.focus();
    return;
  }
  const servidor = http.createServer((req, res) => {
    const caminho = (req.url ?? '/').split('?')[0];
    if (req.method === 'GET' && caminho === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(paginaDeNuvem(urlNuvem || ''));
      return;
    }
    if (req.method === 'POST' && caminho === '/salvar' && req.headers['x-bolso'] === '1') {
      let corpo = '';
      req.on('data', (parte) => (corpo += parte));
      req.on('end', async () => {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        try {
          const texto = String(JSON.parse(corpo || '{}').url ?? '').trim();
          const url = texto === '' ? '' : normalizarUrlNuvem(texto);
          fs.mkdirSync(path.dirname(arquivoNuvem()), { recursive: true });
          fs.writeFileSync(arquivoNuvem(), JSON.stringify({ url }, null, 2), 'utf8');
          res.end(JSON.stringify({ ok: true }));
          try {
            await api?.salvarAgora();
          } catch {
            // sem espaço ou permissão: reinicia mesmo assim
          }
          app.relaunch();
          app.exit(0);
        } catch (e) {
          res.end(JSON.stringify({ ok: false, mensagem: e && e.message ? e.message : String(e) }));
        }
      });
      return;
    }
    res.writeHead(404).end();
  });
  servidor.listen(0, '127.0.0.1', () => {
    janelaNuvem = new BrowserWindow({ width: 620, height: 400, title: 'Servidor na nuvem', icon: iconeDaJanela(), parent: janela || undefined });
    janelaNuvem.setMenu(null);
    janelaNuvem.loadURL(`http://127.0.0.1:${servidor.address().port}/`);
    janelaNuvem.on('closed', () => {
      servidor.close();
      janelaNuvem = null;
    });
  });
}

function montarMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Bolso Certo',
        submenu: [
          ...(urlNuvem
            ? [{ label: `Usando o servidor na nuvem: ${urlNuvem}`, enabled: false }, { type: 'separator' }]
            : [
                { label: 'Códigos de e-mail e endereço do celular', accelerator: 'CmdOrCtrl+E', click: abrirCodigos },
                { label: 'Atualizar produtos com as planilhas do programa', click: atualizarProdutosAgora },
          { label: 'Configurar e-mail…', click: abrirConfigEmail },
                { label: 'Acesso pela internet (túnel)…', click: abrirInternet },
              ]),
          { label: 'Servidor na nuvem…', click: abrirConfigNuvem },
          { label: 'Recarregar', accelerator: 'CmdOrCtrl+R', click: () => janela?.reload() },
          ...(urlNuvem ? [] : [{ label: 'Apagar os dados salvos e recomeçar…', click: apagarSalvosERecomecar }]),
          { type: 'separator' },
          { label: 'Sair', accelerator: 'Alt+F4', click: () => app.quit() },
        ],
      },
      { label: 'Exibir', submenu: [{ role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { role: 'togglefullscreen' }] },
    ]),
  );
}

async function iniciar() {
  urlNuvem = lerUrlNuvem();
  montarMenu();
  janela = new BrowserWindow({ width: 1200, height: 800, title: 'Bolso Certo - Mercado', icon: iconeDaJanela(), backgroundColor: '#f2f7f9' });
  janela.loadURL(
    'data:text/html;charset=utf-8,' +
      encodeURIComponent(
        '<body style="font:18px Segoe UI,Arial;display:flex;height:100vh;align-items:center;justify-content:center;color:#0f7d99;background:#f2f7f9">Iniciando o Bolso Certo - Mercado… (carregando as planilhas)</body>',
      ),
  );
  janela.on('closed', () => app.quit());

  if (urlNuvem) {
    abrirNaNuvem();
    return;
  }

  try {
    ADMIN_SENHA = senhaDoDesenvolvedor();
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
      desligarTunel();
      servidorPainel?.close();
      await api?.app?.close().catch(() => undefined);
      app.exit(0);
    })();
  });
}
