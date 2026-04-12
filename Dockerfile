# Combined browser + handoff service in one container
FROM node:22-bookworm-slim

# Install Chromium and dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    supervisor \
    wget \
    curl \
    dbus \
    xvfb \
    fonts-liberation \
    fonts-noto-color-emoji \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy handoff service
COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src
COPY public ./public

# Create supervisord config
RUN mkdir -p /var/log/supervisor
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Expose ports
EXPOSE 80 9222

# Start supervisord
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]