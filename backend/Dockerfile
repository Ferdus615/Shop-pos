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
# Only install dependencies needed to run (saves space and makes it faster).
# `-only=production` was not a flag npm recognises, so this was quietly
# installing the dev dependencies too.
RUN npm ci --omit=dev
# Copy the compiled Javascript code from Step 1
COPY --from=builder /app/dist ./dist

EXPOSE 5000

# Migrations run before the app serves traffic, from the compiled
# dist/data-source.js — the `migration:run` script used for development needs
# ts-node and src/, neither of which exists in this image. A failing migration
# fails the release rather than leaving the new code on an old schema.
CMD ["npm", "run", "release"]
