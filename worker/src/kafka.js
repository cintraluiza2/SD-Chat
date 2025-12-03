const { Kafka } = require("kafkajs");
const EventEmitter = require("events");

const kafkaEmitter = new EventEmitter(); // usado para WS

const kafka = new Kafka({
  clientId: "chat-worker",
  brokers: [process.env.KAFKA_BROKER || "kafka:9092"],
});

const consumer = kafka.consumer({ groupId: "router-worker-group" });

async function initKafkaConsumer() {
  await consumer.connect();
  console.log("[WORKER] Kafka consumer connected");

  await consumer.subscribe({
    topic: "messages",
    fromBeginning: false,
  });

  return consumer;
}

module.exports = {
  kafka,
  consumer,
  initKafkaConsumer,
  kafkaEmitter,
};
