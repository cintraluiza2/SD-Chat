const { Kafka } = require("kafkajs");
const EventEmitter = require("events");

const kafkaEmitter = new EventEmitter();

const kafka = new Kafka({
  clientId: "chat-api",
  brokers: [process.env.KAFKA_BROKER || "kafka:9092"],
});

const producer = kafka.producer();

async function initKafka() {
  await producer.connect();
  console.log("Kafka producer connected");
}

async function sendMessageToKafka(msg) {
  await producer.send({
    topic: "messages",
    messages: [{ value: JSON.stringify(msg) }],
  });
}

module.exports = {
  initKafka,
  sendMessageToKafka,
  kafkaEmitter, 
};
