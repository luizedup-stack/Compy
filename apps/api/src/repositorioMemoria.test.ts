import { testarRepositorio } from './repositorio.contrato';
import { criarRepositorioMemoria } from './repositorioMemoria';

testarRepositorio('repositório em memória', async () => criarRepositorioMemoria());
