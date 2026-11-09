import { StyleSheet } from 'react-native';

// Cores da marca Compy: azul principal #0B1F5B, laranja destaque #FF8A00, azul secundário #2E6BFF e cinza neutro #F5F7FA.
export const cores = {
  marca: '#0B1F5B',
  marcaEscura: '#0B1F5B',
  destaque: '#FF8A00',
  azul: '#2E6BFF',
  fundoSuave: '#F5F7FA',
  texto: '#1B2A52',
  textoSuave: '#52608A',
  borda: '#CBD5E8',
  fundo: '#FFFFFF',
  fundoAviso: '#FFF4D6',
  bordaAviso: '#E8B931',
  erro: '#B42318',
  desabilitado: '#9AA5B1',
} as const;

/** Fonte da marca (Poppins). O App carrega os arquivos; sem eles o sistema usa a fonte padrão. */
export const fontes = {
  normal: 'Poppins_400Regular',
  semi: 'Poppins_600SemiBold',
  negrito: 'Poppins_700Bold',
} as const;

/** Estilos comuns às telas de acesso. */
export const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { flexGrow: 1, padding: 24, justifyContent: 'center', gap: 16 },
  titulo: { fontSize: 28, fontFamily: fontes.negrito, color: cores.marca },
  subtitulo: { fontSize: 16, color: cores.textoSuave },
  erro: { color: cores.erro, fontSize: 14 },
  sucesso: { color: cores.marcaEscura, fontSize: 14 },
  link: { color: cores.marca, fontSize: 16, fontWeight: '600', paddingVertical: 8 },
  linhaLinks: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' },
});
