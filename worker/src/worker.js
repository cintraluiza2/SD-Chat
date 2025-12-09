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

      // Se a mensagem já tem ID e status DELIVERED (ex: arquivo), apenas notifica
      if (msg.id && msg.status === 'DELIVERED') {
        console.log("[WORKER] Message already delivered, just notifying:", msg.id);
        
        // Envia o evento para a API notificar WebSocket
        await fetch("http://chat-api:3000/api/v1/events/message-delivered", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(msg)
        });
        return;
      }

      // Mensagem nova (texto): persistir no banco
      const insert = await db.query(
        `INSERT INTO messages (conversation_id, sender_username, content, type, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, created_at`,
        [msg.conversation_id, msg.sender_username, msg.content, msg.type, "SENT"]
      );

      msg.id = insert.rows[0].id;
      msg.created_at = insert.rows[0].created_at;
      msg.status = "DELIVERED";

      // Atualizar status
      await db.query(
        "UPDATE messages SET status = $1 WHERE id = $2",
        ["DELIVERED", msg.id]
      );

      console.log("[WORKER] Delivered:", msg);

      // Envia o evento para a API (*** ESSENCIAL ***)
      await fetch("http://chat-api:3000/api/v1/events/message-delivered", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msg)
      });
    },
  });
}

startWorker();
