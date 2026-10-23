# Backup diário do Firestore no Google Drive

Este Apps Script exporta todos os documentos do Firestore do projeto
`grupo-cassol-2`, incluindo subcoleções, e cria dois arquivos versionados no
Google Drive:

- `grupo-cassol-firestore-AAAA-MM-DD-HHMMSS.json.gz`
- `grupo-cassol-firestore-AAAA-MM-DD-HHMMSS.manifest.json`

O manifesto registra SHA-256, quantidade de documentos e contagem por coleção.
Arquivos antigos não são substituídos nem removidos.

## Instalação

1. Criar um projeto Apps Script na conta proprietária dos backups.
2. Publicar `Code.gs` e `appsscript.json` com `clasp push`.
3. Executar `installAndTestBackup` uma vez e autorizar os escopos solicitados.
4. Conferir o primeiro `.json.gz` e o manifesto na pasta
   `Grupo Cassol - Backups Firestore`.

Projeto instalado: [Backup diário Firestore - Grupo Cassol](https://script.google.com/d/185l5p4ClRUgGh7RMyakt5pvq-raTXegkqH6tkfTvwGh0D4QFIO05wzkg/edit)

O gatilho diário é configurado para a janela entre 03:00 e 04:00 no horário
`America/Sao_Paulo`. O Apps Script não garante um minuto exato dentro da janela.

## Segurança

- Nenhuma senha, chave privada ou token é mantido no repositório.
- O acesso ao Firestore usa o token OAuth temporário da conta que executa o
  script.
- O backup falha se o banco vier vazio, se `dados/gc-conteudos` não contiver a
  lista esperada ou se o total de documentos cair mais de 20% desde o último
  backup bem-sucedido.
- A restauração não é automática; deve ser feita somente após conferência.

## Restauração

1. Escolha o arquivo `.json.gz` da data desejada e confira o SHA-256 no
   manifesto com o mesmo nome.
2. Descompacte o JSON e revise `projectId`, `generatedAt`, `summary` e
   `documents` antes de qualquer gravação.
3. Restaure primeiro em um projeto de teste. A restauração em produção deve
   ser deliberada e nunca é executada por este script de backup.
