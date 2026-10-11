FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 libatspi2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY server/package.json server/package-lock.json ./server/
COPY client/package.json client/package-lock.json ./client/

RUN npm install && npm ci --prefix server && npm ci --prefix client
RUN npx playwright install chromium --prefix server

COPY . .
RUN npm run build

ENV PORT=3847
ENV SPECTRA_LOG_LEVEL=info
EXPOSE 3847

CMD ["npm", "run", "start", "--prefix", "server"]