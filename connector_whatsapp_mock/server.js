const express = require("express");
const axios = require("axios");
const { Kafka } = require("kafkajs");

const app = express();
app.use(express.json());

const CALLBACK_URL = process.env.CALLBACK_URL;
const KAFKA_BROKER = process.env.KAFKA_BROKER || "kafka:9092";

const kafka = new Kafka({
  clientId: "connector-whatsapp",
  brokers: [KAFKA_BROKER]
});

const consumer = kafka.consumer({ groupId: "whatsapp-mock-group" });

async function start() {
  await consumer.connect();
  await consumer.subscribe({ topic: "whatsapp_outbound" });

  console.log("[WhatsApp] Connector iniciado.");

  await consumer.run({
    eachMessage: async ({ message }) => {
      const msg = JSON.parse(message.value.toString());

      console.log(`[WhatsApp] Enviando para ${msg.to}: ${msg.content}`);
      await new Promise(r => setTimeout(r, 500));

      console.log(`[WhatsApp] ✔ Entregue para ${msg.to}`);

      // envia callback de entrega para API
      await axios.post(CALLBACK_URL, {
        messageId: msg.id,
        status: "DELIVERED",
        channel: "whatsapp"
      });
    }
  });
}

// endpoint para receber mensagens simuladas (entrada)
app.post("/whatsapp/inbound", async (req, res) => {
  console.log("[WhatsApp] Mensagem recebida simulada:", req.body);
  
  // opcional: enviar inbound para kafka se quiser
  res.json({ ok: true });
});

app.listen(4001, () => console.log("WhatsApp mock rodando na porta 4001"));
start();
