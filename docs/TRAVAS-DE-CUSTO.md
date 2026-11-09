# Travas para não gerar custo (e por que existem)

**Regra da dona do projeto:** nada pode gerar custo sem ela autorizar antes. Tudo roda em planos gratuitos. Estas "travas" existem para os
limites gratuitos não estourarem. Se algo puder passar a custar, **pergunte antes**.

| # | Trava | Onde fica | Por que existe |
|---|---|---|---|
| 1 | A rotina que mantém o servidor acordado só toca das **7h às 23h (Brasília)** | `.github/workflows/manter-servidor-acordado.yml` (`cron`, em UTC: `10-23,0-2`) | O Render gratuito dá **750 horas por mês** para todos os serviços gratuitos da conta. Ligado 24 h por dia, um serviço usa ~744 h, quase tudo: qualquer outro serviço gratuito, ou um mês de 31 dias com atrasos, faria as horas acabarem e o Render **suspenderia** os serviços gratuitos até o mês seguinte. Das 7h às 23h são ~530 h, com folga. De madrugada o servidor dorme (a 1ª pessoa do dia espera até ~1 min). |
| 2 | O servidor guarda a lista de produtos pronta por **10 minutos** (antes, 20 segundos) | `apps/api/src/server.ts` (`cacheRespostasMs`); a regra está em `apps/api/src/rotas/lembrar.ts` | Cada vez que a lista é montada, o servidor consulta o **banco do Azure**, e o banco gratuito tem uma cota mensal (100.000 vCore-segundos, ~50 h acordado). Com 20 s o banco era consultado a cada 20 s enquanto alguém usasse o app. Com 10 min são 30 vezes menos consultas. **Não deixa dado velho:** qualquer escrita (planilha, edição de preço, foto, acesso do mercado) invalida a lista na hora. |
| 3 | O app só baixa de novo a cópia dos produtos depois de **30 minutos** (antes, 3) | `apps/mobile/src/api.ts` (`PRAZO_RENOVAR_MS`) | A cópia tem ~1,8 MB (compactada). Baixar a cada 3 minutos, vezes várias pessoas, gastaria muita **banda** do Render (que tem um limite mensal grátis) e acordaria o banco à toa. O botão **Atualizar** do topo continua forçando na hora. |
| 4 | O banco do Azure está na oferta gratuita com **"pausar ao acabar a cota"** | Portal do Azure (não está no código) | Se a cota do mês acabar, o banco **pausa** até o dia 1º em vez de cobrar. O app continua mostrando a cópia guardada no celular. |

## O que a própria dona deve conferir (eu não consigo ver o portal)

- **Azure:** no portal, no banco, conferir que está marcado **"Pausar o banco de dados automaticamente até o próximo mês"** (é isso que impede cobrança). Se
  puder, criar em *Cost Management > Budgets* um orçamento de **R$ 1** com alerta por e-mail: se algo escapar, ela fica sabendo na hora.
- **Render:** manter **só um serviço gratuito** na conta. Ver o uso em *Dashboard > Billing/Usage*.
- **Render, banda:** o plano gratuito tem um limite mensal de tráfego de saída; confira o valor atual no painel do Render. Se o app crescer
  muito (muitos testers), avisar a dona antes de qualquer decisão paga.

## Se um limite for atingido

1. **Não contratar nada.** Avisar a dona, dizer o valor do plano pago e esperar a autorização.
2. A alternativa sem custo é esperar a cota voltar (dia 1º do mês).
