// Inicia todos os serviços do worker: worker principal, gRPC padrão e gRPC de usuário
const { spawn } = require('child_process');

function startProcess(cmd, args, name) {
  const proc = spawn(cmd, args, { stdio: 'inherit' });
  proc.on('close', code => {
    console.log(`[start-all] Processo ${name} finalizado com código ${code}`);
  });
}

startProcess('node', ['src/worker.js'], 'worker');
startProcess('node', ['src/grpc-server.js'], 'grpc-server');
startProcess('node', ['src/grpc-user-server.js'], 'grpc-user-server');
