import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { AppState, Text, View } from 'react-native';

import { renovarCopiaDosProdutos } from './api';
import { AvisoSemConexao } from './componentes/AvisoSemConexao';
import { BotaoAtualizar } from './componentes/BotaoAtualizar';
import { TituloComLogo } from './componentes/TituloComLogo';
import type { AbasParamList, RootStackParamList, RotaInicial } from './rotas';
import { useSessao } from './sessao';
import { Busca } from './telas/Busca';
import { Cadastrar } from './telas/Cadastrar';
import { Conta } from './telas/Conta';
import { EsqueciSenha } from './telas/EsqueciSenha';
import { Entrar } from './telas/Entrar';
import { MercadoDetalhe } from './telas/MercadoDetalhe';
import { Mercados } from './telas/Mercados';
import { cores } from './tema';

export type { RootStackParamList, RotaInicial } from './rotas';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Abas = createBottomTabNavigator<AbasParamList>();

// Cabeçalho azul com letras brancas em todas as telas.
const opcoesComuns = {
  headerStyle: { backgroundColor: cores.marca },
  headerTintColor: '#FFFFFF',
  headerTitleStyle: { color: '#FFFFFF' },
  contentStyle: { backgroundColor: cores.fundo },
};

/**
 * Ícone de uma aba: um emoji (funciona em qualquer celular, sem biblioteca extra). Na aba aberta ele aparece inteiro; nas
 * outras, mais apagado.
 */
function iconeDaAba(emoji: string) {
  return ({ focused }: { focused: boolean }) => <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>;
}

/** Área principal: as abas Buscar, Mercados e Conta (para todos, com ou sem login). O cabeçalho fica por conta da pilha ("Bolso Certo"). */
function Principal() {
  return (
    <Abas.Navigator
      initialRouteName="Busca"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: cores.marca,
        tabBarInactiveTintColor: cores.textoSuave,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Abas.Screen name="Busca" component={Busca} options={{ title: 'Buscar', tabBarIcon: iconeDaAba('🔍') }} />
      <Abas.Screen name="Mercados" component={Mercados} options={{ title: 'Mercados', tabBarIcon: iconeDaAba('🏪') }} />
      <Abas.Screen name="Conta" component={Conta} options={{ title: 'Conta', tabBarIcon: iconeDaAba('👤') }} />
    </Abas.Navigator>
  );
}

/**
 * Pilha de telas. O app funciona SEM login: as abas (Buscar, Mercados e Conta) e o MercadoDetalhe estão sempre
 * disponíveis. Entrar, Cadastrar e EsqueciSenha abrem por cima, a partir da aba Conta, para quem quiser ter conta.
 * `rotaInicial` serve só para abrir direto numa dessas telas (testes).
 */
export function Navegacao({ rotaInicial }: { rotaInicial?: RotaInicial }) {
  const { carregando } = useSessao();

  // Atualização dos PRODUTOS (não do app: o app em si só se atualiza pela loja de aplicativos).
  // 1) Ao abrir o app, renova a cópia dos produtos guardada no celular, em segundo plano (a consulta é pública).
  // 2) Sempre que o app volta para a tela (o usuário saiu dele e voltou, por exemplo depois de recuperar o sinal),
  //    tenta renovar de novo; sem internet a tentativa falha em silêncio e continua valendo a cópia guardada.
  //    (renovarCopiaDosProdutos já evita repetir a tentativa em menos de 3 minutos.)
  // Espera a leitura do endereço do servidor guardado (carregando) para não consultar o endereço errado.
  useEffect(() => {
    if (carregando) return;
    void renovarCopiaDosProdutos(true);
    const assinatura = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') void renovarCopiaDosProdutos();
    });
    return () => assinatura.remove();
  }, [carregando]);

  // Enquanto o endereço do servidor e a sessão guardada são lidos, nada além de uma tela neutra.
  if (carregando) return <View testID="splash" style={{ flex: 1, backgroundColor: cores.fundo }} />;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={opcoesComuns} initialRouteName={rotaInicial}>
        <Stack.Group
          screenLayout={({ children }) => (
            <View style={{ flex: 1 }}>
              <AvisoSemConexao />
              {children}
            </View>
          )}
        >
          <Stack.Screen name="Principal" component={Principal} options={{ title: 'Bolso Certo', headerTitle: () => <TituloComLogo />, headerRight: () => <BotaoAtualizar /> }} />
          <Stack.Screen
            name="MercadoDetalhe"
            component={MercadoDetalhe}
            options={({ route }) => ({ title: route.params.nome })}
          />
          <Stack.Screen name="Entrar" component={Entrar} options={{ title: 'Entrar' }} />
          <Stack.Screen name="Cadastrar" component={Cadastrar} options={{ title: 'Criar conta' }} />
          <Stack.Screen name="EsqueciSenha" component={EsqueciSenha} options={{ title: 'Recuperar senha' }} />
        </Stack.Group>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
