FROM node:22-alpine

WORKDIR /app

# Install only package.json first for caching
COPY package.json package-lock.json ./
RUN npm install

# Copy the rest of your React app
COPY . ./

# Expose React dev server port
EXPOSE 3000

# Start React
CMD ["npm", "start"]