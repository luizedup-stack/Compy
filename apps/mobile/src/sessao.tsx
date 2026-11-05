import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { definirAoExpirar, definirToken } from './api';
import { apagarDoCofre, guardarNoCofre, lerDoCofre } from './cofre';
import { carregarServidor } from './servidor';

/** Única chave do cofre seguro do aparelho: guarda { token, emailVerificado } em JSON. */
export const CHAVE_SESSAO = 'bolso-certo.sessao';

export interface Sessao {
  token: string;
  emailVerificado: boolean;
}

export interface ValorSessao {
  /** Verdadeiro enquanto a sessão guardada está sendo lida; o app mostra só uma tela neutra. */
  carregando: boolean;
  sessao: Sessao | null;
  /** Mensagem para a tela Entrar depois de sair de propósito (ex.: "Conta excluída."); nula nos demais casos. */
  avisoDeSaida: string | null;
  iniciar(token: string, emailVerificado: boolean): Promise<void>;
  marcarEmailVerificado(): Promise<void>;
  /** Encerra a sessão e apaga o token do aparelho. `aviso` aparece na tela Entrar. */
  sair(aviso?: string): Promise<void>;
}

const SessaoContext = createContext<ValorSessao | null>(null);

function lerSessaoGuardada(texto: string | null): Sessao | null {
  if (!texto) return null;
  try {
    const dado: unknown = JSON.parse(texto);
    if (typeof dado !== 'object' || dado === null) return null;
    const { token, emailVerificado } = dado as Record<string, unknown>;
    if (typeof token !== 'string' || token === '' || typeof emailVerificado !== 'boolean') return null;
    return { token, emailVerificado };
  } catch {
    return null;
  }
}

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [avisoDeSaida, setAvisoDeSaida] = useState<string | null>(null);
  // Espelho síncrono da sessão: evita ler um estado velho dentro dos callbacks.
  const atual = useRef<Sessao | null>(null);

  const aplicar = useCallback((nova: Sessao | null) => {
    atual.current = nova;
    definirToken(nova?.token ?? null);
    setSessao(nova);
  }, []);

  const guardar = useCallback(async (nova: Sessao) => {
    try {
      await guardarNoCofre(CHAVE_SESSAO, JSON.stringify(nova));
    } catch {
      // Sem o cofre a pessoa continua logada até fechar o app; só não volta logada.
    }
  }, []);

  const sair = useCallback(
    async (aviso?: string) => {
      // Uma saída sem aviso feita com a sessão já encerrada (ex.: um 401 atrasado) não apaga o aviso que está na tela.
      if (aviso !== undefined || atual.current !== null) setAvisoDeSaida(aviso || null);
      aplicar(null);
      try {
        await apagarDoCofre(CHAVE_SESSAO);
      } catch {
        // A sessão já foi limpa da memória; nada mais a fazer.
      }
    },
    [aplicar],
  );

  const iniciar = useCallback(
    async (token: string, emailVerificado: boolean) => {
      const nova = { token, emailVerificado };
      setAvisoDeSaida(null);
      aplicar(nova);
      await guardar(nova);
    },
    [aplicar, guardar],
  );

  const marcarEmailVerificado = useCallback(async () => {
    if (!atual.current) return;
    const nova = { ...atual.current, emailVerificado: true };
    aplicar(nova);
    await guardar(nova);
  }, [aplicar, guardar]);

  useEffect(() => {
    let ativo = true;
    (async () => {
      let guardada: Sessao | null = null;
      await carregarServidor();
      try {
        const texto = await lerDoCofre(CHAVE_SESSAO);
        guardada = lerSessaoGuardada(texto);
        if (texto && !guardada) await apagarDoCofre(CHAVE_SESSAO);
      } catch {
        guardada = null;
      }
      if (!ativo) return;
      // Um login feito enquanto a leitura ainda corria vale mais que o que estava guardado.
      if (!atual.current) aplicar(guardada);
      setCarregando(false);
    })();
    return () => {
      ativo = false;
    };
  }, [aplicar]);

  useEffect(() => {
    definirAoExpirar(() => void sair());
    return () => definirAoExpirar(null);
  }, [sair]);

  const valor = useMemo<ValorSessao>(
    () => ({ carregando, sessao, avisoDeSaida, iniciar, marcarEmailVerificado, sair }),
    [carregando, sessao, avisoDeSaida, iniciar, marcarEmailVerificado, sair],
  );
  return <SessaoContext.Provider value={valor}>{children}</SessaoContext.Provider>;
}

export function useSessao(): ValorSessao {
  const valor = useContext(SessaoContext);
  if (!valor) throw new Error('useSessao precisa estar dentro de <SessaoProvider>');
  return valor;
}

export { SessaoContext };
