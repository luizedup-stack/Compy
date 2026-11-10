import type { Filtros, Unidade } from '@mercado/shared';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { listarMercados, type Mercado } from '../api';
import { cores } from '../tema';
import { Botao } from './Botao';

/** Como comparar o preço entre os estabelecimentos: por unidade (kg, litro...) ou pela embalagem inteira. */
export type ComparacaoDePreco = 'unidade' | 'embalagem';

export interface SelecaoDeFiltros {
  filtros: Filtros;
  comparar: ComparacaoDePreco;
}

export const SEM_FILTROS: SelecaoDeFiltros = { filtros: {}, comparar: 'unidade' };

const UNIDADES: { valor: Unidade; rotulo: string }[] = [
  { valor: 'kg', rotulo: 'kg' },
  { valor: 'L', rotulo: 'litro' },
  { valor: 'un', rotulo: 'unidade' },
  { valor: 'rolo', rotulo: 'rolo' },
];

/** Quantos filtros estão ligados (para o número no botão "Filtros"). "Comparar por embalagem" também conta. */
export function contarFiltros({ filtros, comparar }: SelecaoDeFiltros): number {
  let n = 0;
  if (filtros.precoMin !== undefined || filtros.precoMax !== undefined) n += 1;
  if (filtros.unidade !== undefined) n += 1;
  if (filtros.mercadoIds && filtros.mercadoIds.length > 0) n += 1;
  if (filtros.soPromocao) n += 1;
  if (filtros.soComparaveis) n += 1;
  if (comparar !== 'unidade') n += 1;
  return n;
}

/** "12,5" ou "12.5" → 12.5; vazio → undefined; inválido → null. */
function lerNumero(texto: string): number | undefined | null {
  const limpo = texto.trim().replace(',', '.');
  if (limpo === '') return undefined;
  const n = Number(limpo);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const textoDe = (n: number | undefined) => (n === undefined ? '' : String(n).replace('.', ','));

interface Props {
  visivel: boolean;
  inicial: SelecaoDeFiltros;
  aoFechar: () => void;
  aoAplicar: (selecao: SelecaoDeFiltros) => void;
}

/**
 * Painel de filtros (abre por cima da busca): faixa de preço, quantidade, estabelecimentos, "só promoções", "só comparáveis" e
 * "comparar preço por". Nada muda na busca até a pessoa tocar em "Aplicar".
 */
export function PainelDeFiltros({ visivel, inicial, aoFechar, aoAplicar }: Props) {
  const [precoMin, setPrecoMin] = useState('');
  const [precoMax, setPrecoMax] = useState('');
  const [unidade, setUnidade] = useState<Unidade | undefined>(undefined);
  const [qtdMin, setQtdMin] = useState('');
  const [qtdMax, setQtdMax] = useState('');
  const [ids, setIds] = useState<number[]>([]);
  const [soPromocao, setSoPromocao] = useState(false);
  const [soComparaveis, setSoComparaveis] = useState(false);
  const [comparar, setComparar] = useState<ComparacaoDePreco>('unidade');
  const [erro, setErro] = useState<string | null>(null);
  const [lugares, setLugares] = useState<Mercado[]>([]);

  // Cada vez que o painel abre, mostra o que está valendo agora.
  useEffect(() => {
    if (!visivel) return;
    const f = inicial.filtros;
    setPrecoMin(textoDe(f.precoMin));
    setPrecoMax(textoDe(f.precoMax));
    setUnidade(f.unidade);
    setQtdMin(textoDe(f.quantidadeMin));
    setQtdMax(textoDe(f.quantidadeMax));
    setIds(f.mercadoIds ?? []);
    setSoPromocao(f.soPromocao === true);
    setSoComparaveis(f.soComparaveis === true);
    setComparar(inicial.comparar);
    setErro(null);
  }, [visivel, inicial]);

  // A lista de estabelecimentos para escolher (vem do servidor ou da cópia do celular; se falhar, esta parte some).
  useEffect(() => {
    if (!visivel) return;
    let ativo = true;
    listarMercados().then(
      (l) => ativo && setLugares(l),
      () => undefined,
    );
    return () => {
      ativo = false;
    };
  }, [visivel]);

  function aplicar() {
    const pMin = lerNumero(precoMin);
    const pMax = lerNumero(precoMax);
    const qMin = lerNumero(qtdMin);
    const qMax = lerNumero(qtdMax);
    if (pMin === null || pMax === null || qMin === null || qMax === null) {
      setErro('Use só números nos valores (por exemplo 12,50).');
      return;
    }
    if (pMin !== undefined && pMax !== undefined && pMin > pMax) {
      setErro('O preço mínimo não pode ser maior que o máximo.');
      return;
    }
    if (qMin !== undefined && qMax !== undefined && qMin > qMax) {
      setErro('A quantidade mínima não pode ser maior que a máxima.');
      return;
    }
    const filtros: Filtros = {};
    if (pMin !== undefined) filtros.precoMin = pMin;
    if (pMax !== undefined) filtros.precoMax = pMax;
    if (unidade !== undefined) {
      filtros.unidade = unidade;
      if (qMin !== undefined) filtros.quantidadeMin = qMin;
      if (qMax !== undefined) filtros.quantidadeMax = qMax;
    }
    if (ids.length > 0) filtros.mercadoIds = ids;
    if (soPromocao) filtros.soPromocao = true;
    if (soComparaveis) filtros.soComparaveis = true;
    aoAplicar({ filtros, comparar });
  }

  function limpar() {
    setPrecoMin('');
    setPrecoMax('');
    setUnidade(undefined);
    setQtdMin('');
    setQtdMax('');
    setIds([]);
    setSoPromocao(false);
    setSoComparaveis(false);
    setComparar('unidade');
    setErro(null);
  }

  const alternarId = (id: number) => setIds((atual) => (atual.includes(id) ? atual.filter((i) => i !== id) : [...atual, id]));

  return (
    <Modal visible={visivel} animationType="slide" onRequestClose={aoFechar} transparent={false}>
      <View style={estilos.tela} testID="painel-filtros">
        <View style={estilos.cabecalho}>
          <Text accessibilityRole="header" style={estilos.titulo}>
            Filtros
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar filtros" onPress={aoFechar} hitSlop={12}>
            <Text style={estilos.fechar}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
          <Text style={estilos.secao}>Preço</Text>
          <View style={estilos.linha}>
            <TextInput accessibilityLabel="Preço mínimo" placeholder="De R$" placeholderTextColor={cores.desabilitado} keyboardType="decimal-pad" value={precoMin} onChangeText={setPrecoMin} style={estilos.campo} />
            <TextInput accessibilityLabel="Preço máximo" placeholder="Até R$" placeholderTextColor={cores.desabilitado} keyboardType="decimal-pad" value={precoMax} onChangeText={setPrecoMax} style={estilos.campo} />
          </View>

          <Text style={estilos.secao}>Quantidade</Text>
          <View style={estilos.linha} accessibilityRole="radiogroup">
            <Chip rotulo="Qualquer" marcado={unidade === undefined} aoTocar={() => setUnidade(undefined)} />
            {UNIDADES.map((u) => (
              <Chip key={u.valor} rotulo={u.rotulo} marcado={unidade === u.valor} aoTocar={() => setUnidade(u.valor)} />
            ))}
          </View>
          {unidade !== undefined ? (
            <View style={estilos.linha}>
              <TextInput accessibilityLabel="Quantidade mínima" placeholder="De" placeholderTextColor={cores.desabilitado} keyboardType="decimal-pad" value={qtdMin} onChangeText={setQtdMin} style={estilos.campo} />
              <TextInput accessibilityLabel="Quantidade máxima" placeholder="Até" placeholderTextColor={cores.desabilitado} keyboardType="decimal-pad" value={qtdMax} onChangeText={setQtdMax} style={estilos.campo} />
            </View>
          ) : null}

          <Text style={estilos.secao}>Comparar o preço por</Text>
          <View style={estilos.linha} accessibilityRole="radiogroup">
            <Chip rotulo="Unidade (kg, litro…)" marcado={comparar === 'unidade'} aoTocar={() => setComparar('unidade')} />
            <Chip rotulo="Embalagem" marcado={comparar === 'embalagem'} aoTocar={() => setComparar('embalagem')} />
          </View>

          <Text style={estilos.secao}>Só mostrar</Text>
          <Opcao rotulo="🔥 Só promoções" ligada={soPromocao} aoAlternar={() => setSoPromocao((v) => !v)} />
          <Opcao rotulo="Só produtos que dá para comparar (em 2 ou mais lugares)" ligada={soComparaveis} aoAlternar={() => setSoComparaveis((v) => !v)} />

          {lugares.length > 0 ? (
            <>
              <Text style={estilos.secao}>Estabelecimentos</Text>
              <View style={estilos.linha}>
                {lugares.map((l) => (
                  <Chip key={l.id} rotulo={l.nome} marcado={ids.includes(l.id)} aoTocar={() => alternarId(l.id)} multiplo />
                ))}
              </View>
            </>
          ) : null}

          {erro ? (
            <Text accessibilityRole="alert" style={estilos.erro}>
              {erro}
            </Text>
          ) : null}
        </ScrollView>

        <View style={estilos.rodape}>
          <View style={estilos.botao}>
            <Botao titulo="Limpar" tipo="secundario" aoPressionar={limpar} />
          </View>
          <View style={estilos.botao}>
            <Botao titulo="Aplicar" aoPressionar={aplicar} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Chip({ rotulo, marcado, aoTocar, multiplo = false }: { rotulo: string; marcado: boolean; aoTocar: () => void; multiplo?: boolean }) {
  return (
    <Pressable
      accessibilityRole={multiplo ? 'checkbox' : 'radio'}
      accessibilityLabel={rotulo}
      accessibilityState={multiplo ? { checked: marcado } : { checked: marcado, selected: marcado }}
      onPress={aoTocar}
      style={[estilos.chip, marcado ? estilos.chipMarcado : null]}
    >
      <Text style={[estilos.textoChip, marcado ? estilos.textoChipMarcado : null]}>{rotulo}</Text>
    </Pressable>
  );
}

function Opcao({ rotulo, ligada, aoAlternar }: { rotulo: string; ligada: boolean; aoAlternar: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityLabel={rotulo} accessibilityState={{ checked: ligada }} onPress={aoAlternar} style={estilos.opcao}>
      <View style={[estilos.caixa, ligada ? estilos.caixaMarcada : null]}>{ligada ? <Text style={estilos.visto}>✓</Text> : null}</View>
      <Text style={estilos.textoOpcao}>{rotulo}</Text>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 40, paddingBottom: 12, backgroundColor: cores.marca },
  titulo: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  fechar: { fontSize: 22, color: '#FFFFFF', fontWeight: '700' },
  conteudo: { padding: 16, gap: 10 },
  secao: { fontSize: 15, fontWeight: '700', color: cores.marcaEscura, marginTop: 8 },
  linha: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  campo: { flex: 1, minWidth: 120, borderWidth: 1, borderColor: cores.borda, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: cores.texto },
  chip: { borderRadius: 18, borderWidth: 1, borderColor: cores.marca, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: cores.fundo },
  chipMarcado: { backgroundColor: cores.marcaEscura, borderColor: cores.marcaEscura },
  textoChip: { fontSize: 14, fontWeight: '600', color: cores.marcaEscura },
  textoChipMarcado: { color: '#FFFFFF' },
  opcao: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  caixa: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: cores.marca, alignItems: 'center', justifyContent: 'center' },
  caixaMarcada: { backgroundColor: cores.marca },
  visto: { color: '#FFFFFF', fontWeight: '800' },
  textoOpcao: { flex: 1, fontSize: 15, color: cores.texto },
  erro: { color: cores.erro, fontSize: 14, marginTop: 8 },
  rodape: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cores.borda },
  botao: { flex: 1 },
});
