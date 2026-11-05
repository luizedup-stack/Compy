import { StyleSheet } from 'react-native';

export const cores = {
  marca: '#0F7D99',
  marcaEscura: '#0B5F76',
  texto: '#1F2933',
  textoSuave: '#52606D',
  borda: '#CBD2D9',
  fundo: '#FFFFFF',
  fundoAviso: '#FFF4D6',
  bordaAviso: '#E8B931',
  erro: '#B42318',
  desabilitado: '#9AA5B1',
} as const;

/** Estilos comuns às telas de acesso. */
export const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { flexGrow: 1, padding: 24, justifyContent: 'center', gap: 16 },
  titulo: { fontSize: 28, fontWeight: '700', color: cores.marca },
  subtitulo: { fontSize: 16, color: cores.textoSuave },
  erro: { color: cores.erro, fontSize: 14 },
  sucesso: { color: cores.marcaEscura, fontSize: 14 },
  link: { color: cores.marca, fontSize: 16, fontWeight: '600', paddingVertical: 8 },
  linhaLinks: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' },
});
