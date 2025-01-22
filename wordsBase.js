import pkg from 'pg'; // Деструктурируем Client из этого пакета
import dotenv from 'dotenv';
// Импортируем весь пакет
const { Client } = pkg;

dotenv.config(); // Для чтения переменных окружения, например DATABASE_URL

// Инициализация подключения к PostgreSQL
const db = new Client({
  connectionString: process.env.DATABASE_URL,
});

db.connect()
  .then(() => {
    console.log('Успешное подключение к базе данных');
  })
  .catch((err) => {
    console.error('Ошибка подключения к базе данных', err);
  }); // Подключаемся к базе данных

const wordsBase = {
  // Создание таблицы, если она не существует
  async create() {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS words (
        message_id INTEGER PRIMARY KEY,
        word TEXT,
        sender_id INTEGER,
        sender_name TEXT,
        is_forwarded BOOLEAN,
        timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await db.query(createTableQuery); // Выполняем запрос на создание таблицы
  },

  // Сохранение нового слова в базе данных
  async saveWord(
    word,
    messageId,
    isForwarded,
    { id: senderId, name: senderName },
  ) {
    const query = `
      INSERT INTO words (message_id, word, sender_id, sender_name, is_forwarded) 
      VALUES ($1, $2, $3, $4, $5)
    `;
    const values = [messageId, word, senderId, senderName, isForwarded];

    try {
      await db.query(query, values); // Выполняем вставку данных
    } catch (error) {
      console.error('Ошибка при сохранении слова:', error);
      throw error; // Если произошла ошибка, выбрасываем исключение
    }
  },

  // Получение данных по слову
  async getData(word) {
    const query = 'SELECT * FROM words WHERE word = $1';
    try {
      const res = await db.query(query, [word]); // Выполняем запрос
      return res.rows; // Возвращаем результат (массив строк)
    } catch (error) {
      console.error('Ошибка при получении данных:', error);
      throw error;
    }
  },

  // Проверка, было ли слово переслано пользователем
  async checkForwarded(word, senderId) {
    const query = `
      SELECT * FROM words 
      WHERE word = $1 AND sender_id = $2 AND is_forwarded = true
    `;
    try {
      const res = await db.query(query, [word, senderId]); // Выполняем запрос
      return res.rows.length > 0; // Если запись найдена, возвращаем true
    } catch (error) {
      console.error('Ошибка при проверке пересланного слова:', error);
      throw error;
    }
  },
};

export default wordsBase;
