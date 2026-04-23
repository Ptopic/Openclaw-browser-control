FROM node:20-slim

WORKDIR /app

# Install system dependencies for Chromium + puppeteer
RUN apt-get update -qqy \
    && DEBIAN_FRONTEND=noninteractive apt-get -qqy install \
        apt-transport-https \
        inotify-tools \
        gnupg \
        libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 \
        libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 \
        libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 \
        libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 \
        libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 \
        libxdamage1 libxss1 libxtst6 libappindicator1 \
        libnss3 libnss3-tools libasound2 libatk1.0-0 libc6 \
        ca-certificates fonts-liberation libatk-bridge2.0-0 libgbm1 \
        lsb-release xdg-utils wget unzip curl \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/*

# Copy package files
COPY package*.json ./

# Install Node deps (puppeteer downloads Chromium during npm install)
RUN npm install

# Copy application files
COPY index.js entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Expose CDP port
EXPOSE 9222

ENTRYPOINT ["/app/entrypoint.sh"]
