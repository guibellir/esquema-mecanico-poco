# Build context = raiz do repositório (padrão no EasyPanel)
FROM node:20-alpine

WORKDIR /app

COPY api/package.json api/package-lock.json* ./
RUN npm install --omit=dev

COPY api/src ./src

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
