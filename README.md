# SD-Chat

SD-Chat é um sistema de chat em tempo real com autenticação segura, backend Node.js/Express, frontend HTML/JS, banco PostgreSQL, mensageria Kafka e deploy via Docker.

## Visão Geral

- **Backend:** Node.js + Express + WebSocket + Kafka
- **Frontend:** HTML/JS (test.html)
- **Banco:** PostgreSQL (init-db.sql)
- **Mensageria:** Kafka/Zookeeper
- **Autenticação:** JWT, username único + senha (hash bcrypt)
- **Orquestração:** Docker Compose

---

## Como rodar o projeto

### Pré-requisitos

- Docker e Docker Compose instalados

### Passos

1. **Clone o repositório**
   ```sh
   git clone <URL-do-repositório>
   cd SD-Chat
   ```

2. **Suba os containers**
   ```sh
   docker compose up -d --build
   ```

3. **Acesse o frontend**
   - Abra o arquivo `test.html` no navegador.

4. **Cadastre um usuário**
   - Clique em “Cadastrar”, preencha username e senha.

5. **Faça login**
   - Use username e senha cadastrados.

6. **Use o chat normalmente**
   - Crie conversas, envie mensagens, veja participantes.

---

## Estrutura do Projeto

```
SD-Chat/
  api/           # Backend Express/Node.js
    src/
      routes.js
      db.js
      auth.js
      password.js
      websocket.js
      kafka.js
      server.js
    Dockerfile
    package.json
  worker/        # Worker para processar mensagens Kafka
    src/
      worker.js
      db.js
      kafka.js
    Dockerfile
    package.json
  test.html      # Frontend simples
  docker-compose.yml
  init-db.sql    # Script para criar o banco do zero (já inclui password_hash)
```

---

## Documentação dos Endpoints

### Autenticação

#### POST `/api/v1/auth/register`
Cadastra novo usuário.
- Body: `{ "username": "nome", "password": "senha" }`
- Resposta: `201 Created` `{ "id": 1, "username": "nome" }`

#### POST `/api/v1/auth/login`
Login seguro.
- Body: `{ "username": "nome", "password": "senha" }`
- Resposta: `200 OK` `{ "token": "<jwt>" }`

---

### Conversas

#### POST `/api/v1/conversations`
Cria nova conversa (privada ou grupo).
- Headers: `Authorization: Bearer <jwt>`
- Body: `{ "participants": ["user1", "user2"], "type": "private" | "group" }`
- Resposta: `{ "conversationId": 1 }`

#### GET `/api/v1/users/:username/conversations`
Lista conversas do usuário.
- Headers: `Authorization: Bearer <jwt>`
- Resposta: `{ "conversations": [ ... ] }`

#### GET `/api/v1/conversations/:id/participants`
Lista participantes da conversa.
- Headers: `Authorization: Bearer <jwt>`
- Resposta: `{ "participants": [ "user1", "user2" ] }`

---

### Mensagens

#### POST `/api/v1/messages`
Envia mensagem para uma conversa.
- Headers: `Authorization: Bearer <jwt>`
- Body: `{ "conversationId": 1, "content": "texto" }`
- Resposta: `{ "status": "queued", "message": { ... } }`

#### GET `/api/v1/conversations/:id/messages`
Lista mensagens de uma conversa.
- Headers: `Authorization: Bearer <jwt>`
- Resposta: `{ "conversationId": 1, "messages": [ ... ] }`

---

## WebSocket

- Conecte em: `ws://localhost:3003/?token=<jwt>`
- Recebe eventos de mensagem em tempo real.

---

## Arquitetura

- **API (api/):**  
  - Node.js/Express expõe endpoints REST e WebSocket.
  - Autenticação JWT, middleware de autorização.
  - Interage com PostgreSQL para persistência.
  - Produz mensagens para Kafka.

- **Worker (worker/):**  
  - Node.js processa mensagens Kafka.
  - Persiste mensagens no banco e emite eventos para API via WebSocket.

- **Banco de Dados:**  
  - PostgreSQL, script `init-db.sql` garante estrutura correta (inclui password_hash).

- **Mensageria:**  
  - Kafka e Zookeeper para entrega assíncrona e escalável de mensagens.

- **Frontend:**  
  - HTML/JS simples para login, cadastro, chat, criação/listagem de conversas.

- **Orquestração:**  
  - Docker Compose sobe todos os serviços integrados.

---

## Fluxo de Mensagens

1. **Envio da Mensagem (Frontend → API)**
   - O usuário, autenticado, digita uma mensagem no frontend e clica em “Enviar”.
   - O frontend faz um POST para `/api/v1/messages` com o JWT no header e os dados da mensagem (conversationId, content).

2. **API recebe e publica no Kafka**
   - O endpoint `/api/v1/messages` (no backend Express) recebe a requisição.
   - Ele valida o JWT, monta o objeto da mensagem e publica essa mensagem em um tópico do Kafka (não grava direto no banco!).
   - A resposta para o frontend é imediata: `{ status: "queued", message: ... }`.

3. **Worker consome do Kafka e grava no banco**
   - O serviço worker (Node.js) está sempre ouvindo o tópico do Kafka.
   - Quando uma nova mensagem chega, o worker:
     - Lê a mensagem do Kafka.
     - Grava a mensagem no banco de dados PostgreSQL (tabela messages).
     - Atualiza o status da mensagem para “DELIVERED” (ou outro, se desejar).
     - Emite um evento HTTP para a API (endpoint interno `/v1/events/message-delivered`) com os dados da mensagem persistida.

4. **API notifica via WebSocket**
   - Ao receber o evento `/v1/events/message-delivered`, a API:
     - Usa o WebSocket para notificar todos os participantes da conversa (exceto o remetente) que uma nova mensagem foi entregue.
     - O frontend dos destinatários recebe o evento em tempo real e exibe a mensagem.

5. **Frontend exibe a mensagem**
   - O frontend, conectado via WebSocket, recebe o evento de nova mensagem e exibe imediatamente no chat.

---

## Segurança

- Senhas nunca são armazenadas em texto puro (bcrypt).
- JWT usado para autenticação stateless.
- Username único obrigatório.
- Todas as rotas protegidas exigem JWT válido.

---
