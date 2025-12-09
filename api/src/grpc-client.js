const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.resolve(__dirname, '../proto/chat.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const chatProto = grpc.loadPackageDefinition(packageDefinition).chat;

const client = new chatProto.ChatService('worker:50051', grpc.credentials.createInsecure());

function sendMessageGrpc(user_id, message) {
  return new Promise((resolve, reject) => {
    client.sendMessage({ user_id, message }, (error, response) => {
      if (error) return reject(error);
      resolve(response);
    });
  });
}

module.exports = { sendMessageGrpc };
