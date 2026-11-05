import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View } from 'react-native';

import { AvisoEmail } from './componentes/AvisoEmail';
import type { RootStackParamList, RotaInicial } from './rotas';
import { useSessao } from './sessao';
import { Busca } from './telas/Busca';
import { Cadastrar } from './telas/Cadastrar';
import { EsqueciSenha } from './telas/EsqueciSenha';
import { Entrar } from './telas/Entrar';
import { VerificarEmail } from './telas/VerificarEmail';
import { cores } from './tema';

export type { RootStackParamList, RotaInicial } from './rotas';

const Stack = createNativeStackNavigator<RootStackParamList>();

const opcoesComuns = {
  headerTintColor: cores.marca,
  headerTitleStyle: { color: cores.texto },
  contentStyle: { backgroundColor: cores.fundo },
};

/**
 * Pilha de telas: acesso (Entrar, Cadastrar, EsqueciSenha) quando não há sessão; principal
 * (Busca, VerificarEmail) quando há. `rotaInicial` serve só para abrir direto numa tela de acesso (testes).
 */
export function Navegacao({ rotaInicial }: { rotaInicial?: RotaInicial }) {
  const { carregando, sessao } = useSessao();

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
            <Stack.Screen name="Busca" component={Busca} options={{ title: 'Bolso Certo' }} />
            <Stack.Screen name="VerificarEmail" component={VerificarEmail} options={{ title: 'Código de confirmação' }} />
          </Stack.Group>
        ) : (
          <>
            <Stack.Screen name="Entrar" component={Entrar} options={{ headerShown: false }} />
            <Stack.Screen name="Cadastrar" component={Cadastrar} options={{ title: 'Cadastro' }} />
            <Stack.Screen name="EsqueciSenha" component={EsqueciSenha} options={{ title: 'Recuperar senha' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
