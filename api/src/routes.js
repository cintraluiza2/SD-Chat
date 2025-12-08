const express = require('express');
const db = require('./db');
const { sendMessageToKafka, kafkaEmitter } = require('./kafka');
const { generateToken, authMiddleware } = require('./auth');
const { hashPassword, comparePassword } = require('./password');
const { sendMessageGrpc } = require('./grpc-client');
const { registerGrpc, loginGrpc } = require('./grpc-auth-client');
const { updatePresenceGrpc, beaconPresenceGrpc } = require('./grpc-presence-client');
const { listUsersGrpc, getPendingMessagesGrpc } = require('./grpc-user-client');
const { messageDeliveredGrpc } = require('./grpc-event-client');

const router = express.Router();

// GET /api/v1/users/:username/conversations – lista todas as conversas do usuário
router.get('/v1/users/:username/conversations', authMiddleware, async (req, res) => {
  const username = req.params.username;
  try {
    // Busca conversas onde o usuário é participante
    const result = await db.query(
      `SELECT c.id, c.name, c.type, c.created_at
       FROM conversations c
       JOIN conversation_participants cp ON cp.conversation_id = c.id
       WHERE cp.username = $1
       ORDER BY c.created_at DESC`,
      [username]
    );
    return res.json({ conversations: result.rows });
  } catch (err) {
    console.error('Error fetching user conversations', err);
    return res.status(500).json({ error: 'Failed to fetch user conversations' });
  }
});
// Cadastro de usuário (register)
router.post('/v1/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  try {
    const result = await registerGrpc(username, password);
    if (result.error) {
      return res.status(409).json({ error: result.error });
    }
    return res.status(201).json({ id: result.id, username: result.username });
  } catch (err) {
    console.error('Error in register', err);
    return res.status(500).json({ error: 'Failed to register' });
  }
});

// Login seguro (username + senha)
router.post('/v1/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  try {
    const result = await loginGrpc(username, password);
    if (result.error) {
      return res.status(401).json({ error: result.error });
    }
    return res.json({ token: result.token });
  } catch (err) {
    console.error('Error in login', err);
    return res.status(500).json({ error: 'Failed to login' });
  }
});


// GET /api/v1/conversations/:id/participants – lista participantes da conversa
router.get('/v1/conversations/:id/participants', authMiddleware, async (req, res) => {
  const conversationId = req.params.id;
  try {
    const result = await db.query(
      'SELECT username FROM conversation_participants WHERE conversation_id = $1',
      [conversationId]
    );
    return res.json({ participants: result.rows.map(r => r.username) });
  } catch (err) {
    console.error('Error fetching participants', err);
    return res.status(500).json({ error: 'Failed to fetch participants' });
  }
});

// GET /api/v1/users/:username/conversations – lista todas as conversas do usuário
router.get('/v1/users', authMiddleware, async (req, res) => {
  try {
    const result = await listUsersGrpc();

    // Loga o valor bruto recebido do gRPC
    console.log('DEBUG result.users:', result.users);

    if (result.error) {
      return res.status(500).json({ error: result.error });
    }

    const users = result.users.map(u => ({
      username: u.username,
      is_online: !!(u.is_online ?? u.isOnline),
      last_seen: u.last_seen || null,
    }));

    return res.json({ users });

  } catch (err) {
    console.error('Error fetching users', err);
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
});


// POST /v1/conversations – cria uma nova conversa (privada ou grupo)
router.post('/v1/conversations', authMiddleware, async (req, res) => {
  const { participants, type } = req.body;
  if (!participants || !Array.isArray(participants) || participants.length < 2) {
    return res.status(400).json({ error: 'participants (min. 2) required' });
  }
  const convType = type === 'group' ? 'group' : 'private';
  try {
    // Regra: evitar conversa privada duplicada
    if (convType === 'private' && participants.length === 2) {
      const [userA, userB] = participants.sort();
      const check = await db.query(
        `SELECT c.id
         FROM conversations c
         JOIN conversation_participants cp1 ON cp1.conversation_id = c.id
         JOIN conversation_participants cp2 ON cp2.conversation_id = c.id
         WHERE c.type = 'private'
           AND cp1.username IN ($1, $2)
           AND cp2.username IN ($1, $2)
         GROUP BY c.id
         HAVING COUNT(DISTINCT cp1.username) = 2
         ORDER BY c.created_at ASC
         LIMIT 1`,
        [userA, userB]
      );
      if (check.rows.length > 0) {
        // Já existe, retorna o id existente (mais antiga)
        return res.status(200).json({ conversationId: check.rows[0].id });
      }
    }
    // Cria conversa normalmente
    const result = await db.query(
      'INSERT INTO conversations (type) VALUES ($1) RETURNING id',
      [convType]
    );
    const conversationId = result.rows[0].id;
    // Associa participantes
    for (const username of participants) {
      await db.query(
        'INSERT INTO conversation_participants (conversation_id, username) VALUES ($1, $2)',
        [conversationId, username]
      );
    }
    return res.status(201).json({ conversationId });
  } catch (err) {
    console.error('Error creating conversation', err);
    return res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// LOGIN SIMPLES (sem senha, apenas para gerar JWT para testes)


// POST /v1/messages – envia mensagem de texto
router.post('/v1/messages', authMiddleware, async (req, res) => {
  const { conversationId, content, type, file_id } = req.body;
  const senderUsername = req.user.username;

  if (!conversationId) {
    return res.status(400).json({ error: "conversationId is required" });
  }

  if ((type === "text" || !type) && !content) {
    return res.status(400).json({ error: "content is required for text messages" });
  }

  if (type === "file" && !file_id) {
    return res.status(400).json({ error: "file_id is required for file messages" });
  }

  const msg = {
    conversation_id: conversationId,
    sender_username: senderUsername,
    content,
    type: type || 'text',
    status: 'SENT',
    timestamp: new Date().toISOString(),
  };

  if (msg.type === "file") {
    msg.file_id = file_id;
    msg.content = null;
  } else {
    msg.content = content;
  }

  try {
    // Chama o serviço gRPC para processar a mensagem
    const grpcResponse = await sendMessageGrpc(senderUsername, content);
    if (!grpcResponse.success) {
      return res.status(500).json({ error: grpcResponse.error || 'Failed to process message via gRPC' });
    }
    // Mantém lógica original para persistência e pendências
    await sendMessageToKafka(msg);
    const participantsResult = await db.query(
      'SELECT username FROM conversation_participants WHERE conversation_id = $1',
      [conversationId]
    );
    const participants = participantsResult.rows.map(r => r.username);
    for (const participant of participants) {
      if (participant === senderUsername) continue;
      const presenceResult = await db.query(
        'SELECT is_online FROM user_presence WHERE username = $1',
        [participant]
      );
      const isOnline = presenceResult.rows.length > 0 && presenceResult.rows[0].is_online;
      if (!isOnline) {
        await db.query(
          `INSERT INTO pending_messages (recipient_username, sender_username, conversation_id, content, delivered)
           VALUES ($1, $2, $3, $4, false)`,
          [participant, senderUsername, conversationId, content]
        );
        console.log(`Mensagem salva como pendente para ${participant}`);
      }
    }
    return res.status(202).json({ status: 'queued', message: msg });
  } catch (err) {
    console.error('Error sending to gRPC/Kafka', err);
    return res.status(500).json({ error: 'Failed to queue message' });
  }
});

// GET /v1/conversations/:id/messages – lista mensagens já persistidas
router.get('/v1/conversations/:id/messages', authMiddleware, async (req, res) => {
  const conversationId = req.params.id;

  try {
    const result = await db.query(
      `SELECT id, conversation_id, sender_username, content, type, status, created_at, updated_at
       FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId]
    );

    return res.json({ conversationId, messages: result.rows });
  } catch (err) {
    console.error('Error fetching messages', err);
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
});



// POST /api/v1/presence – atualiza status de presença do usuário
router.post('/v1/presence', authMiddleware, async (req, res) => {
  const { is_online } = req.body;
  const userUsername = req.user.username;
  console.log('Rota /v1/presence:', { userUsername, is_online });
  try {
    const result = await updatePresenceGrpc(userUsername, is_online);
    if (!result.ok) {
      return res.status(500).json({ error: result.error || 'Failed to update presence' });
    }
    return res.json({ ok: true, status: result.status });
  } catch (err) {
    console.error('Error updating presence', err);
    return res.status(500).json({ error: 'Failed to update presence' });
  }
});

// POST /v1/presence-beacon – endpoint alternativo para navigator.sendBeacon (sem auth headers)
router.post('/v1/presence-beacon', async (req, res) => {
  try {
    const token = req.body.token || req.headers['authorization']?.replace('Bearer ', '');
    const is_online = req.body.is_online === 'true' || req.body.is_online === true;
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const result = await beaconPresenceGrpc(token, is_online);
    if (!result.ok) {
      return res.status(400).json({ error: result.error || 'Failed to update presence' });
    }
    return res.json({ ok: true, status: result.status });
  } catch (err) {
    console.error('Error in beacon presence', err);
    return res.status(500).json({ error: 'Failed to update presence' });
  }
});

// GET /v1/pending-messages – recupera mensagens pendentes do usuário logado
router.get('/v1/pending-messages', authMiddleware, async (req, res) => {
  const username = req.user.username;
  try {
    const result = await getPendingMessagesGrpc(username);
    if (result.error) {
      return res.status(500).json({ error: result.error });
    }
    return res.json({ pendingMessages: result.pendingMessages });
  } catch (err) {
    console.error('Error fetching pending messages', err);
    return res.status(500).json({ error: 'Failed to fetch pending messages' });
  }
});

// POST /v1/events/message-delivered
router.post("/v1/events/message-delivered", async (req, res) => {
  console.log('[API] Recebido em /v1/events/message-delivered:', req.body);
  const msg = req.body;
  try {
    // Emite evento para o WebSocket
    kafkaEmitter.emit('message_delivered', msg);
    const result = await messageDeliveredGrpc(msg.message_id, msg.recipient_username, msg.status);
    if (!result.ok) {
      return res.status(500).json({ error: result.error || 'Failed to process event' });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('Error processing event', err);
    return res.status(500).json({ error: 'Failed to process event' });
  }
});



module.exports = router;
