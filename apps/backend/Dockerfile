FROM node:24-slim

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first (for better caching)
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy the rest of the application source code
COPY . .

# Build the app including Prisma generate
RUN npm run build

EXPOSE 3000
RUN mkdir -p /app/uploads
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npm run start:prod"]
