const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.join(__dirname, '../proto/event.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const eventProto = grpc.loadPackageDefinition(packageDefinition).event;

function messageDelivered(call, callback) {
  const { message_id, recipient_username, status } = call.request;
  // Aqui você pode emitir eventos ou atualizar status conforme necessário
  callback(null, { ok: true });
}

function main() {
  const server = new grpc.Server();
  server.addService(eventProto.EventService.service, {
    MessageDelivered: messageDelivered,
  });
  server.bindAsync('0.0.0.0:50055', grpc.ServerCredentials.createInsecure(), () => {
    console.log('Event gRPC server running on port 50055');
    server.start();
  });
}

main();
