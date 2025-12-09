const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.resolve(__dirname, '../proto/event.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const eventProto = grpc.loadPackageDefinition(packageDefinition).event;

const client = new eventProto.EventService('chat-api:50055', grpc.credentials.createInsecure());

function messageDeliveredGrpc(message_id, recipient_username, status) {
  return new Promise((resolve, reject) => {
    client.MessageDelivered({ message_id, recipient_username, status }, (error, response) => {
      if (error) return reject(error);
      resolve(response);
    });
  });
}


module.exports = { messageDeliveredGrpc };
