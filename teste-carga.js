import http from "k6/http";
import { sleep } from "k6";

export let options = {
  vus: 50,           // 50 usuários simultâneos
  duration: "30s",   // teste dura 30s
};

const BASE = "http://localhost:3003/api";

export default function () {
  
  // 1. Login
  const loginRes = http.post(`${BASE}/v1/auth/login`, JSON.stringify({
    username: `user_${__VU}`
  }), {
    headers: { "Content-Type": "application/json" }
  });

  const token = JSON.parse(loginRes.body).token;

  // 2. Envio de mensagem
  const msgRes = http.post(`${BASE}/v1/messages`, JSON.stringify({
    conversationId: 1,
    type: "text",
    content: `Hello from user ${__VU}`
  }), {
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    }
  });

  sleep(1);
}
