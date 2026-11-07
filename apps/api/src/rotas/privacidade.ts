import type { FastifyPluginAsync } from 'fastify';

// RASCUNHO: este texto precisa ser revisado por alguém qualificado antes da publicação.
const PAGINA = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Política de privacidade - Bolso Certo</title>
<style>
  body { font-family: system-ui, sans-serif; line-height: 1.6; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; color: #222; }
  h1 { font-size: 1.6rem; }
  h2 { font-size: 1.2rem; margin-top: 1.8rem; }
</style>
</head>
<body>
<h1>Política de privacidade do Bolso Certo</h1>
<p>O Bolso Certo compara os preços de produtos entre mercados da sua região. Aqui explicamos, de forma simples, o que fazemos com os seus dados.</p>

<h2>Quais dados coletamos</h2>
<ul>
  <li>Se você criar uma conta (é opcional: dá para usar o aplicativo sem conta), seu endereço de e-mail, informado ao criar a conta, e, se quiser, o nome de usuário e a foto do perfil.</li>
  <li>Sua senha, se você criar uma conta, que guardamos apenas de forma criptografada (um código irreversível): nem nós conseguimos ler a sua senha.</li>
  <li>As buscas que você faz no aplicativo. Sem conta, elas ficam anônimas. Com conta, ficam ligadas apenas à sua conta, sem nenhuma outra informação que identifique você.</li>
</ul>

<h2>Para que usamos</h2>
<ul>
  <li>Criar e manter a sua conta, se você criar uma.</li>
  <li>Mostrar a você os preços dos produtos nos mercados.</li>
  <li>Medir o uso do serviço, para saber o que as pessoas procuram e melhorar o Bolso Certo.</li>
</ul>

<h2>Registros técnicos do servidor</h2>
<p>O servidor guarda registros técnicos das requisições (endereço de quem acessou, a rota e o horário), sem o texto das buscas, para manter o serviço funcionando e para a segurança.</p>

<h2>Compartilhamento</h2>
<p>Não vendemos nem compartilhamos os seus dados com ninguém.</p>

<h2>Excluir a sua conta</h2>
<p>Você pode apagar a sua conta quando quiser, no aplicativo, em "Excluir minha conta". Ao excluir, removemos os dados da sua conta (e-mail e senha) e anonimizamos as suas buscas: elas deixam de ter qualquer ligação com você.</p>

<h2>Contato</h2>
<p>Contato: a definir pelo Bolso Certo</p>
</body>
</html>
`;

export function rotasPrivacidade(): FastifyPluginAsync {
  return async (app) => {
    app.get('/privacidade', async (_req, reply) => reply.type('text/html; charset=utf-8').send(PAGINA));
  };
}
