/** Erro do arquivo inteiro: a mensagem está em português e pode ser mostrada ao usuário. */
export class ErroPlanilha extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErroPlanilha';
  }
}
