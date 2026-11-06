import { describe, expect, it, vi } from 'vitest';
import { criarEmailSmtp, problemaNaConfigSmtp, type ConfigSmtp } from './email';

const CONFIG: ConfigSmtp = { host: 'smtp.exemplo.com', porta: 465, seguro: true, usuario: 'conta@exemplo.com', senha: 'segredo', de: 'Bolso Certo <conta@exemplo.com>' };

describe('criarEmailSmtp', () => {
  it('entrega ao servidor de e-mail o remetente, o destinatário, o assunto e o texto', async () => {
    const sendMail = vi.fn(async () => ({}));
    const criar = vi.fn(() => ({ sendMail }) as never);
    await criarEmailSmtp(CONFIG, criar).enviar('cliente@exemplo.com', 'Assunto', 'Texto com o código');
    expect(criar).toHaveBeenCalledWith(CONFIG);
    expect(sendMail).toHaveBeenCalledWith({
      from: 'Bolso Certo <conta@exemplo.com>',
      to: 'cliente@exemplo.com',
      subject: 'Assunto',
      text: 'Texto com o código',
    });
  });

  it('se o servidor recusar, o erro sobe para quem chamou decidir o que fazer', async () => {
    const criar = () => ({ sendMail: vi.fn(async () => Promise.reject(new Error('535 Autenticação recusada'))) }) as never;
    await expect(criarEmailSmtp(CONFIG, criar).enviar('a@b.com', 'x', 'y')).rejects.toThrow('535 Autenticação recusada');
  });
});

describe('problemaNaConfigSmtp', () => {
  it('configuração completa não tem problema', () => {
    expect(problemaNaConfigSmtp(CONFIG)).toBeNull();
  });

  it.each([
    [null, 'Configuração de e-mail ausente'],
    [{ ...CONFIG, host: '' }, 'Falta o servidor (host)'],
    [{ ...CONFIG, host: 'PREENCHA: servidor' }, 'Falta o servidor (host)'],
    [{ ...CONFIG, porta: 0 }, 'Porta inválida'],
    [{ ...CONFIG, porta: 'abc' as unknown as number }, 'Porta inválida'],
    [{ ...CONFIG, usuario: 'PREENCHA' }, 'Falta o usuário'],
    [{ ...CONFIG, senha: '' }, 'Falta a senha'],
    [{ ...CONFIG, de: '' }, 'Falta o remetente (de)'],
  ])('aponta o que falta %#', (config, motivo) => {
    expect(problemaNaConfigSmtp(config)).toBe(motivo);
  });
});
