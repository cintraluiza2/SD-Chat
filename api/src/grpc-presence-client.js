const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.resolve(__dirname, '../proto/presence.proto');

// Carregar o proto preservando snake_case
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,    // <- ESSENCIAL para manter "is_online"
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const presenceProto = grpc.loadPackageDefinition(packageDefinition).presence;

// Cliente GRPC apontando para o serviço
const client = new presenceProto.PresenceService(
  'chat-api:50053',
  grpc.credentials.createInsecure()
);

function updatePresenceGrpc(username, is_online) {
  return new Promise((resolve, reject) => {
    client.UpdatePresence(
      { username, is_online: Boolean(is_online) },
      (error, response) => {
        if (error) return reject(error);
        resolve(response);
      }
    );
  });
}

function beaconPresenceGrpc(token, is_online) {
  return new Promise((resolve, reject) => {
    client.BeaconPresence(
      { token, is_online: Boolean(is_online) },
      (error, response) => {
        if (error) return reject(error);
        resolve(response);
      }
    );
  });
}

module.exports = { updatePresenceGrpc, beaconPresenceGrpc };
