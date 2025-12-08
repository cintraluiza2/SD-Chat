const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.resolve(__dirname, '../proto/user.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const userProto = grpc.loadPackageDefinition(packageDefinition).user;

const client = new userProto.UserService('chat-api:50054', grpc.credentials.createInsecure());

function listUsersGrpc() {
  return new Promise((resolve, reject) => {
    client.ListUsers({}, (error, response) => {
      if (error) return reject(error);
      resolve(response);
    });
  });
}

function getPendingMessagesGrpc(username) {
  return new Promise((resolve, reject) => {
    client.GetPendingMessages({ username }, (error, response) => {
      if (error) return reject(error);
      resolve(response);
    });
  });
}

module.exports = { listUsersGrpc, getPendingMessagesGrpc };
