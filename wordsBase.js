import sqlite3 from "sqlite3"; // Импортируем sqlite3
import path from "path"; // Импортируем path для работы с путями

const wordsBase = {
  db: new sqlite3.Database(path.join(".", "words.db")),

  create() {
    // Создание таблицы, если не существует
    this.db.serialize(() => {
      this.db.run(`CREATE TABLE IF NOT EXISTS words (
      messageId INTEGER,
      word TEXT,
      senderId INTEGER,
      senderName TEXT,
      isForwarded INTEGER,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    });
  },

  saveWord(word, messageId, isForwarded, { id: senderId, name: senderName }) {
    return new Promise((resolve, reject) => {
      this.db.run(
        "INSERT INTO words (messageId, word, senderId, senderName, isForwarded) VALUES (?, ?, ?, ?, ?)",
        [messageId, word, senderId, senderName, isForwarded ? 1 : 0],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  },

  getData(word) {
    return new Promise((resolve, reject) => {
      this.db.all("SELECT * FROM words WHERE word = ?", [word], (err, rows) => {
        if (err) return reject(err);
        resolve(rows); // Возвращает объект row или null, если слово не найдено
      });
    });
  },

  checkForwarded(word, senderId) {
    return new Promise((resolve, reject) => {
      const query = `SELECT * FROM words WHERE word = ? AND senderId = ? AND isForwarded = 1`;

      this.db.get(query, [word, senderId], (err, row) => {
        if (err) {
          reject(err); // Возвращает ошибку, если она возникла
        } else {
          resolve(!!row); // Возвращает true, если запись найдена, иначе false
        }
      });
    });
  },
};

export default wordsBase;
