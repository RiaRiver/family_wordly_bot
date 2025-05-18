# Используем официальный образ Node.js
FROM node:20

# Создаём рабочую папку в контейнере
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем остальной код
COPY . .

# Команда, которую контейнер выполнит при запуске
CMD ["npm", "start"]
