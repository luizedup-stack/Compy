import { chaveDeCampo, emailValido, limparCodigo } from './validacao';

describe('validacao', () => {
  it('chaveDeCampo usa normalizarTexto de @mercado/shared para criar ids estáveis', () => {
    expect(chaveDeCampo('Código recebido por e-mail')).toBe('codigo-recebido-por-e-mail');
    expect(chaveDeCampo('E-mail')).toBe('e-mail');
    expect(chaveDeCampo('Nova senha')).toBe('nova-senha');
  });

  it('emailValido aceita formato comum e recusa o resto', () => {
    expect(emailValido('ana@exemplo.com')).toBe(true);
    expect(emailValido('ana@exemplo')).toBe(false);
    expect(emailValido('ana exemplo@x.com')).toBe(false);
    expect(emailValido('')).toBe(false);
  });

  it('limparCodigo tira todo espaço e quebra de linha', () => {
    expect(limparCodigo('  ab cd\nef\t ')).toBe('abcdef');
  });
});
