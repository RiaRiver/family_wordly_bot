/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
import {
  ALLOWED_USERS,
  bot,
  CHECK_MODE_USERS,
  FAMILY_CHAT_ID, FORCE_MODE_USERS, MESSAGE_URL_BASE, replyMessages, URL_BASE,
} from './constans.js';
import {
  getSender, parseForwardedWord, parseLine,
} from './utils.js';
import wordsBase from './wordsBase.js';

// eslint-disable-next-line consistent-return
export const checkDuplicates = async (word) => {
  try {
    const rows = await wordsBase.getData(word); // Ждем результат
    return rows.length ? rows : null;
  } catch (error) {
    console.error('Ошибка проверки слова:', error);
  }
};

const reportDuplicate = async (ctx, duplicates) => {
  const sender = getSender(ctx);
  const senderDuplicates = duplicates.filter(
    (obj) => obj.sender_id === sender.id,
  );
  const othersDuplicates = duplicates.filter(
    (obj) => obj.sender_id !== sender.id,
  );

  const { word } = duplicates[0];
  const messages = [];

  if (senderDuplicates.length) {
    const senderDuplicatesDates = senderDuplicates.map(
      (obj) => `${new Date(obj.timestamp).toLocaleString('ru-RU', {
        timeZone: 'Europe/Moscow',
      })}
<a href="${MESSAGE_URL_BASE}${obj.message_id}">Перейти к сообщению</a>`,
    );
    messages.push(`❗️"<b>${word}</b>" Вы уже отправляли: 
${senderDuplicatesDates.join('\n')}
    `);
  }

  if (othersDuplicates.length) {
    const othersDuplicatesNames = [
      ...new Set(othersDuplicates.map((obj) => obj.sender_name)),
    ];

    messages.push(`❗️"<b>${word}</b>" Другие уже отправляли: 
${othersDuplicatesNames.join('\n')}`);
  }

  await ctx.reply(messages.join('\n'), {
    parse_mode: 'HTML',
  });
};

export const checkSpelling = async (word) => {
  const url = `https://speller.yandex.net/services/spellservice.json/checkText?text=${encodeURIComponent(
    word,
  )}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.length === 0) {
      return { exist: true };
    }

    // Проверяем каждое предложение повторно
    const filteredSuggestions = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const suggestion of data[0].s) {
      const checkUrl = `https://speller.yandex.net/services/spellservice.json/checkText?text=${encodeURIComponent(
        suggestion,
      )}`;
      const suggestionResponse = await fetch(checkUrl);
      const suggestionData = await suggestionResponse.json();

      // Если слово корректное (API вернул пустой массив), добавляем его
      if (suggestionData.length === 0) {
        filteredSuggestions.push(suggestion);
      }
    }

    return { exist: false, suggestions: filteredSuggestions };
  } catch (error) {
    console.error('Ошибка при запросе:', error);
    return { error: '❌ Не смог проверить в Яндекс Спеллер!' };
  }
};

const checkWiki = async (word) => {
  const wordVariants = [
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(), // С заглавной
    word.toLowerCase(), // С маленькой
  ];

  // eslint-disable-next-line no-restricted-syntax
  for (const formattedWord of wordVariants) {
    const url = `https://ru.wiktionary.org/w/api.php?action=query&format=json&prop=extracts&titles=${encodeURIComponent(
      formattedWord,
    )}&formatversion=2&explaintext=1`;

    try {
      const response = await fetch(url);

      const data = await response.json();

      const page = data.query?.pages[0];

      if (page && !page.missing) {
        const fullExtract = page.extract || null;

        if (fullExtract) {
          const valueMatch = fullExtract.match(
            /==== Значение ====\n([\s\S]*?)(\n====|\n===|$)/,
          );

          if (valueMatch) {
            const definitions = valueMatch[1]
              .split('\n')
              .map((line) => line.replace(/◆.*/, '').trim());
            return { exist: true, definitions };
          }
        }
      }
    } catch (error) {
      console.error('Ошибка при запросе:', error);
      return { error: '❌ Не смог проверить в Викисловаре!' };
    }
  }

  return { exist: false };
};

const sendWord = async (
  ctx,
  { id: senderId, name: senderName },
  { word, encoded, comment },
  isForwarded = false,
) => {
  const { emoj } = ALLOWED_USERS[senderId];

  const message = `
  ${emoj} <b>#${senderName}</b> загадал <a href="${URL_BASE}${encoded}">слово</a>: 
  ${isForwarded
    ? `
Оригинальное сообщение ${new Date(
    ctx.message.forward_date * 1000,
  ).toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
  })}
    `
    : ''
}
  
<tg-spoiler><a href="https://www.google.com/search?q=define%3A+${word}">${word}</a></tg-spoiler>
<code>${comment || ''}</code>

<a href="${URL_BASE}${encoded}">Играть</a>
  `;

  let messageId = null;

  try {
    const sendedMessage = await bot.telegram.sendMessage(
      FAMILY_CHAT_ID,
      message,
      {
        parse_mode: 'HTML',
      },
    );

    messageId = sendedMessage.message_id; // Сохраняем ID отправленного сообщения
  } catch (error) {
    console.error('Ошибка при отправке сообщения в Telegram:', error);
    ctx.reply(replyMessages.error_send);
    throw error;
  }

  try {
    // Сохраняем слово в базу данных
    await wordsBase.saveWord(word, messageId, isForwarded, {
      id: senderId,
      name: senderName,
    });
    return messageId;
  } catch (error) {
    // Ошибка записи в базу данных
    console.error('Ошибка при сохранении в базу:', error);
    // Удаляем сообщение, если не удалось сохранить в базу
    await bot.telegram.deleteMessage(FAMILY_CHAT_ID, messageId);
    ctx.reply(replyMessages.error_save);
    throw error;
  }
};

const checkWord = async (ctx, wordObj, isCheckMode) => {
  const { word } = wordObj;

  const duplicates = await checkDuplicates(wordObj.word);

  // Есть дубликат, в не зависимости режим ли проверки отправлячем сообщение о дубле.
  if (duplicates) {
    await reportDuplicate(ctx, duplicates);
    return;
  }

  if (isCheckMode) {
    const replyNoDuplicates = `
      ✅ "<b>${wordObj.word}</b>" раньше не отправлялось.
    `;

    await ctx.reply(replyNoDuplicates, {
      parse_mode: 'HTML',
    });
    return;
  }

  const checkedWiki = await checkWiki(word);

  if (checkedWiki.exist) {
    return true;
  } if (checkedWiki.error) {
    await ctx.reply(checkedWiki.error, {
      parse_mode: 'HTML',
    });
  } else {
    const { suggestions } = await checkSpelling(word);

    const checkMessage = `❗️"<b>${word}</b>" нет в Викисловаре.
${suggestions ? `Возможнеые варианты: ${suggestions.join(', ')}` : ''}`;

    await ctx.reply(checkMessage, {
      parse_mode: 'HTML',
    });
  }
};

export const handleMessage = async (ctx) => {
  const sender = getSender(ctx);
  const isForceMode = FORCE_MODE_USERS.has(sender.id);
  const isCheckMode = CHECK_MODE_USERS.has(sender.id);

  const wordObjs = ctx.message.text
    .split('\n')
    .map((line) => parseLine(line))
    .filter((lineObj) => lineObj.word);

  const runSending = async (wordObj) => {
    let messageId;
    try {
      // Если дубликата нет, отправляем слово
      messageId = await sendWord(ctx, sender, wordObj);
    } catch (error) {
      return;
    }

    // Успешно, отправляем подтверждение пользователю
    const replySentSuccess = `
    "<b>${wordObj.word}</b>" отправлено в чат
<a href="${MESSAGE_URL_BASE}${messageId}">Перейти к сообщению</a>
  `;

    await ctx.reply(replySentSuccess, {
      parse_mode: 'HTML',
    });
  };

  if (isForceMode) {
    await runSending(wordObjs[0]);
    FORCE_MODE_USERS.delete(sender.id);
    return;
  }

  // eslint-disable-next-line no-restricted-syntax
  for (const wordObj of wordObjs) {
    const isCorrectWord = await checkWord(ctx, wordObj, isCheckMode);
    if (isCorrectWord) await runSending(wordObj);
  }

  if (isCheckMode) CHECK_MODE_USERS.delete(sender.id);
};

const handleForwarded = async (ctx, url) => {
  const sender = getSender(ctx);
  const {
    message: { text },
  } = ctx;

  const wordObj = parseForwardedWord(url, text);

  if (await wordsBase.checkForwarded(wordObj.word, sender.id)) {
    ctx.reply(replyMessages.reportForwarded, {
      reply_to_message_id: ctx.message.message_id,
    });
    return;
  }

  let messageId;
  try {
    messageId = await sendWord(ctx, sender, wordObj, true);
  } catch (error) {
    console.error('Ошибка при отправке слова:', error);
    return;
  }
  // Успешно, отправляем подтверждение пользователю
  const replyMessage = `Слово от <b>${sender.name}</b> отправлено в чат
<a href="${MESSAGE_URL_BASE}${messageId}">Перейти к сообщению</a>
    `;

  await ctx.reply(replyMessage, {
    parse_mode: 'HTML',
    reply_to_message_id: ctx.message.message_id,
  });
};

// Обработака очереди пересланных
export const messageQueue = [];
let isProcessingMessage = false;

export const processNextMessage = async () => {
  if (messageQueue.length === 0 || isProcessingMessage) {
    return;
  }

  const { ctx, url } = messageQueue.shift();
  isProcessingMessage = true;

  if (url) { await handleForwarded(ctx, url); } else await handleMessage(ctx);
  isProcessingMessage = false;
  // Для следующего сообщения вызываем обработку
  setImmediate(processNextMessage);
};
