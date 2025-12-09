FROM node:18

WORKDIR /app

COPY package.json .
RUN npm install

COPY src ./src


# Copia todos os protos necessários do projeto principal
RUN mkdir -p proto
COPY proto/*.proto ./proto/

EXPOSE 50051

CMD ["node", "src/start-all.js"]
