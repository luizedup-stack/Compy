import { Poppins_400Regular } from '@expo-google-fonts/poppins/400Regular';
import { Poppins_600SemiBold } from '@expo-google-fonts/poppins/600SemiBold';
import { Poppins_700Bold } from '@expo-google-fonts/poppins/700Bold';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Navegacao } from './src/navegacao';
import { SessaoProvider } from './src/sessao';

export default function App() {
  // A fonte da marca (Poppins) carrega em segundos; enquanto isso (ou se falhar) o app abre normalmente com a fonte do sistema.
  useFonts({ Poppins_400Regular, Poppins_600SemiBold, Poppins_700Bold });
  return (
    <SafeAreaProvider>
      <SessaoProvider>
        <Navegacao />
        <StatusBar style="dark" />
      </SessaoProvider>
    </SafeAreaProvider>
  );
}
