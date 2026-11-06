// Testes do perfil na tela "Conta": foto, nome de usuário, e-mail e troca de senha (tudo editável).
import { screen, userEvent } from '@testing-library/react-native';

import { escolherFoto } from '../foto';
import { abrirApp, aba, guardarSessao, simularApi, type ChamadaFalsa } from '../teste/ajudas';

const FOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
const PERFIL = { id: 7, email: 'ana@exemplo.com', nome: null as string | null, foto: null as string | null };

type Rotas = Parameters<typeof simularApi>[0];

async function abrirPerfil(rotas: Rotas = {}) {
  const api = simularApi({ 'GET /conta': { status: 200, corpo: PERFIL }, ...rotas });
  guardarSessao('tok-perfil', true);
  const user = userEvent.setup();
  await abrirApp();
  await user.press(aba('Conta'));
  await screen.findByLabelText('Nome de usuário');
  return { api, user };
}

const patches = (chamadas: ChamadaFalsa[]) => chamadas.filter((c) => c.metodo === 'PATCH' && c.caminho === '/conta');

describe('Perfil: ver', () => {
  it('mostra o e-mail e, sem foto nem nome, um círculo com a inicial do e-mail', async () => {
    await abrirPerfil();
    expect(screen.getByLabelText('E-mail')).toHaveProp('value', 'ana@exemplo.com');
    expect(screen.getByLabelText('Nome de usuário')).toHaveProp('value', '');
    expect(screen.getByLabelText('Sem foto de perfil')).toBeOnTheScreen();
    expect(screen.getByText('A')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Remover foto' })).not.toBeOnTheScreen();
  });

  it('com nome e foto: mostra a foto, o nome e o botão "Remover foto"', async () => {
    await abrirPerfil({ 'GET /conta': { status: 200, corpo: { ...PERFIL, nome: 'Ana Carolina', foto: FOTO } } });
    expect(screen.getByLabelText('Nome de usuário')).toHaveProp('value', 'Ana Carolina');
    expect(screen.getByLabelText('Foto de perfil')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Remover foto' })).toBeOnTheScreen();
  });

  it('falha ao carregar o perfil: mostra o erro e "Tentar de novo" carrega', async () => {
    const api = simularApi({ 'GET /conta': { status: 500, corpo: { erro: 'Falha no servidor' } } });
    guardarSessao('tok-perfil', true);
    const user = userEvent.setup();
    await abrirApp();
    await user.press(aba('Conta'));
    expect(await screen.findByText('Falha no servidor')).toBeOnTheScreen();

    simularApi({ 'GET /conta': { status: 200, corpo: PERFIL } });
    await user.press(screen.getAllByRole('button', { name: 'Tentar de novo' })[0]);
    expect(await screen.findByLabelText('Nome de usuário')).toBeOnTheScreen();
    expect(api.chamadas.length).toBeGreaterThan(0);
  });
});

describe('Perfil: editar nome e e-mail', () => {
  it('envia só o que mudou e mostra "Dados atualizados."', async () => {
    const { api, user } = await abrirPerfil({ 'PATCH /conta': { status: 200, corpo: { ...PERFIL, nome: 'Ana Carolina' } } });
    await user.type(screen.getByLabelText('Nome de usuário'), '  Ana Carolina ');
    await user.press(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(await screen.findByText('Dados atualizados.')).toBeOnTheScreen();
    expect(patches(api.chamadas)).toHaveLength(1);
    expect(patches(api.chamadas)[0]).toMatchObject({ corpo: { nome: 'Ana Carolina' }, autorizacao: 'Bearer tok-perfil' });
    expect(screen.getByLabelText('Nome de usuário')).toHaveProp('value', 'Ana Carolina');
  });

  it('trocar o e-mail manda o e-mail novo', async () => {
    const { api, user } = await abrirPerfil({ 'PATCH /conta': { status: 200, corpo: { ...PERFIL, email: 'nova@exemplo.com' } } });
    const campo = screen.getByLabelText('E-mail');
    await user.clear(campo);
    await user.type(campo, 'nova@exemplo.com');
    await user.press(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('Dados atualizados.')).toBeOnTheScreen();
    expect(patches(api.chamadas)[0].corpo).toEqual({ email: 'nova@exemplo.com' });
  });

  it('apagar o nome manda nome: null', async () => {
    const { api, user } = await abrirPerfil({
      'GET /conta': { status: 200, corpo: { ...PERFIL, nome: 'Ana' } },
      'PATCH /conta': { status: 200, corpo: PERFIL },
    });
    await user.clear(screen.getByLabelText('Nome de usuário'));
    await user.press(screen.getByRole('button', { name: 'Salvar alterações' }));
    await screen.findByText('Dados atualizados.');
    expect(patches(api.chamadas)[0].corpo).toEqual({ nome: null });
  });

  it('sem mudança, avisa e não chama o servidor', async () => {
    const { api, user } = await abrirPerfil();
    await user.press(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('Nada para alterar.')).toBeOnTheScreen();
    expect(patches(api.chamadas)).toHaveLength(0);
  });

  it.each([
    ['nome de 1 letra', 'Nome de usuário', 'A', 'O nome deve ter de 2 a 50 caracteres'],
    ['e-mail inválido', 'E-mail', 'sem-arroba', 'E-mail inválido'],
  ])('%s é recusado no próprio app, sem chamar o servidor', async (_rotulo, campo, valor, mensagem) => {
    const { api, user } = await abrirPerfil();
    const input = screen.getByLabelText(campo);
    await user.clear(input);
    await user.type(input, valor);
    await user.press(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText(mensagem)).toBeOnTheScreen();
    expect(patches(api.chamadas)).toHaveLength(0);
  });

  it('erro do servidor (e-mail já cadastrado) aparece e os campos continuam como digitados', async () => {
    const { user } = await abrirPerfil({ 'PATCH /conta': { status: 409, corpo: { erro: 'E-mail já cadastrado' } } });
    const campo = screen.getByLabelText('E-mail');
    await user.clear(campo);
    await user.type(campo, 'bia@exemplo.com');
    await user.press(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('E-mail já cadastrado')).toBeOnTheScreen();
    expect(screen.getByLabelText('E-mail')).toHaveProp('value', 'bia@exemplo.com');
  });
});

describe('Perfil: foto', () => {
  it('"Trocar foto" abre a galeria e guarda a foto escolhida na conta', async () => {
    jest.mocked(escolherFoto).mockResolvedValueOnce(FOTO);
    const { api, user } = await abrirPerfil({ 'PATCH /conta': { status: 200, corpo: { ...PERFIL, foto: FOTO } } });
    await user.press(screen.getByRole('button', { name: 'Trocar foto' }));

    expect(await screen.findByText('Foto atualizada.')).toBeOnTheScreen();
    expect(patches(api.chamadas)[0].corpo).toEqual({ foto: FOTO });
    expect(screen.getByLabelText('Foto de perfil')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Remover foto' })).toBeOnTheScreen();
  });

  it('se a pessoa cancelar a galeria, nada é enviado', async () => {
    jest.mocked(escolherFoto).mockResolvedValueOnce(null);
    const { api, user } = await abrirPerfil();
    await user.press(screen.getByRole('button', { name: 'Trocar foto' }));
    await screen.findByLabelText('Nome de usuário');
    expect(patches(api.chamadas)).toHaveLength(0);
  });

  it('foto que não pôde ser lida mostra o motivo', async () => {
    jest.mocked(escolherFoto).mockRejectedValueOnce(new Error('x'));
    const { user } = await abrirPerfil();
    await user.press(screen.getByRole('button', { name: 'Trocar foto' }));
    // Erro que não é do servidor cai na mensagem genérica do app.
    expect(await screen.findByText('Algo deu errado. Tente novamente.')).toBeOnTheScreen();
  });

  it('"Remover foto" manda foto: null e volta ao círculo com a inicial', async () => {
    const { api, user } = await abrirPerfil({
      'GET /conta': { status: 200, corpo: { ...PERFIL, nome: 'Ana', foto: FOTO } },
      'PATCH /conta': { status: 200, corpo: { ...PERFIL, nome: 'Ana', foto: null } },
    });
    await user.press(screen.getByRole('button', { name: 'Remover foto' }));
    expect(await screen.findByText('Foto removida.')).toBeOnTheScreen();
    expect(patches(api.chamadas)[0].corpo).toEqual({ foto: null });
    expect(screen.getByLabelText('Sem foto de perfil')).toBeOnTheScreen();
  });
});

describe('Perfil: trocar a senha', () => {
  async function abrirTroca(rotas: Rotas = {}) {
    const r = await abrirPerfil(rotas);
    await r.user.press(screen.getByRole('button', { name: 'Trocar senha' }));
    return r;
  }

  it('abre os campos, envia a senha atual e a nova e avisa "Senha alterada."', async () => {
    const { api, user } = await abrirTroca({ 'POST /conta/senha': { status: 204 } });
    await user.type(screen.getByLabelText('Senha atual'), 'senha-antiga-1');
    await user.type(screen.getByLabelText('Nova senha'), 'senha-nova-22');
    await user.type(screen.getByLabelText('Repita a nova senha'), 'senha-nova-22');
    await user.press(screen.getByRole('button', { name: 'Alterar senha' }));

    expect(await screen.findByText('Senha alterada.')).toBeOnTheScreen();
    const chamada = api.chamadas.find((c) => c.caminho === '/conta/senha')!;
    expect(chamada.corpo).toEqual({ senhaAtual: 'senha-antiga-1', senhaNova: 'senha-nova-22' });
    expect(screen.queryByLabelText('Senha atual')).not.toBeOnTheScreen(); // os campos fecham
  });

  it.each([
    ['sem a senha atual', '', 'senha-nova-22', 'senha-nova-22', 'Informe a senha atual'],
    ['nova senha curta', 'senha-antiga-1', 'curta', 'curta', 'A senha precisa de pelo menos 8 caracteres'],
    ['senhas diferentes', 'senha-antiga-1', 'senha-nova-22', 'senha-nova-23', 'As senhas não são iguais'],
  ])('%s é recusado sem chamar o servidor', async (_rotulo, atual, nova, repetir, mensagem) => {
    const { api, user } = await abrirTroca();
    if (atual) await user.type(screen.getByLabelText('Senha atual'), atual);
    await user.type(screen.getByLabelText('Nova senha'), nova);
    await user.type(screen.getByLabelText('Repita a nova senha'), repetir);
    await user.press(screen.getByRole('button', { name: 'Alterar senha' }));
    expect(await screen.findByText(mensagem)).toBeOnTheScreen();
    expect(api.chamadas.filter((c) => c.caminho === '/conta/senha')).toHaveLength(0);
  });

  it('senha atual incorreta (erro do servidor) aparece e os campos ficam abertos', async () => {
    const { user } = await abrirTroca({ 'POST /conta/senha': { status: 400, corpo: { erro: 'Senha atual incorreta' } } });
    await user.type(screen.getByLabelText('Senha atual'), 'errada-12345');
    await user.type(screen.getByLabelText('Nova senha'), 'senha-nova-22');
    await user.type(screen.getByLabelText('Repita a nova senha'), 'senha-nova-22');
    await user.press(screen.getByRole('button', { name: 'Alterar senha' }));
    expect(await screen.findByText('Senha atual incorreta')).toBeOnTheScreen();
    expect(screen.getByLabelText('Senha atual')).toBeOnTheScreen();
  });

  it('Cancelar fecha os campos', async () => {
    const { user } = await abrirTroca();
    await user.press(screen.getAllByRole('button', { name: 'Cancelar' })[0]);
    expect(screen.queryByLabelText('Senha atual')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Trocar senha' })).toBeOnTheScreen();
  });
});
