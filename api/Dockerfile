FROM node:18

WORKDIR /app

COPY package.json .
RUN npm install

COPY src ./src

RUN mkdir -p proto
COPY proto/auth.proto ./proto/auth.proto
COPY proto/chat.proto ./proto/chat.proto
COPY proto/user.proto ./proto/user.proto
COPY proto/presence.proto ./proto/presence.proto
COPY proto/event.proto ./proto/event.proto
COPY proto/conversation.proto ./proto/conversation.proto

EXPOSE 3000
EXPOSE 50052
EXPOSE 50053
EXPOSE 50054
EXPOSE 50055

CMD ["node", "src/start-all.js"]
