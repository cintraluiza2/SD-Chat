const express = require("express");
const axios = require("axios");
const { Kafka } = require("kafkajs");

const app = express();
app.use(express.json());

const CALLBACK_URL = process.env.CALLBACK_URL;
const KAFKA_BROKER = process.env.KAFKA_BROKER || "kafka:9092";

const kafka = new Kafka({
  clientId: "connector-instagram",
  brokers: [KAFKA_BROKER]
});

const consumer = kafka.consumer({ groupId: "instagram-mock-group" });

async function start() {
  await consumer.connect();
  await consumer.subscribe({ topic: "instagram_outbound" });

  console.log("[Instagram] Connector iniciado.");

  await consumer.run({
    eachMessage: async ({ message }) => {
      const msg = JSON.parse(message.value.toString());

      console.log(`[Instagram] Enviando DM para ${msg.to}: ${msg.content}`);
      await new Promise(r => setTimeout(r, 700));

      console.log(`[Instagram] ❤️ Entregue para ${msg.to}`);

      await axios.post(CALLBACK_URL, {
        messageId: msg.id,
        status: "DELIVERED",
        channel: "instagram"
      });
    }
  });
}

app.post("/instagram/inbound", async (req, res) => {
  console.log("[Instagram] Mensagem recebida simulada:", req.body);
  res.json({ ok: true });
});

app.listen(4002, () => console.log("Instagram mock rodando na porta 4002"));
start();
