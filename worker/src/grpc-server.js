
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.join(__dirname, '../proto/chat.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const chatProto = grpc.loadPackageDefinition(packageDefinition).chat;

function sendMessage(call, callback) {
  const { user_id, message } = call.request;
  // Aqui você pode processar a mensagem como já faz no worker
  console.log(`Mensagem recebida de ${user_id}: ${message}`);
  // Simulação de sucesso
  callback(null, { success: true, error: '' });
}

function main() {
  const server = new grpc.Server();
  server.addService(chatProto.ChatService.service, { sendMessage });
  server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), () => {
    console.log('gRPC server rodando na porta 50051');
    server.start();
  });
}

main();
