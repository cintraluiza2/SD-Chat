const { consumer, initKafkaConsumer } = require("./kafka");
const db = require("./db");
const startMetricsServer = require("./metrics");
startMetricsServer();


async function startWorker() {
  await initKafkaConsumer();

  console.log("[WORKER] Listening for messages...");

  await consumer.run({
    eachMessage: async ({ message }) => {
      const msg = JSON.parse(message.value.toString());

      console.log("[WORKER] Received:", msg);

      // 1. persistir no banco
      const insert = await db.query(
        `INSERT INTO messages (conversation_id, sender_username, content, type, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, created_at`,
        [msg.conversation_id, msg.sender_username, msg.content, msg.type, "SENT"]
      );

      msg.id = insert.rows[0].id;
      msg.created_at = insert.rows[0].created_at;
      msg.status = "DELIVERED";

      // 2. atualizar status
      await db.query(
        "UPDATE messages SET status = $1 WHERE id = $2",
        ["DELIVERED", msg.id]
      );

      console.log("[WORKER] Delivered:", msg);

      // 3. Envia o evento para a API (*** ESSENCIAL ***)
      // O backend espera: message_id, recipient_username, status, e todos os dados da mensagem
      // Para chat privado, recipient_username é o outro participante
      // Para grupo, pode ser necessário enviar para todos (ajuste conforme sua lógica)
      // Aqui, vamos enviar para todos os participantes exceto o remetente
      const participantsRes = await db.query(
        'SELECT username FROM conversation_participants WHERE conversation_id = $1',
        [msg.conversation_id]
      );
      const recipients = participantsRes.rows
        .map(r => r.username)
        .filter(u => u !== msg.sender_username);

      for (const recipient_username of recipients) {
        const payload = {
          message_id: msg.id,
          recipient_username,
          status: msg.status,
          ...msg
        };
        console.log('[WORKER] Enviando para API:', payload);
        await fetch("http://chat-api:3000/api/v1/events/message-delivered", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      }

      // Removido o uso de messageLatency e messagesProcessed para evitar crash


    },
  });
}

startWorker();
