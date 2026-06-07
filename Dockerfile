# --- Stage 1: Build dell'applicazione ---
FROM node:20-alpine AS builder

# Installa pnpm globalmente
RUN npm install -g pnpm

WORKDIR /app

# Copia i file di configurazione delle dipendenze
COPY package.json pnpm-lock.yaml* ./

# Installa le dipendenze del progetto
RUN pnpm install --frozen-lockfile

# Copia tutto il resto del codice sorgente
COPY . .

# Esegue la build statica (genera la cartella 'out')
RUN pnpm run build

# --- Stage 2: Server Web per i file statici ---
FROM nginx:alpine

# Copia i file statici generati dallo stage precedente dentro Nginx
COPY --from=builder /app/out /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]