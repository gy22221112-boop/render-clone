# Используем официальный образ Node.js
FROM node:18-alpine

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install --production

# Копируем остальной код
COPY . .

# Создаем папку для временных файлов
RUN mkdir -p /tmp/render-deployments

# Открываем порт
EXPOSE 3000

# Запускаем приложение
CMD ["node", "server.js"]
