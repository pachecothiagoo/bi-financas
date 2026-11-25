# TODO — Finanças BI

- [ ] **Contas independentes e autenticação real por e-mail/senha**
  - O app possui cadastro de conta por e-mail e senha, permite entrar novamente depois e oferece um botão de sair.
  - Se o e-mail já estiver cadastrado, o cadastro informa isso com clareza e oferece a entrada na conta existente; os dados não são perdidos nem criados em uma segunda conta.
  - As senhas são protegidas no servidor e nunca armazenadas em texto puro; o dashboard e as operações privadas só ficam disponíveis depois de validar a sessão.
  - As contas deste app são independentes das contas do app Agenda/Firebase.

- [ ] **Persistência em nuvem, isolamento por conta e sincronização entre dispositivos**
  - Movimentações, recorrências, percentual de meta, saldos iniciais mensais e saldos finais de extrato são gravados no banco do app e vinculados à conta autenticada.
  - Toda consulta ou alteração de dados financeiros exige sessão válida e acessa exclusivamente os registros daquela conta.
  - Ao entrar na mesma conta em PC e celular, os mesmos dados ficam disponíveis após atualizar ou reabrir o app; mudanças feitas em um dispositivo são refletidas no outro sem depender do LocalStorage como fonte de verdade.

- [ ] **Dashboard BI com resultado financeiro e meta de poupança**
  - Preservar o dashboard financeiro atual e a identidade visual escura em azul/índigo, com navegação lateral no desktop e navegação adaptada no mobile.
  - Mostrar resultado do período (receitas menos despesas), receitas e gastos separados entre realizados e previstos e projeção de três meses baseada nas recorrências.
  - Permitir definir a meta percentual de poupança e mostrar o valor-alvo, taxa atingida, progresso e quanto falta; quando o resultado for negativo, informar o prejuízo e o valor que falta para empatar e atingir a meta.
  - Manter filtros de período e status, gráfico de fluxo de caixa, gastos por categoria, top cinco gastos, últimas movimentações e resumo de saúde financeira, sem dados financeiros de demonstração.

- [ ] **Movimentações e recorrências**
  - Permitir cadastrar, editar e excluir movimentações de entrada/saída com data, descrição, categoria, valor, status realizado/previsto e opção de ignorar no fluxo.
  - Permitir cadastrar, editar e excluir recorrências de entrada/saída com descrição, categoria, valor mensal e dia previsto, usadas na projeção trimestral.
  - Atualizar os indicadores e as projeções depois de cada alteração confirmada pelo servidor.

- [ ] **Importação de extratos e conciliação bancária mensal**
  - Importar CSV, OFX e PDF com prévia dos lançamentos identificados e revisão/seleção antes de confirmar; reconhecer duplicatas e evitar duplicação ao reimportar o mesmo extrato.
  - Preservar o parser específico do layout PDF do Banco Inter, incluindo identificação de lançamentos, data do extrato e saldo final informado.
  - Permitir informar o saldo inicial de cada mês; calcular saldo esperado somando as movimentações realizadas até a data do saldo do extrato; mostrar saldo calculado, saldo do extrato, diferença e estado da conciliação, considerando diferença menor que R$ 0,01 como conciliada.
  - CSV/OFX sem saldo final continuam válidos para registrar lançamentos, mas não devem ser apresentados como conciliação confirmada.

- [ ] **Registro de lançamento por voz com revisão antes de salvar**
  - O botão “Registrar lançamento por voz” inicia reconhecimento em português do Brasil quando suportado pelo navegador e pede acesso ao microfone.
  - A fala preenche uma sugestão de descrição, tipo, categoria, valor, data e status; abre o formulário para a pessoa revisar e confirmar manualmente, sem salvar automaticamente.
  - Mostrar instrução alternativa caso o navegador não suporte reconhecimento de voz ou o microfone não esteja disponível.

- [ ] **Migração dos dados locais do dashboard antigo**
  - Oferecer um caminho simples para exportar os dados existentes no HTML antigo (LocalStorage `financasBI_v2`) e importá-los para a nova conta, preservando movimentações, recorrências, meta, saldos iniciais mensais e saldos de extratos.
  - A importação exige confirmação do usuário, não substitui registros existentes silenciosamente e informa conflitos/duplicatas; deixar claro que dados de outros navegadores/dispositivos não migram automaticamente.

- [ ] **Interface responsiva e acessível**
  - Preservar o visual do dashboard atual e enquadrar os fluxos principais em desktop e mobile, incluindo telas estreitas, menu, filtros, cartões, tabelas, formulários e importação.
  - Informar estados de carregamento, salvamento, erros e ausência de dados; oferecer foco visível, rótulos acessíveis e botões utilizáveis por toque.

- [ ] **Revisão independente de implementação complexa**
  - Um agente de leitura verifica se a autenticação, o isolamento de dados, a persistência, o fluxo de importação/conciliação e o Preview correspondem aos critérios deste TODO e ao Blueprint, sem modificar arquivos.
