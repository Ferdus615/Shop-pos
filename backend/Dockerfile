# Step 1: Tell Docker to use Node 20 as the engine to compile the code
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Step 2: Create a lightweight container to actually run the compiled code
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
# Only install dependencies needed to run (saves space and makes it faster)
RUN npm ci --only=production
# Copy the compiled Javascript code from Step 1
COPY --from=builder /app/dist ./dist

EXPOSE 3000
# CMD ["node", "dist/main"]
CMD ["npm", "run", "seed:prod"]
