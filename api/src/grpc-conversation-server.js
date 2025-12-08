const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.join(__dirname, '../proto/conversation.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const conversationProto = grpc.loadPackageDefinition(packageDefinition).conversation;

function getConversations(call, callback) {
  callback(null, { conversations: [] }); // Implementação simplificada
}

const server = new grpc.Server();
server.addService(conversationProto.ConversationService.service, { getConversations });
server.bindAsync('0.0.0.0:50056', grpc.ServerCredentials.createInsecure(), () => {
  console.log('Conversation gRPC server running on port 50056');
  server.start();
});
