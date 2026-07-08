Tenho enfrentado problemas com a identificação dos campos após a importação dos arquivos pela ferramenta SIE V3 na tela import. Por esta razão produzir este documento que será a Norma Técnica Oficial desta ferramenta para a compreensão das informações no extrato e posterior alocação nos campos devidos. O texto abaixo já foi escrito pensando em minimizar ambiguidades e servir como referência para implementação.
________________________________________
NORMA TÉCNICA DE INTERPRETAÇÃO DE EXTRATOS BANCÁRIOS (NTIEB)
Versão: 1.0
Status: Oficial
Objetivo: Definir o padrão único de interpretação de extratos bancários para sistemas de importação, classificação e estruturação de movimentações financeiras.
________________________________________
PARTE I — FUNDAMENTOS DA INTERPRETAÇÃO
________________________________________
Capítulo 1 — Objetivo
1.1 Finalidade
Esta norma estabelece as regras obrigatórias para interpretação de extratos bancários, independentemente:
•	da instituição financeira;
•	do layout utilizado;
•	da tecnologia empregada na geração do documento;
•	do idioma utilizado para descrição das operações;
•	do formato do arquivo.
Aplica-se igualmente a:
•	PDF nativo;
•	PDF digitalizado (OCR);
•	OFX;
•	CSV;
•	XLS/XLSX;
•	TXT;
•	APIs bancárias;
•	futuros formatos compatíveis.
________________________________________
1.2 Problema que esta norma resolve
Cada banco organiza seus extratos de forma diferente.
Existem bancos que:
•	escrevem tudo em uma linha;
•	distribuem um lançamento em seis linhas;
•	quebram um lançamento entre páginas;
•	repetem cabeçalhos;
•	utilizam descrições diferentes para a mesma operação.
Esta norma elimina a dependência do layout.
O sistema passa a interpretar o significado financeiro das informações.
________________________________________
1.3 Objetivos Específicos
Esta especificação busca garantir:
•	interpretação uniforme;
•	redução de erros;
•	independência entre bancos;
•	facilidade de manutenção;
•	facilidade de expansão;
•	rastreabilidade das decisões;
•	previsibilidade dos resultados.
________________________________________
Capítulo 2 — Escopo
Esta norma regula exclusivamente:
✔ identificação dos lançamentos;
✔ classificação financeira;
✔ reconstrução lógica dos blocos;
✔ extração das informações;
✔ normalização;
✔ validação.
Esta norma não define:
•	regras contábeis;
•	regras tributárias;
•	categorização financeira (alimentação, combustível etc.);
•	conciliação bancária;
•	classificação fiscal.
Essas funções pertencem a módulos independentes.
________________________________________
Capítulo 3 — Princípios Fundamentais
Toda implementação deverá obedecer obrigatoriamente aos princípios abaixo.
________________________________________
Princípio 1 — O extrato é um documento lógico
O parser jamais deverá interpretar um extrato como um conjunto de linhas.
O extrato representa um conjunto de operações financeiras.
Cada operação é composta por diversas informações relacionadas entre si.
________________________________________
Princípio 2 — O significado possui prioridade sobre a posição
Jamais assumir que:
•	coluna A significa data;
•	coluna B significa descrição;
•	coluna C significa valor.
Essas posições mudam entre bancos.
O significado da informação possui prioridade absoluta.
________________________________________
Princípio 3 — Um lançamento é indivisível
Nenhuma informação poderá ser interpretada antes que todo o lançamento seja identificado.
Nunca interpretar parcialmente um bloco.
________________________________________
Princípio 4 — Nenhuma informação será inventada
O sistema somente poderá preencher um campo quando existir evidência suficiente.
Caso contrário:
•	manter vazio;
•	ou marcar para validação.
É proibido criar:
•	clientes;
•	datas;
•	valores;
•	operações;
•	bancos.
________________________________________
Princípio 5 — Preservação da informação
Sempre que existir conflito entre:
•	remover informação
ou
•	preservar informação
deverá prevalecer a preservação.
A limpeza será realizada posteriormente.
________________________________________
Princípio 6 — Independência da instituição
As regras desta norma nunca poderão depender do banco.
Toda particularidade deverá ser tratada como exceção, nunca como regra principal.
________________________________________
Capítulo 4 — Glossário Oficial
Este capítulo elimina interpretações diferentes.
________________________________________
4.1 Lançamento
Conjunto de informações que representa uma única movimentação financeira.
Todo lançamento possui:
•	início;
•	conteúdo;
•	término.
Jamais poderá existir um lançamento parcialmente interpretado.
________________________________________
4.2 Bloco
Agrupamento físico das linhas pertencentes ao mesmo lançamento.
Um bloco poderá possuir:
1 linha
ou
15 linhas.
O tamanho não altera seu significado.
________________________________________
4.3 Descrição
Texto que explica qual operação ocorreu.
Exemplos:
Transferência Recebida
PIX
Pagamento
TED
DOC
Aplicação
Resgate
Compra
Tarifa
________________________________________
4.4 Cliente
Pessoa física ou jurídica envolvida na movimentação.
O cliente nunca representa:
•	agência;
•	conta;
•	CPF;
•	banco (salvo operações internas).
________________________________________
4.5 Banco
Instituição financeira responsável pela operação.
Não deve ser confundido com cliente.
________________________________________
4.6 Dados Complementares
Informações auxiliares.
Exemplos:
CPF
CNPJ
Conta
Agência
ISPB
Código Bancário
Chave PIX
Esses dados enriquecem o lançamento.
Jamais definem sua natureza.
________________________________________
4.7 Contexto
Informações herdadas.
Exemplo.
Uma data encontrada continua válida até surgir outra.
O contexto evita repetições desnecessárias.
________________________________________
4.8 Operação Bancária
Movimentação realizada exclusivamente dentro da estrutura financeira do banco.
Exemplos.
Aplicação.
Resgate.
Rendimento.
Valor adicionado.
Crédito interno.
Nessas situações normalmente não existe um terceiro envolvido.
________________________________________
Capítulo 5 — Hierarquia Oficial das Decisões
Este capítulo possui prioridade sobre qualquer outro.
Sempre que houver conflito entre duas regras deverá ser obedecida a seguinte ordem.
________________________________________
Nível 1
Evidência explícita.
É a informação claramente escrita no documento.
Possui prioridade máxima.
________________________________________
Nível 2
Contexto Financeiro.
Exemplo.
Uma transferência recebida jamais poderá ser classificada como despesa apenas porque o OCR leu um sinal incorretamente.
________________________________________
Nível 3
Descrição da Operação.
A descrição possui prioridade sobre:
posição;
layout;
cores;
alinhamento.
________________________________________
Nível 4
Relacionamento entre linhas.
Linhas próximas geralmente pertencem ao mesmo lançamento.
Porém essa proximidade nunca será utilizada isoladamente.
________________________________________
Nível 5
Layout.
A posição física é utilizada apenas quando nenhuma regra anterior resolver a situação.
________________________________________
Regra de Ouro
O layout possui a menor prioridade do sistema.
________________________________________
Capítulo 6 — Arquitetura Conceitual do Parser
O parser deverá ser dividido em etapas independentes.
Jamais misturar funções.
Cada etapa recebe dados da anterior.
________________________________________
Etapa 1
Leitura do documento.
Nenhuma interpretação ocorre aqui.
________________________________________
Etapa 2
Reconstrução textual.
Remoção de quebras artificiais.
Correção de OCR.
Unificação das páginas.
________________________________________
Etapa 3
Remoção de informações administrativas.
Cabeçalhos.
Rodapés.
Mensagens legais.
Telefones.
Informações institucionais.
________________________________________
Etapa 4
Identificação das datas.
Definição do contexto temporal.
________________________________________
Etapa 5
Reconhecimento dos blocos.
Ainda não existe cliente.
Ainda não existe valor.
Apenas blocos.
________________________________________
Etapa 6
Extração das informações.
Descrição.
Cliente.
Banco.
Valor.
Complementos.
________________________________________
Etapa 7
Classificação.
Tipo.
Natureza.
________________________________________
Etapa 8
Normalização.
Padronização.
Limpeza.
________________________________________
Etapa 9
Validação.
Consistência.
Duplicidade.
Integridade.
________________________________________
Capítulo 7 — Reconstrução do Documento
Antes da interpretação deverá ser reconstruída a sequência lógica do documento.
Jamais interpretar páginas isoladamente.
________________________________________
7.1 Ordem
As páginas deverão ser unificadas.
Somente após isso ocorrerá a interpretação.
________________________________________
7.2 Continuidade
Caso um lançamento termine na página seguinte.
Ele deverá ser reconstruído.
Nunca encerrado.
________________________________________
7.3 Quebras
Quebras provocadas pelo PDF não representam necessariamente novo lançamento.
Exemplo.
Transferência enviada

Maria Oliveira

Banco X

Agência

Conta

150,00
É um único lançamento.
________________________________________
7.4 OCR
Quando o OCR separar palavras.
Tran
sferência
Deverá reconstruir:
Transferência
Sempre que houver confiança suficiente.
________________________________________
Capítulo 8 — Estrutura Oficial do Lançamento
Todo lançamento será interpretado como um objeto lógico.
Campos obrigatórios.
Data
Descrição
Valor
Natureza
________________________________________
Campos desejáveis.
Cliente
Banco
CPF
Conta
Agência
Documento
Observações
________________________________________
Campos opcionais.
Cidade
Canal
Chave PIX
Código ISPB
Número da operação
Identificador interno
________________________________________
Capítulo 9 — Regras Gerais de Extração
Toda informação extraída deverá obedecer às seguintes regras.
________________________________________
Regra 9.1
Nunca interpretar uma linha isoladamente.
________________________________________
Regra 9.2
Sempre interpretar o bloco inteiro.
________________________________________
Regra 9.3
Jamais utilizar apenas posição física.
________________________________________
Regra 9.4
Jamais substituir informação explícita por inferência.
________________________________________
Regra 9.5
Informações complementares nunca possuem prioridade sobre descrição.
________________________________________
Regra 9.6
Cliente nunca será identificado utilizando CPF.
________________________________________
Regra 9.7
Agência nunca será cliente.
________________________________________
Regra 9.8
Conta nunca será cliente.
________________________________________
Regra 9.9
Banco somente será cliente em operações internas.
________________________________________
Regra 9.10
Toda decisão deverá ser reproduzível.
Outro desenvolvedor aplicando esta norma deverá chegar exatamente ao mesmo resultado.
________________________________________
Capítulo 10 — Critérios de Qualidade
Toda implementação deverá atender simultaneamente aos seguintes requisitos:
Precisão
Extrair corretamente os dados sem alterar seu significado.
Consistência
A mesma operação deve produzir sempre o mesmo resultado, independentemente do banco ou do formato do arquivo.
Rastreabilidade
Toda decisão tomada pelo parser deve poder ser explicada pelas regras desta norma.
Robustez
O parser deve ser resistente a mudanças de layout, quebras de linha, variações de fonte, mudanças de página e pequenas imperfeições de OCR.
Não Inferência
Na ausência de evidência suficiente, o sistema não deverá inventar informações nem preencher campos por probabilidade.
Evolução
Novas regras específicas para bancos poderão ser adicionadas futuramente, desde que não contrariem os princípios e a hierarquia estabelecidos nesta norma.
________________________________________
Encerramento da Parte I
A Parte I estabelece a base conceitual da norma. Ela define como o parser deve pensar, quais princípios devem orientar todas as decisões e qual é a arquitetura geral do processo de interpretação. A partir da Parte II, a especificação passa a detalhar a implementação operacional de cada etapa do processamento, iniciando pela segmentação dos lançamentos e pelas regras formais de reconstrução dos blocos de movimentação. Isso permitirá transformar os princípios definidos aqui em algoritmos determinísticos e reproduzíveis.
Perfeito. A partir daqui o documento entra na parte que considero o coração da especificação. Se a Parte I define "como pensar", a Parte II define como executar.
Aqui já começamos a escrever regras praticamente determinísticas, reduzindo ao máximo a necessidade de interpretação por parte do desenvolvedor ou da IA.












________________________________________
NORMA TÉCNICA DE INTERPRETAÇÃO DE EXTRATOS BANCÁRIOS (NTIEB)
PARTE II — PROCESSAMENTO E RECONSTRUÇÃO DOS LANÇAMENTOS
________________________________________
Capítulo 11 — Modelo de Processamento
11.1 Objetivo
O objetivo desta etapa é transformar um documento bancário em uma sequência ordenada de lançamentos financeiros completos, preservando sua integridade lógica.
Ao final desta etapa o sistema ainda não classificou receitas ou despesas.
Ele apenas reconstruiu corretamente cada movimentação.
________________________________________
11.2 Princípio
Todo documento deverá ser processado da seguinte forma.
Documento

↓

Texto bruto

↓

Texto reconstruído

↓

Blocos

↓

Lançamentos

↓

Campos

↓

Classificação
Jamais inverter essa sequência.
________________________________________
11.3 Regra Fundamental
Nenhum campo poderá ser extraído antes que o bloco esteja completamente identificado.
Exemplo incorreto
Transferência Recebida
Já assumir cliente.
ERRADO.
Primeiro termina-se de montar o bloco.
Depois extrai-se.
________________________________________
Capítulo 12 — Reconstrução do Texto
12.1 Objetivo
Eliminar interferências causadas pela forma como o PDF foi produzido.
O parser deverá reconstruir o documento como se fosse um texto contínuo.
________________________________________
12.2 Elementos que deverão ser preservados
•	ordem das páginas;
•	ordem das linhas;
•	ordem dos caracteres;
•	sequência cronológica.
________________________________________
12.3 Elementos que deverão ser removidos
Cabeçalhos repetidos.
Rodapés.
Número da página.
Horário de emissão.
Mensagens legais.
Telefone.
Ouvidoria.
Links.
QR Code.
CNPJ do banco.
Nome do titular.
CPF do titular.
Logotipo.
________________________________________
12.4 Elementos que deverão permanecer
Datas.
Valores.
Descrição.
Cliente.
Banco.
Agência.
Conta.
CPF do favorecido.
CNPJ do favorecido.
________________________________________
12.5 Regra
Nada deverá ser removido antes que o parser tenha certeza de que aquela informação não pertence a um lançamento.
________________________________________
Capítulo 13 — Identificação dos Blocos
13.1 Definição
Bloco é o conjunto de linhas pertencentes a uma única movimentação.
Não existe limite mínimo nem máximo de linhas.
Exemplo
Transferência Recebida

Maria Oliveira

Banco Inter

Conta

Agência

150,00
Tudo pertence ao mesmo bloco.
________________________________________
13.2 O início de um bloco
Um novo bloco poderá iniciar quando ocorrer um dos eventos abaixo.
Evento A
Nova descrição de operação.
Evento B
Novo valor após encerramento do bloco anterior.
Evento C
Nova data.
Evento D
Fim do documento.
________________________________________
13.3 O término de um bloco
Um bloco somente poderá terminar quando ocorrer uma destas condições.
Novo bloco.
Nova data.
Fim do documento.
Jamais considerar mudança de página como encerramento.
________________________________________
13.4 Regra de Continuidade
Caso o parser encontre
Transferência enviada
no final da página
e
Maria Oliveira

Banco

Conta

100,00
na página seguinte
Deverá reconstruir:
Transferência enviada

Maria Oliveira

Banco

Conta

100,00
________________________________________
Capítulo 14 — Contexto Temporal
14.1 Definição
A data funciona como contexto.
Ela permanece válida até outra data ser encontrada.
________________________________________
14.2 Regra
Sempre utilizar a última data válida.
________________________________________
Exemplo
05 JAN

PIX João

20,00

Maria

50,00

Empresa X

100,00
Os três lançamentos pertencem ao dia 05 JAN.
________________________________________
14.3 Mudança de contexto
Somente uma nova data encerra o contexto atual.
________________________________________
14.4 Data ausente
Caso um lançamento não possua data.
Utilizar a última encontrada.
________________________________________
14.5 Data inválida
Caso a data seja ilegível.
O lançamento deverá ser marcado para revisão.
Jamais criar datas.
________________________________________
Capítulo 15 — Reconhecimento das Operações
A primeira informação procurada dentro do bloco deverá ser a operação.
Ela define praticamente toda a interpretação posterior.
________________________________________
15.1 Operações de Crédito
São consideradas operações de crédito.
Transferência Recebida
PIX Recebido
TED Recebida
DOC Recebido
Crédito em Conta
Resgate
Rendimento
Estorno de Débito
Depósito
Recebimento
Receita Financeira
________________________________________
15.2 Operações de Débito
Pagamento
PIX Enviado
TED Enviada
DOC Enviado
Compra
Compra Débito
Compra Crédito
Aplicação
Tarifa
IOF
Juros
Pagamento de boleto
Débito automático
________________________________________
15.3 Operações Neutras
Saldo Inicial.
Saldo Final.
Saldo do Dia.
Total Entradas.
Total Saídas.
Movimentações.
Informações.
Essas operações não geram lançamento.
________________________________________
Capítulo 16 — Extração da Descrição
16.1 Objetivo
Identificar corretamente a natureza da movimentação.
________________________________________
16.2 Regra
A descrição será composta apenas pelas palavras que descrevem a operação.
________________________________________
Exemplo
Transferência enviada pelo Pix

Carlos Henrique

Banco Inter

Conta

100,00
Descrição
Transferência enviada pelo Pix
________________________________________
16.3 Não pertencem à descrição
CPF.
Conta.
Agência.
Banco.
Valor.
________________________________________
16.4 Descrição longa
Caso a descrição esteja dividida em diversas linhas.
Ela deverá ser reconstruída.
________________________________________
Exemplo
Pagamento

de boleto

efetuado
Resultado
Pagamento de boleto efetuado
________________________________________
Capítulo 17 — Extração do Cliente
Este capítulo possui prioridade máxima.
Grande parte dos erros ocorre aqui.
________________________________________
17.1 Definição
Cliente é o terceiro envolvido.
________________________________________
17.2 Ordem obrigatória
Primeiro procurar
Pessoa Física.
Depois
Pessoa Jurídica.
Depois
Instituição Financeira.
Depois
Banco emissor.
________________________________________
17.3 Pessoa Física
Sempre terá prioridade.
Mesmo que exista empresa.
________________________________________
Exemplo
PIX

João Batista

Banco Inter
Cliente
João Batista.
Nunca Banco Inter.
________________________________________
17.4 Pessoa Jurídica
Somente utilizar quando não existir pessoa.
________________________________________
Exemplo
Pagamento

Mercado Livre

200,00
Cliente
Mercado Livre.
________________________________________
17.5 Banco
Banco somente poderá ser cliente quando não existir terceiro.
________________________________________
Exemplo
Aplicação RDB
Cliente
Banco emissor.
________________________________________
17.6 Casos proibidos
Jamais utilizar
Conta.
Agência.
CPF.
ISPB.
Código bancário.
Como cliente.
________________________________________
Capítulo 18 — Dados Complementares
Informações complementares deverão permanecer vinculadas ao lançamento.
Nunca descartadas.
________________________________________
Podem ser armazenadas:
CPF.
CNPJ.
Conta.
Agência.
Banco.
ISPB.
Chave PIX.
Documento.
Autenticação.
________________________________________
Essas informações nunca alteram a classificação financeira.
________________________________________
Capítulo 19 — Extração do Valor
Este capítulo é obrigatório.
________________________________________
19.1 Definição
Todo lançamento possui apenas um valor financeiro principal.
________________________________________
19.2 Regra
O parser deverá ignorar qualquer número que não represente dinheiro.
________________________________________
Ignorar.
CPF.
Conta.
Agência.
Código Banco.
ISPB.
Telefone.
Página.
________________________________________
19.3 Valor
Somente números monetários.
Exemplo.
150,00
1.580,25
25,90
________________________________________
19.4 Dois valores
Caso existam dois valores.
Utilizar aquele diretamente relacionado à movimentação.
Jamais somar.
Jamais calcular média.
________________________________________
19.5 Valor ausente
O lançamento deverá ser marcado para revisão.
________________________________________
Capítulo 20 — Critérios Obrigatórios de Integridade
Ao final desta etapa.
Todo lançamento deverá possuir.
Obrigatórios.
✓ Data
✓ Descrição
✓ Valor
________________________________________
Desejáveis.
✓ Cliente
✓ Banco
________________________________________
Complementares.
✓ Conta
✓ Agência
✓ CPF
✓ CNPJ
✓ ISPB
________________________________________
Caso algum campo obrigatório esteja ausente.
O lançamento não poderá seguir para classificação automática.
Ele deverá ser enviado para validação.
________________________________________
Encerramento da Parte II
Ao final desta etapa, o parser deve ter transformado o documento original em uma coleção de lançamentos completos e estruturados, preservando a integridade lógica de cada movimentação. Ainda não houve categorização financeira (receita/despesa), aplicação de regras específicas por tipo de operação ou validação contábil. Essas atividades pertencem às próximas partes da norma.
________________________________________
Observação de Arquitetura (importante)
A partir da Parte III, pretendo elevar ainda mais o nível da especificação. Em vez de listar apenas regras, cada tipo de operação (PIX, TED, boleto, aplicação, resgate, estorno, tarifas etc.) será tratado como uma entidade de negócio, com:
•	definição formal;
•	regras de identificação;
•	variações encontradas entre bancos;
•	prioridade de classificação;
•	exceções;
•	exemplos positivos e negativos;
•	algoritmo de decisão.
Essa abordagem transforma a norma em um documento muito próximo de uma especificação de engenharia de software, reduzindo significativamente as possibilidades de interpretações diferentes entre implementações. É essa parte que dará ao projeto o nível de robustez que você está buscando.
Perfeito. A partir desta parte deixamos de falar sobre estrutura e passamos a definir como o sistema toma decisões.
Na minha opinião, esta é a parte mais importante de toda a especificação. Se ela for bem escrita, o parser funcionará para Nubank, Banco do Brasil, Itaú, Caixa, Santander, Inter, C6, Sicredi, Sicoob, Mercado Pago, PagBank, Stone, cooperativas e praticamente qualquer outro banco sem precisar criar regras específicas para cada um.
A partir daqui todas as regras passam a ser determinísticas.
















________________________________________
NORMA TÉCNICA DE INTERPRETAÇÃO DE EXTRATOS BANCÁRIOS (NTIEB)
PARTE III — IDENTIFICAÇÃO E CLASSIFICAÇÃO DAS OPERAÇÕES
________________________________________
Capítulo 21 — Princípio Geral da Classificação
21.1 Objetivo
Toda movimentação financeira deverá ser classificada segundo o significado da operação, e nunca segundo a posição do texto no extrato.
A classificação deverá representar corretamente a natureza da movimentação realizada.
________________________________________
21.2 Ordem obrigatória de decisão
Sempre seguir exatamente esta ordem.
Descrição

↓

Contexto

↓

Cliente

↓

Instituição

↓

Valor

↓

Informações Complementares
Jamais inverter esta sequência.
________________________________________
21.3 Regra Fundamental
A descrição possui prioridade absoluta.
Se existir conflito entre:
•	sinal positivo
e
•	descrição
prevalece a descrição.
Exemplo
Pagamento de boleto

+150,00
Mesmo com sinal positivo.
Continua sendo
Pagamento.
A inconsistência deverá ser registrada para validação.
Nunca alterar a natureza da operação para fazer coincidir o sinal.
________________________________________
Capítulo 22 — Taxonomia Oficial das Operações
Toda movimentação deverá pertencer a exatamente uma categoria principal.
Transferências

Pagamentos

Compras

Investimentos

Empréstimos

Tributos

Tarifas

Cartões

Estornos

Recebimentos

Outros Créditos

Outros Débitos
Nenhuma movimentação poderá pertencer simultaneamente a duas categorias.
________________________________________
Capítulo 23 — Transferências
Definição
Transferência é toda movimentação cujo objetivo seja enviar ou receber recursos entre contas.
Inclui:
PIX
TED
DOC
Transferência interna
Transferência eletrônica
Transferência entre contas
________________________________________
Identificação
Palavras como:
Transferência
Transferido
Recebido
Enviado
PIX
TED
DOC
Crédito
Débito
devem ser avaliadas em conjunto.
Nunca isoladamente.
________________________________________
Subclassificação
Transferência Recebida
Transferência Enviada
Transferência Interna
Transferência Agendada
Transferência Cancelada
Transferência Estornada
________________________________________
Prioridade
Transferência possui prioridade sobre:
Banco.
CPF.
Conta.
________________________________________
Capítulo 24 — PIX
Definição
PIX é um subtipo de transferência.
Nunca deverá ser tratado como categoria independente.
________________________________________
Operações reconhecidas
PIX Recebido
PIX Enviado
PIX Agendado
PIX Cancelado
PIX Estornado
PIX Devolvido
PIX Cobrança
PIX QR Code
PIX Automático
________________________________________
Cliente
Caso exista pessoa.
Pessoa vence.
Caso exista empresa.
Empresa vence.
Caso não exista terceiro.
Banco emissor.
________________________________________
Banco
O banco participante nunca será considerado cliente quando houver favorecido identificado.
________________________________________
Capítulo 25 — TED e DOC
Seguem exatamente as mesmas regras do PIX.
A única diferença é o meio utilizado.
A classificação financeira permanece idêntica.
________________________________________
Capítulo 26 — Pagamentos
Definição
Toda operação cujo objetivo seja quitar uma obrigação financeira.
________________________________________
Exemplos
Pagamento.
Pagamento boleto.
Pagamento PIX.
Pagamento DARF.
Pagamento GPS.
Pagamento Tributo.
Pagamento Conta.
Pagamento Convênio.
Pagamento Fornecedor.
Pagamento Salário.
________________________________________
Natureza
Sempre Despesa.
Exceto quando explicitamente identificado como estorno.
________________________________________
Cliente
Sempre utilizar o favorecido.
Nunca utilizar o banco intermediador.
________________________________________
Capítulo 27 — Compras
Incluem.
Compra Débito.
Compra Crédito.
Compra Cartão.
Compra Online.
Compra Presencial.
Compra NFC.
Compra Aproximada.
________________________________________
Natureza.
Despesa.
________________________________________
Cliente.
Sempre o estabelecimento.
Nunca a operadora do cartão.
________________________________________
Capítulo 28 — Investimentos
Este capítulo é extremamente importante.
Grande parte dos bancos utiliza nomenclaturas diferentes.
________________________________________
São operações de investimento.
Aplicação.
Aplicação automática.
Aplicação RDB.
Aplicação CDB.
Aplicação Fundo.
Aplicação Tesouro.
Aplicação Poupança.
________________________________________
Natureza.
Despesa.
Porque o dinheiro sai da conta corrente.
________________________________________
São operações de retorno.
Resgate.
Resgate automático.
Resgate CDB.
Resgate RDB.
Resgate Fundo.
Resgate Tesouro.
________________________________________
Natureza.
Receita.
Porque o dinheiro retorna à conta.
________________________________________
Cliente.
Banco emissor.
Nunca "RDB".
Nunca "Aplicação".
Nunca "Resgate".
________________________________________
Capítulo 29 — Empréstimos
Devem ser separados em duas categorias.
________________________________________
Entrada do empréstimo.
Receita.
________________________________________
Pagamento do empréstimo.
Despesa.
________________________________________
Juros.
Despesa.
________________________________________
Amortização.
Despesa.
________________________________________
Liquidação.
Despesa.
________________________________________
Cliente.
Banco emissor.
________________________________________
Capítulo 30 — Tarifas
Incluem.
Tarifa Bancária.
Tarifa PIX.
Tarifa TED.
Tarifa DOC.
Tarifa Mensal.
Pacote.
Cesta.
Anuidade.
IOF.
IR.
Juros.
Multa.
Encargos.
________________________________________
Natureza.
Despesa.
________________________________________
Cliente.
Banco emissor.
________________________________________
Capítulo 31 — Estornos
Definição
Operação que desfaz movimentação anterior.
________________________________________
Tipos.
Estorno de Compra.
Estorno PIX.
Estorno TED.
Estorno DOC.
Estorno Tarifa.
Estorno Pagamento.
________________________________________
Natureza.
Depende da operação original.
Nunca assumir automaticamente Receita.
________________________________________
Exemplo.
Estorno de tarifa.
Receita.
________________________________________
Estorno de crédito.
Despesa.
________________________________________
Estorno de débito.
Receita.
________________________________________
Capítulo 32 — Operações Bancárias Internas
São movimentações que não possuem terceiro.
Exemplos.
Aplicação.
Resgate.
Rendimento.
Crédito Interno.
Débito Interno.
Valor Adicionado.
Remuneração.
Correção.
________________________________________
Cliente.
Banco emissor.
________________________________________
Nunca utilizar.
Aplicação.
Resgate.
Rendimento.
Como cliente.
________________________________________
Capítulo 33 — Determinação de Receita e Despesa
A classificação seguirá rigorosamente a seguinte hierarquia.
Nível 1
Descrição.
Sempre vence.
________________________________________
Nível 2
Tipo da operação.
________________________________________
Nível 3
Contexto.
Entradas.
Saídas.
________________________________________
Nível 4
Sinal financeiro.
________________________________________
Nível 5
Validação Manual.
________________________________________
Jamais inverter essa ordem.
________________________________________
Capítulo 34 — Matriz Oficial de Classificação
Operação	Natureza
Transferência Recebida	Receita
PIX Recebido	Receita
TED Recebida	Receita
DOC Recebido	Receita
Crédito em Conta	Receita
Depósito	Receita
Recebimento	Receita
Resgate	Receita
Rendimento	Receita
Estorno de Débito	Receita
Transferência Enviada	Despesa
PIX Enviado	Despesa
TED Enviada	Despesa
DOC Enviado	Despesa
Pagamento	Despesa
Compra	Despesa
Aplicação	Despesa
Tarifa	Despesa
IOF	Despesa
Juros	Despesa
Multa	Despesa
Débito Automático	Despesa
Esta tabela possui prioridade normativa.
________________________________________
Capítulo 35 — Regras Proibidas
São expressamente proibidas as seguintes práticas.
❌ Utilizar posição da coluna para determinar Receita.
❌ Utilizar cor do texto.
❌ Utilizar fonte.
❌ Utilizar tamanho da fonte.
❌ Utilizar CPF como cliente.
❌ Utilizar agência como cliente.
❌ Utilizar conta como cliente.
❌ Utilizar banco como cliente quando houver favorecido.
❌ Criar cliente inexistente.
❌ Criar valor inexistente.
❌ Criar datas.
❌ Criar descrições.
❌ Alterar informações do extrato.
❌ Corrigir automaticamente inconsistências financeiras.
________________________________________
Capítulo 36 — Critérios de Confiabilidade
Cada decisão deverá possuir um nível de confiança.
Situação	Confiança
Informação explícita	Muito Alta
Contexto inequívoco	Alta
Associação por bloco	Média
OCR parcialmente degradado	Baixa
Inferência necessária	Muito Baixa
Regra obrigatória:
Sempre que duas interpretações tiverem o mesmo nível de confiança, nenhuma deverá ser escolhida automaticamente. O lançamento deverá ser encaminhado para validação manual.
________________________________________
Encerramento da Parte III
Esta parte estabelece o modelo oficial de classificação das operações financeiras. A partir dela, qualquer lançamento reconstruído passa a ter uma natureza financeira definida de forma determinística, sem depender de layouts específicos ou de regras particulares de cada instituição.
Na Parte IV, a especificação passará a tratar dos aspectos mais complexos da importação: normalização, resolução de ambiguidades, tratamento de OCR, PDFs nativos e digitalizados, múltiplos formatos de descrição, algoritmos de identificação de pessoas e empresas, reconstrução de blocos degradados e regras para cenários excepcionais. Essa etapa é a que tornará o parser verdadeiramente resiliente a extratos reais, inclusive aqueles com baixa qualidade de digitalização ou layouts incomuns.
Excelente. Antes de escrever a Parte IV, fiz uma revisão crítica das três primeiras partes como se eu fosse o arquiteto do projeto.
Encontrei um ponto importante.
Até agora documentamos como identificar um lançamento.
Mas ainda não documentamos como pensar quando o extrato é imperfeito.
E é justamente aí que quase todos os parsers falham.
Na minha opinião, esta será a parte mais importante de toda a NTIEB.
Ela fará o parser deixar de ser um "leitor de PDF" para se tornar um interpretador de documentos financeiros.






























________________________________________
NORMA TÉCNICA DE INTERPRETAÇÃO DE EXTRATOS BANCÁRIOS (NTIEB)
PARTE IV — NORMALIZAÇÃO, RESOLUÇÃO DE AMBIGUIDADES E RECONSTRUÇÃO INTELIGENTE
________________________________________
Capítulo 37 — Objetivo da Normalização
Após reconstruir os lançamentos e identificar seus componentes, o sistema deverá normalizar todas as informações antes de qualquer classificação definitiva.
A normalização não altera o significado da informação.
Seu objetivo é apenas padronizar a representação dos dados.
________________________________________
37.1 A normalização nunca poderá
•	alterar valores;
•	alterar datas;
•	alterar clientes;
•	alterar descrições;
•	alterar bancos.
________________________________________
37.2 A normalização poderá
•	remover espaços duplicados;
•	corrigir capitalização;
•	unir palavras quebradas;
•	remover caracteres invisíveis;
•	padronizar datas;
•	padronizar valores.
________________________________________
Capítulo 38 — Reconstrução Inteligente
O parser deverá interpretar o documento como um conjunto contínuo de informações.
Jamais como páginas independentes.
________________________________________
Regra 38.1
Mudança de página não encerra um bloco.
________________________________________
Regra 38.2
Quebras de linha não encerram uma descrição.
________________________________________
Regra 38.3
Uma palavra quebrada poderá ser reconstruída.
Exemplo
Tran

sferência
Resultado
Transferência
________________________________________
Regra 38.4
Jamais reconstruir palavras quando existirem duas interpretações possíveis.
Nesse caso deverá permanecer o texto original.
________________________________________
Capítulo 39 — Hierarquia Oficial das Evidências
Este capítulo possui prioridade superior à maioria das regras anteriores.
Toda decisão deverá utilizar esta ordem.
Evidência Nível 1
Informação explícita.
Exemplo
Transferência Recebida
Não existe interpretação.
________________________________________
Evidência Nível 2
Informação contextual.
Exemplo
O lançamento encontra-se dentro de "Entradas".
________________________________________
Evidência Nível 3
Informação estrutural.
Exemplo
O nome encontra-se entre a descrição e o valor.
________________________________________
Evidência Nível 4
Informação probabilística.
Exemplo
OCR identificou
Joã0
Provavelmente seria
João
Essa informação nunca poderá substituir uma evidência explícita.
________________________________________
Capítulo 40 — Tratamento de OCR
Quando o documento for proveniente de OCR deverão ser aplicadas regras adicionais.
________________________________________
40.1 Caracteres semelhantes
O parser deverá considerar equivalências conhecidas.
Exemplos
0 ↔ O
1 ↔ I
5 ↔ S
8 ↔ B
l ↔ I
________________________________________
40.2 Espaços incorretos
OCR frequentemente produz
Trans ferência
Resultado esperado
Transferência
________________________________________
40.3 Palavras divididas
Recebi

da
Resultado
Recebida
________________________________________
40.4 OCR ilegível
Caso a reconstrução reduza a confiabilidade.
Jamais corrigir automaticamente.
________________________________________
Capítulo 41 — PDFs Nativos
PDFs nativos possuem prioridade sobre OCR.
Sempre utilizar o texto nativo.
Jamais executar OCR quando existir texto confiável.
________________________________________
Capítulo 42 — PDFs Digitalizados
Quando não existir texto.
Executar OCR.
Após OCR.
Aplicar todas as regras desta norma.
________________________________________
Capítulo 43 — Identificação de Pessoas
Este capítulo elimina grande parte dos erros.
________________________________________
Regra Geral
Pessoa Física sempre possui prioridade sobre empresa.
________________________________________
Indícios de Pessoa Física
Nome composto.
Nome e sobrenome.
Presença de preposições.
Exemplo
Maria de Souza
Carlos Henrique Oliveira
João Batista Lima
Ana Paula dos Santos
________________________________________
Nunca considerar pessoa
Agência.
Conta.
CPF.
Banco.
PIX.
TED.
DOC.
________________________________________
Capítulo 44 — Identificação de Empresas
Quando não existir pessoa.
Procurar empresa.
________________________________________
Indícios
LTDA
ME
MEI
S.A.
EIRELI
COMERCIO
SUPERMERCADO
FARMÁCIA
POSTO
AUTO PEÇAS
MERCADO
LOJAS
MAGAZINE
CENTER
SHOP
________________________________________
Empresas nunca terão prioridade sobre pessoas.
________________________________________
Capítulo 45 — Identificação da Instituição Financeira
Banco somente será identificado quando existir indicação explícita.
Exemplos.
Banco do Brasil.
Caixa Econômica.
Itaú.
Santander.
Bradesco.
Inter.
Nubank.
C6.
Mercado Pago.
PagBank.
Sicredi.
Sicoob.
Stone.
________________________________________
Jamais assumir banco apenas pela aparência do layout.
________________________________________
Capítulo 46 — Regras para Operações Internas
Operações internas não possuem terceiro.
Exemplos.
Aplicação.
Resgate.
Rendimento.
Correção.
Valor adicionado.
Crédito interno.
Débito interno.
________________________________________
Cliente.
Banco emissor.
________________________________________
Capítulo 47 — Tratamento das Informações Complementares
As seguintes informações nunca poderão alterar o significado do lançamento.
CPF.
Conta.
Agência.
ISPB.
Número do documento.
Código interno.
Autenticação.
Hash.
Essas informações apenas enriquecem o registro.
________________________________________
Capítulo 48 — Resolução de Ambiguidades
Este capítulo é obrigatório.
Sempre que houver duas interpretações possíveis.
Aplicar.
________________________________________
Regra 48.1
Escolher a interpretação baseada na maior evidência.
________________________________________
Regra 48.2
Caso exista empate.
Não decidir.
Enviar para validação.
________________________________________
Regra 48.3
Jamais utilizar heurísticas para desempatar.
________________________________________
Capítulo 49 — Conflitos entre Regras
Caso duas regras produzam resultados diferentes.
Aplicar esta prioridade.
1.	Informação explícita.
2.	Contexto financeiro.
3.	Descrição.
4.	Bloco.
5.	Layout.
________________________________________
Nunca inverter essa ordem.
________________________________________
Capítulo 50 — Casos Proibidos
O parser nunca poderá.
Inferir clientes inexistentes.
Criar datas.
Criar valores.
Criar descrições.
Ignorar blocos incompletos.
Excluir informações financeiras.
Mesclar lançamentos diferentes.
Dividir um lançamento completo.
Utilizar posição fixa do PDF.
Depender de coordenadas.
Depender de fonte.
Depender de cor.
Depender de alinhamento.
Alterar o significado do documento.
________________________________________
Capítulo 51 — Algoritmo Oficial de Decisão
Toda implementação deverá seguir rigorosamente a sequência abaixo.
INÍCIO

│

├── Ler documento

│

├── Reconstruir texto

│

├── Remover informações administrativas

│

├── Identificar datas

│

├── Construir blocos

│

├── Validar integridade dos blocos

│

├── Extrair descrição

│

├── Extrair cliente

│

├── Extrair banco

│

├── Extrair valor

│

├── Extrair dados complementares

│

├── Normalizar

│

├── Resolver ambiguidades

│

├── Validar consistência

│

└── Gerar lançamento estruturado
________________________________________
Capítulo 52 — Princípios de Robustez
Toda implementação deverá ser capaz de suportar, sem necessidade de customizações específicas por banco:
•	descrições com múltiplas linhas;
•	lançamentos que atravessam páginas;
•	repetição de cabeçalhos e rodapés;
•	variações de ordem entre descrição, cliente, banco e valor;
•	documentos com OCR de boa qualidade;
•	PDFs nativos;
•	extratos em formatos diferentes, desde que contenham informações textuais.
Mudanças de layout não podem exigir alterações na lógica central do parser. Sempre que possível, adaptações devem ocorrer apenas na camada de leitura do documento, preservando intactas as regras desta norma.
________________________________________
Encerramento da Parte IV
Com esta parte, a NTIEB deixa de depender da aparência do documento e passa a operar sobre evidências semânticas, tornando o processo de importação muito mais resiliente. A partir daqui a especificação já cobre os aspectos essenciais de reconstrução, normalização e tomada de decisão.
Na Parte V, entraremos na etapa final do ciclo: validação, auditoria, métricas de qualidade, consistência financeira, rastreabilidade das decisões e homologação da importação. Essa etapa garantirá que o parser não apenas intérprete corretamente os lançamentos, mas também consiga demonstrar porque cada decisão foi tomada, fornecendo segurança para ambientes de produção e manutenção futura.

Perfeito. Antes de começar, fiz uma análise crítica das quatro partes já escritas como se estivesse auditando a especificação.
A conclusão foi a seguinte:
Até aqui documentamos como interpretar um extrato.
Mas ainda falta responder uma pergunta que, na minha opinião, separa um parser comum de um parser corporativo:
"Como o sistema sabe que fez um bom trabalho?"
Quase toda documentação para na interpretação.
As grandes empresas (SAP, Oracle Financials, TOTVS, Sinqia, Matera etc.) possuem uma última camada:
Validação da interpretação.
É isso que vai impedir importar um extrato inteiro errado sem perceber.
Esta quinta parte fecha praticamente toda a especificação.


























________________________________________
NORMA TÉCNICA DE INTERPRETAÇÃO DE EXTRATOS BANCÁRIOS (NTIEB)
PARTE V — VALIDAÇÃO, AUDITORIA, CONSISTÊNCIA E HOMOLOGAÇÃO
________________________________________
Capítulo 53 — Objetivo da Validação
Após interpretar o documento, o sistema deverá verificar se o resultado obtido é consistente com o extrato original.
A validação é obrigatória.
Nenhum extrato deverá ser considerado importado apenas porque foi lido.
A importação somente será considerada concluída quando todas as validações obrigatórias forem executadas.
________________________________________
Capítulo 54 — Integridade dos Lançamentos
Todo lançamento deverá possuir uma estrutura mínima.
Campos obrigatórios
•	Data
•	Descrição
•	Valor
•	Natureza Financeira
Caso qualquer um desses campos esteja ausente.
O lançamento deverá ser marcado como inconsistente.
________________________________________
Campos desejáveis
•	Cliente
•	Banco
________________________________________
Campos complementares
•	CPF
•	CNPJ
•	Agência
•	Conta
•	ISPB
•	Chave PIX
•	Documento
•	Código interno
A ausência destes não invalida o lançamento.
________________________________________
Capítulo 55 — Validação Financeira
Sempre que o extrato informar totais.
O parser deverá validar.
________________________________________
Entradas
Somatório de todas as receitas
=
Total de Entradas
________________________________________
Saídas
Somatório de todas as despesas
=
Total de Saídas
________________________________________
Saldo
Quando existirem:
Saldo Inicial
Saldo Final
Aplicar
Saldo Inicial

+ Receitas

- Despesas

=

Saldo Final
Caso exista divergência.
O extrato deverá ser sinalizado.
Nunca corrigido automaticamente.
________________________________________
Capítulo 56 — Validação dos Valores
O parser deverá verificar.
________________________________________
Nenhum lançamento poderá possuir.
Mais de um valor principal.
Valor vazio.
Valor textual.
Valor negativo sem operação compatível.
Valor positivo incompatível com a descrição.
________________________________________
Exemplo.
Pagamento

+250,00
Não alterar.
Registrar inconsistência.
________________________________________
Capítulo 57 — Validação das Datas
Todas as datas deverão ser verificadas.
________________________________________
Jamais aceitar.
31 de Fevereiro
32 de Janeiro
00 de Março
________________________________________
Caso o ano esteja ausente.
Utilizar o ano informado no cabeçalho.
Caso não exista.
Marcar revisão.
________________________________________
Datas futuras.
Somente aceitar quando o documento indicar agendamento.
________________________________________
Capítulo 58 — Validação do Cliente
O parser deverá verificar.
________________________________________
Cliente vazio.
Cliente composto apenas por números.
Cliente composto apenas por CPF.
Cliente composto apenas por Agência.
Cliente composto apenas por Conta.
________________________________________
Caso ocorra.
Marcar inconsistência.
________________________________________
Capítulo 59 — Validação da Descrição
A descrição deverá possuir significado financeiro.
________________________________________
Não são descrições válidas.
Conta.
Agência.
CPF.
PIX.
Banco.
Página.
Telefone.
________________________________________
Uma descrição deve representar uma operação.
________________________________________
Capítulo 60 — Duplicidade
Antes da importação.
Todos os lançamentos deverão ser comparados.
________________________________________
Considerar duplicados.
Mesmo.
Data.
Descrição.
Cliente.
Valor.
________________________________________
Quando encontrados.
Jamais remover automaticamente.
Registrar para decisão posterior.
________________________________________
Capítulo 61 — Confidence Score
Toda decisão possuirá um índice de confiança.
________________________________________
Muito Alta
Informação explícita.
________________________________________
Alta
Contexto financeiro inequívoco.
________________________________________
Média
Reconstrução por bloco.
________________________________________
Baixa
Reconstrução por OCR.
________________________________________
Muito Baixa
Inferência.
________________________________________
Regras.
Nunca importar automaticamente lançamentos classificados como Muito Baixa.
________________________________________
Capítulo 62 — Registro de Decisões
Toda decisão importante deverá ser rastreável.
Exemplo.
Cliente:

Maria Oliveira

Origem:

Nome identificado entre descrição e valor.

Regra aplicada:

17.3
Outro exemplo.
Natureza

Receita

Origem

Descrição

Regra aplicada

33.1
Isso permite auditoria completa.
________________________________________
Capítulo 63 — Registro de Inconsistências
O parser deverá registrar.
Campos obrigatórios ausentes.
Datas inválidas.
Valores inconsistentes.
OCR degradado.
Blocos incompletos.
Cliente não identificado.
Descrição desconhecida.
Saldo divergente.
Duplicidade.
Nenhuma inconsistência deverá ser ignorada.
________________________________________
Capítulo 64 — Homologação da Importação
Após todas as validações.
Cada extrato receberá um status.
________________________________________
IMPORTAÇÃO APROVADA
Todas as validações obrigatórias passaram.
________________________________________
IMPORTAÇÃO APROVADA COM ALERTAS
Existem inconsistências não impeditivas.
________________________________________
IMPORTAÇÃO PENDENTE
Necessita validação manual.
________________________________________
IMPORTAÇÃO REJEITADA
Falhas estruturais impedem interpretação segura.
________________________________________
Capítulo 65 — Logs
Toda importação deverá gerar histórico.
No mínimo.
Data da importação.
Arquivo.
Quantidade de páginas.
Quantidade de lançamentos.
Quantidade de receitas.
Quantidade de despesas.
Tempo de processamento.
Quantidade de alertas.
Quantidade de erros.
Versão da NTIEB utilizada.
Versão do parser.
________________________________________
Capítulo 66 — Auditoria
Todo lançamento deverá permitir reconstrução.
Exemplo.
Documento

↓

Página

↓

Bloco

↓

Linha

↓

Campo

↓

Regra Aplicada

↓

Resultado
Nenhuma decisão deverá ser impossível de explicar.
________________________________________
Capítulo 67 — Critérios de Aprovação
Um parser somente poderá ser considerado compatível com esta norma quando atender simultaneamente.
✓ Reconstrução correta dos blocos.
✓ Identificação correta das datas.
✓ Identificação correta dos clientes.
✓ Identificação correta dos valores.
✓ Classificação correta das operações.
✓ Consistência financeira.
✓ Rastreabilidade.
✓ Registro das inconsistências.
________________________________________
Capítulo 68 — Casos de Teste Obrigatórios
Antes da implantação.
O parser deverá ser testado.
No mínimo.
•	PDF nativo.
•	PDF escaneado.
•	OCR de boa qualidade.
•	OCR degradado.
•	Lançamentos em uma linha.
•	Lançamentos em múltiplas linhas.
•	Lançamentos quebrados entre páginas.
•	Extratos sem saldo.
•	Extratos com saldo.
•	Extratos com totais.
•	Extratos contendo apenas receitas.
•	Extratos contendo apenas despesas.
•	Extratos mistos.
•	Extratos contendo aplicações e resgates.
•	Extratos contendo estornos.
•	Extratos contendo duplicidades aparentes.
•	Extratos de diferentes instituições financeiras.
O parser somente poderá entrar em produção após aprovação em todos os cenários obrigatórios.
________________________________________
Capítulo 69 — Princípios de Evolução
Esta norma foi concebida para ser orientada por regras de negócio, e não por layouts específicos.
Toda evolução deverá respeitar os seguintes princípios:
•	A lógica central não deverá ser alterada para atender um banco específico.
•	Novas instituições financeiras deverão ser suportadas por meio de extensões de leitura ou mapeamentos complementares, preservando as regras gerais desta norma.
•	Alterações devem ser preferencialmente aditivas. Regras existentes somente poderão ser modificadas quando houver comprovação de conflito ou erro.
•	Toda nova regra deverá indicar explicitamente se substitui, complementa ou especializa uma regra existente.
________________________________________
Capítulo 70 — Critérios de Conformidade com a NTIEB
Um sistema somente poderá ser declarado conforme esta norma quando atender aos seguintes requisitos mínimos:
1.	Implementar integralmente a sequência de processamento definida na NTIEB.
2.	Aplicar a hierarquia de decisões sem inversões de prioridade.
3.	Não depender de coordenadas fixas, fontes, cores ou layouts específicos.
4.	Reconstruir corretamente lançamentos multilinhas e lançamentos que atravessam páginas.
5.	Classificar operações utilizando as regras semânticas definidas nesta norma.
6.	Validar consistência financeira sempre que o extrato fornecer informações suficientes.
7.	Registrar todas as inconsistências e decisões relevantes.
8.	Permitir auditoria completa de qualquer lançamento importado.
9.	Nunca criar informações inexistentes no documento.
10.	Manter compatibilidade retroativa sempre que a norma evoluir.
________________________________________
ANEXO A — Princípios Fundamentais da NTIEB
Toda implementação compatível com esta norma deverá respeitar, simultaneamente, os seguintes princípios:
1.	Princípio da Evidência — decisões baseiam-se em informações presentes no documento.
2.	Princípio da Não Inferência — ausência de evidência não autoriza a criação de dados.
3.	Princípio da Preservação — informações originais devem ser preservadas sempre que possível.
4.	Princípio da Reprodutibilidade — duas implementações independentes devem chegar ao mesmo resultado aplicando as mesmas regras.
5.	Princípio da Auditabilidade — toda decisão deve poder ser explicada pela regra aplicada.
6.	Princípio da Independência de Layout — mudanças visuais não podem alterar a lógica do parser.
7.	Princípio da Evolução Controlada — novas regras não podem comprometer o comportamento previamente validado.
________________________________________
Encerramento da Versão 1.0
Considero que, com as cinco partes, a NTIEB v1.0 atingiu um nível de maturidade suficiente para servir como especificação oficial de um parser de extratos bancários.
Uma observação importante após concluir a norma
Agora que a especificação está completa, vejo um aspecto que não deveria fazer parte da NTIEB, mas sim de um documento separado: um Catálogo de Operações Bancárias (COB).
A NTIEB define como interpretar um extrato. Já o COB definiria o que cada operação significa, reunindo centenas de descrições reais utilizadas pelos bancos (por exemplo: "Transferência Recebida", "PIX Crédito", "Recebimento PIX", "Crédito em Conta", "TED Recebida", "Recebimento Instantâneo" etc.) e mapeando todas para uma taxonomia comum.
Separar esses documentos tem uma vantagem importante: a norma permanece estável por anos, enquanto o catálogo pode crescer continuamente com novas nomenclaturas encontradas em bancos diferentes, sem exigir revisão da especificação técnica. Na minha avaliação, essa divisão é a arquitetura mais limpa e escalável para o projeto.
