const express = require('express');
const db = require('./db');
const { sendMessageToKafka } = require('./kafka');
const { generateToken, authMiddleware } = require('./auth');
const { hashPassword, comparePassword } = require('./password');

const router = express.Router();
// Cadastro de usuário (register)
router.post('/v1/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  try {
    // Garante username único
    const userExists = await db.query('SELECT id FROM users WHERE username = $1', [username]);
    if (userExists.rows.length > 0) {
      return res.status(409).json({ error: 'username already exists' });
    }
    const password_hash = await hashPassword(password);
    const result = await db.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username, password_hash]
    );
    return res.status(201).json({ id: result.rows[0].id, username });
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
    const user = await db.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username]);
    if (user.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const valid = await comparePassword(password, user.rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    // Gera JWT com user_id e username
    const token = generateToken({ user_id: user.rows[0].id, username: user.rows[0].username });
    return res.json({ token });
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
router.get('/v1/users/:username/conversations', authMiddleware, async (req, res) => {
  const username = req.params.username;
  try {
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
    return res.status(500).json({ error: 'Failed to fetch conversations' });
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
      // Busca conversa privada existente entre os dois usuários
      const check = await db.query(
        `SELECT c.id FROM conversations c
          JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.username = $1
          JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.username = $2
         WHERE c.type = 'private'
         GROUP BY c.id
         HAVING COUNT(*) = 2`,
        [participants[0], participants[1]]
      );
      if (check.rows.length > 0) {
        // Já existe, retorna o id existente
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
    sender_username: req.user.username,
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
    await sendMessageToKafka(msg);
    // a persistência e mudança de status será responsabilidade do worker
    return res.status(202).json({ status: 'queued', message: msg });
  } catch (err) {
    console.error('Error sending to Kafka', err);
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

router.post("/v1/events/message-delivered", (req, res) => {
  const msg = req.body;

  console.log("Evento recebido do Worker:", msg);

  const { kafkaEmitter } = require("./kafka");
  kafkaEmitter.emit("message_delivered", msg);

  return res.json({ ok: true });
});


module.exports = router;
