// Novo endpoint para marcar mensagens pendentes como entregues
// POST /api/v1/pending-messages/mark-delivered
// Recebe: { messageIds: [id1, id2, ...] }
// Para cada id, chama o gRPC para marcar como entregue

const express = require('express');
const { messageDeliveredGrpc } = require('./grpc-event-client');
const router = express.Router();

router.post('/v1/pending-messages/mark-delivered', async (req, res) => {
  const { messageIds } = req.body;
  const username = req.user?.username || req.body.username; // fallback para testes
  if (!Array.isArray(messageIds) || messageIds.length === 0) {
    return res.status(400).json({ error: 'messageIds array required' });
  }
  try {
    // Chama o gRPC para cada mensagem
    const results = await Promise.all(messageIds.map(id =>
      messageDeliveredGrpc(id, username, 'DELIVERED')
    ));
    // Se algum falhar, retorna erro
    if (results.some(r => !r.ok)) {
      return res.status(500).json({ error: 'Failed to mark some messages as delivered' });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao marcar mensagens como entregues:', err);
    return res.status(500).json({ error: 'Failed to mark messages as delivered' });
  }
});

module.exports = router;
