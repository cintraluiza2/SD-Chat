const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.resolve(__dirname, '../proto/auth.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH);
const authProto = grpc.loadPackageDefinition(packageDefinition).auth;

const client = new authProto.AuthService('chat-api:50052', grpc.credentials.createInsecure());

function registerGrpc(username, password) {
  return new Promise((resolve, reject) => {
    client.Register({ username, password }, (error, response) => {
      if (error) return reject(error);
      resolve(response);
    });
  });
}

function loginGrpc(username, password) {
  return new Promise((resolve, reject) => {
    client.Login({ username, password }, (error, response) => {
      if (error) return reject(error);
      resolve(response);
    });
  });
}

module.exports = { registerGrpc, loginGrpc };
