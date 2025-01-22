import { URL_BASE } from './constans.js';

// Парсинг сообщения
export const parseLine = (line) => {
  const [sourceWord, comment] = line.split('-').map((str) => str.trim());
  const [word] = sourceWord.toLowerCase().split(' ');
  const encoded = Buffer.from(word.replaceAll('ё', 'е')).toString('base64');

  return { word, comment, encoded };
};

export const findUrl = (text) => {
  const pattern = /https:\/\/wordle\.belousov\.one[^\s]*/;
  const match = text.match(pattern) || [];

  return match[0];
};

export const getUrlRegExp = (url) => {
  const escapedUrl = url.replace(/[.*+?^=!:${}()|[\]/\\]/g, '\\$&');
  return escapedUrl;
};

export const parseForwardedWord = (url, text) => {
  const encoded = url.replace(URL_BASE, '');
  const word = Buffer.from(encoded, 'base64').toString('utf-8');

  const DELETE_FROM_TEXT = [
    'Попробуйте отгадать загаданное слово за 6 попыток в игре #вордли',
    'Отгадайте слово на',
    '#вордли',
    'Вордли - . букв ./.',

    getUrlRegExp(url),
    word,

    '\u{1F7E9}', // 🟩 - Unicode код эмодзи
    '\u{2B1C}', // ⬜️ - Unicode код эмодзи
    '\u{1F7E8}', // 🟨 - Unicode код эмодзи
  ];

  const regex = new RegExp(DELETE_FROM_TEXT.join('|'), 'gi');
  const comment = text.replace(regex, '').trim();

  return { word, comment, encoded };
};

export const getSender = (ctx) => {
  const user = ctx.message.forward_from || ctx.from;
  return {
    id: user.id,
    name: user.username || `${user.first_name}_${user.last_name}`,
  };
};
