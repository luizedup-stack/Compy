import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Navegacao } from './src/navegacao';
import { SessaoProvider } from './src/sessao';

export default function App() {
  return (
    <SafeAreaProvider>
      <SessaoProvider>
        <Navegacao />
        <StatusBar style="dark" />
      </SessaoProvider>
    </SafeAreaProvider>
  );
}
