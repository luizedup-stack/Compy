// A marca Compy no painel: ícone (o "C" com a etiqueta laranja) + nome em Poppins, com o acento laranja do "y", e a palavra "Mercado".
// O acento é só enfeite (aria-hidden); o leitor de tela lê "Compy Mercado".
export default function Marca({ comProduto = true }: { comProduto?: boolean }) {
  return (
    <span className="marca-compy">
      <img src={`${import.meta.env.BASE_URL}icone-compy.svg`} alt="" width="36" height="36" />
      <span className="nome-compy">
        <span className="so-leitor">Compy</span>
        <span aria-hidden="true">Compy</span>
        <i className="acento" aria-hidden="true" />
      </span>
      {comProduto && <span className="produto-compy">Mercado</span>}
    </span>
  );
}
