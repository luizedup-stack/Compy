import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View } from 'react-native';

import { AvisoEmail } from './componentes/AvisoEmail';
import type { AbasParamList, RootStackParamList, RotaInicial } from './rotas';
import { useSessao } from './sessao';
import { Busca } from './telas/Busca';
import { Cadastrar } from './telas/Cadastrar';
import { Conta } from './telas/Conta';
import { EsqueciSenha } from './telas/EsqueciSenha';
import { Entrar } from './telas/Entrar';
import { MercadoDetalhe } from './telas/MercadoDetalhe';
import { Mercados } from './telas/Mercados';
import { VerificarEmail } from './telas/VerificarEmail';
import { cores } from './tema';

export type { RootStackParamList, RotaInicial } from './rotas';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Abas = createBottomTabNavigator<AbasParamList>();

const opcoesComuns = {
  headerTintColor: cores.marca,
  headerTitleStyle: { color: cores.texto },
  contentStyle: { backgroundColor: cores.fundo },
};

/** Área principal: as abas Buscar, Mercados e Conta. O cabeçalho fica por conta da pilha ("Bolso Certo"). */
function Principal() {
  return (
    <Abas.Navigator
      initialRouteName="Busca"
      screenOptions={{
        headerShown: false,
        // Só o texto na barra: sem ícone, o React Navigation desenharia um símbolo padrão no lugar.
        tabBarIcon: () => null,
        tabBarIconStyle: { display: 'none' },
        tabBarActiveTintColor: cores.marca,
        tabBarInactiveTintColor: cores.textoSuave,
        tabBarLabelStyle: { fontSize: 14, fontWeight: '600' },
      }}
    >
      <Abas.Screen name="Busca" component={Busca} options={{ title: 'Buscar' }} />
      <Abas.Screen name="Mercados" component={Mercados} options={{ title: 'Mercados' }} />
      <Abas.Screen name="Conta" component={Conta} options={{ title: 'Conta' }} />
    </Abas.Navigator>
  );
}

/**
 * Pilha de telas: acesso (Entrar, Cadastrar, EsqueciSenha) quando não há sessão; principal
 * (as abas Buscar, Mercados e Conta, com MercadoDetalhe e VerificarEmail por cima) quando há. `rotaInicial` serve só para abrir direto numa tela de acesso (testes).
 */
export function Navegacao({ rotaInicial }: { rotaInicial?: RotaInicial }) {
  const { carregando, sessao, avisoDeSaida } = useSessao();

  // Enquanto a sessão guardada é lida, nada além de uma tela neutra.
  if (carregando) return <View testID="splash" style={{ flex: 1, backgroundColor: cores.fundo }} />;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={opcoesComuns} initialRouteName={sessao ? undefined : rotaInicial}>
        {sessao ? (
          <Stack.Group
            screenLayout={({ children, route }) => (
              <View style={{ flex: 1 }}>
                {route.name === 'VerificarEmail' ? null : <AvisoEmail />}
                {children}
              </View>
            )}
          >
            <Stack.Screen name="Principal" component={Principal} options={{ title: 'Bolso Certo' }} />
            <Stack.Screen
              name="MercadoDetalhe"
              component={MercadoDetalhe}
              options={({ route }) => ({ title: route.params.nome })}
            />
            <Stack.Screen name="VerificarEmail" component={VerificarEmail} options={{ title: 'Código de confirmação' }} />
          </Stack.Group>
        ) : (
          <>
            <Stack.Screen
              name="Entrar"
              component={Entrar}
              options={{ headerShown: false }}
              initialParams={avisoDeSaida ? { aviso: avisoDeSaida } : undefined}
            />
            <Stack.Screen name="Cadastrar" component={Cadastrar} options={{ title: 'Cadastro' }} />
            <Stack.Screen name="EsqueciSenha" component={EsqueciSenha} options={{ title: 'Recuperar senha' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
