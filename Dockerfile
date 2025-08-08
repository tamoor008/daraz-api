FROM node:22-slim

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN npm install -g pm2

ENV PORT=3001
EXPOSE 3001

CMD ["pm2-runtime", "start", "index.js"]