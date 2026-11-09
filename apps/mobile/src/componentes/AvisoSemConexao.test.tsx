import { act, render, screen } from '@testing-library/react-native';

import { marcarComConexao, marcarSemConexao } from '../conexao';
import { AvisoSemConexao } from './AvisoSemConexao';

afterEach(async () => {
  await act(async () => marcarComConexao());
});

const dados = new Date(2026, 10, 5, 15, 40).getTime();

describe('AvisoSemConexao', () => {
  it('sem conexão de verdade: diz "Sem conexão com o servidor"', async () => {
    await render(<AvisoSemConexao />);
    await act(async () => marcarSemConexao(dados));
    expect(screen.getByText(/Sem conexão com o servidor\. Mostrando os dados salvos no celular \(05\/11 15:40\)/)).toBeOnTheScreen();
  });

  it('servidor só demorando: NÃO diz "sem conexão"; explica que ele acorda e que o app continua tentando', async () => {
    await render(<AvisoSemConexao />);
    await act(async () => marcarSemConexao(dados, true));
    expect(screen.queryByText(/Sem conexão com o servidor/)).toBeNull();
    expect(screen.getByTestId('aviso-lento')).toBeOnTheScreen();
    expect(screen.getByText(/demorando para responder/)).toBeOnTheScreen();
    expect(screen.getByText(/05\/11 15:40/)).toBeOnTheScreen();
  });

  it('quando o servidor responde, o aviso some', async () => {
    await render(<AvisoSemConexao />);
    await act(async () => marcarSemConexao(dados, true));
    await act(async () => marcarComConexao());
    expect(screen.queryByTestId('aviso-lento')).toBeNull();
  });
});
