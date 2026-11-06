// Gera o programa de computador (Windows): node apps/desktop/construir.mjs
// 1) compila o painel apontando para a API embutida; 2) junta a API em um arquivo só (esbuild);
// 3) reúne tudo em .build/app e 4) empacota com o Electron em programa/Bolso Certo - Mercado-win32-x64.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packager } from '@electron/packager';
import { build } from 'esbuild';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, '../..');
const montagem = path.join(aqui, '.build', 'app');
// Pasta de saída: programa/ por padrão; BOLSO_SAIDA troca (útil quando o programa antigo está aberto e trava a pasta).
const saida = process.env.BOLSO_SAIDA ? path.resolve(process.env.BOLSO_SAIDA) : path.join(raiz, 'programa');
const passo = (texto) => console.log(`\n== ${texto}`);

passo('Compilando o painel');
execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build', '-w', '@mercado/painel'], {
  cwd: raiz,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, VITE_API_URL: 'http://localhost:3000' },
});

passo('Juntando a API');
fs.rmSync(path.join(aqui, '.build'), { recursive: true, force: true });
fs.mkdirSync(montagem, { recursive: true });
await build({
  entryPoints: [path.join(aqui, 'api-embutida.ts')],
  outfile: path.join(montagem, 'api.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  logLevel: 'warning',
});

passo('Reunindo os arquivos');
fs.cpSync(path.join(raiz, 'apps/painel/dist'), path.join(montagem, 'painel'), { recursive: true });
// Planilhas que já vêm carregadas: as reais (só no seu computador) ou, na falta delas, as de exemplo do projeto.
const fontesDeDados = [path.join(raiz, '.dados-carga'), path.join(raiz, 'dados-reais'), path.join(raiz, 'dados-de-teste')];
const pastaDados = path.join(montagem, 'dados');
fs.mkdirSync(pastaDados);
for (const fonte of fontesDeDados) {
  if (!fs.existsSync(fonte)) continue;
  const planilhas = fs.readdirSync(fonte).filter((n) => n.toLowerCase().endsWith('.xlsx') && !n.startsWith('~$'));
  if (planilhas.length === 0) continue;
  for (const n of planilhas) fs.copyFileSync(path.join(fonte, n), path.join(pastaDados, n));
  console.log(`Planilhas de ${path.relative(raiz, fonte)}: ${planilhas.length}`);
  break;
}
fs.copyFileSync(path.join(aqui, 'main.cjs'), path.join(montagem, 'main.cjs'));
fs.copyFileSync(path.join(aqui, 'icones/icone.png'), path.join(montagem, 'icone.png'));
fs.writeFileSync(
  path.join(montagem, 'package.json'),
  JSON.stringify({ name: 'bolso-certo', productName: 'Bolso Certo - Mercado', version: '0.1.0', main: 'main.cjs' }, null, 2),
);

passo('Empacotando com o Electron');
const [caminho] = await packager({
  dir: montagem,
  out: saida,
  name: 'Bolso Certo - Mercado',
  executableName: 'Bolso Certo - Mercado',
  platform: 'win32',
  arch: 'x64',
  icon: path.join(aqui, 'icones/icone.ico'),
  overwrite: true,
  asar: false,
  prune: false,
  appCopyright: 'Bolso Certo',
  win32metadata: { CompanyName: 'Bolso Certo', FileDescription: 'Bolso Certo - Mercado', ProductName: 'Bolso Certo - Mercado' },
});
console.log(`\nPronto: ${caminho}`);
