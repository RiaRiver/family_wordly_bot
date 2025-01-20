import { Telegraf } from "telegraf";
import dotenv from "dotenv";
import wordsBase from "./wordsBase.js";

dotenv.config();
const allowedUsers = {
  50249573: { name: "Лера", emoj: "🟩" },
  38036332: { name: "Дима", emoj: "🟨" },
  84321375: { name: "Мама", emoj: "🟪" },
};

const { BOT_TOKEN, FAMILY_CHAT_ID } = process.env;

const bot = new Telegraf(BOT_TOKEN);
const URL_BASE = "https://wordle.belousov.one/word/?id=ru_";
const MESSAGE_URL_BASE = `https://t.me/c/${FAMILY_CHAT_ID.slice(4)}/`;

const forwardedQueue = [];
let isProcessingForwarded = false;

const processNextForwarded = async () => {
  if (forwardedQueue.length === 0 || isProcessingForwarded) {
    return;
  }

  const { ctx, url } = forwardedQueue.shift();
  isProcessingForwarded = true;

  await handleForwarded(ctx, url);

  isProcessingForwarded = false;
  // Для следующего сообщения вызываем обработку
  setImmediate(processNextForwarded);
};

wordsBase.create();
const forceModeUsers = new Set(); // Set для хранения пользователей в режиме force

bot.telegram.setMyCommands([
  {
    command: "start",
    description: "Приветственное сообщение",
  },
  {
    command: "help",
    description: "Помощь",
  },
  {
    command: "force",
    description: "Режим принудительной отправки для следующего слова",
  },
  {
    command: "normal",
    description: "Обычный режим",
  },
]);

const parseLine = (line) => {
  const [sourceWord, comment] = line.split("-").map((str) => str.trim());
  const [word] = sourceWord.toLowerCase().replaceAll("ё", "е").split(" ");
  const encoded = Buffer.from(word).toString("base64");

  return { word, comment, encoded };
};

const getUrlRegExp = (url) => {
  const escapedUrl = url.replace(/[.*+?^=!:${}()|\[\]\/\\]/g, "\\$&");
  return `${escapedUrl}(={0,2})`;
};

const parseWord = (url, text) => {
  const encoded = url.replace(URL_BASE, "");
  const word = Buffer.from(encoded, "base64").toString("utf-8");

  const DELETE_FROM_TEXT = [
    "Попробуйте отгадать загаданное слово за 6 попыток в игре #вордли",
    "Отгадайте слово на",
    "#вордли",
    "Вордли - . букв ./.",

    getUrlRegExp(url),
    word,

    "\u{1F7E9}", // 🟩 - Unicode код эмодзи
    "\u{2B1C}", // ⬜️ - Unicode код эмодзи
    "\u{1F7E8}", // 🟨 - Unicode код эмодзи
  ];

  const regex = new RegExp(DELETE_FROM_TEXT.join("|"), "gi");
  const comment = text.replace(regex, "").trim();

  return { word, comment, encoded };
};

const getSender = (ctx) => {
  const user = ctx.message.forward_from || ctx.from;
  return {
    id: user.id,
    name: user.username || `${user.first_name}_${user.last_name}`,
  };
};

const findUrl = (text) => {
  const pattern = /https:\/\/wordle\.belousov\.one[^\s]*/;
  const match = text.match(pattern) || [];

  return match[0];
};

const checkWord = async (word) => {
  try {
    const rows = await wordsBase.getData(word); // Ждем результат
    return rows.length ? rows : null;
  } catch (error) {
    console.error("Ошибка проверки слова:", error);
  }
};

const reportDuplicate = async (ctx, duplicates) => {
  const sender = getSender(ctx);
  const senderDuplicates = duplicates.filter(
    (obj) => obj.sender_id === sender.id
  );
  const othersDuplicates = duplicates.filter(
    (obj) => obj.sender_id !== sender.id
  );

  const { word } = duplicates[0];
  const messages = [];

  if (senderDuplicates.length) {
    const senderDuplicatesDates = senderDuplicates.map(
      (obj) =>
        new Date(obj.timestamp).toLocaleString("ru-RU", {
          timeZone: "Europe/Moscow",
        }) +
        `
<a href="${MESSAGE_URL_BASE}${obj.message_id}">Перейти к сообщению</a>`
    );
    messages.push(`❗️"<b>${word}</b>" Вы уже отправляли: 
${senderDuplicatesDates.join("\n")}
    `);
  }

  if (othersDuplicates.length) {
    const othersDuplicatesNames = [
      ...new Set(othersDuplicates.map((obj) => obj.sender_name)),
    ];

    messages.push(`❗️"<b>${word}</b>" Другие уже отправляли: 
${othersDuplicatesNames.join("\n")}`);
  }

  await ctx.reply(messages.join("\n"), {
    parse_mode: "HTML",
  });
};

const sendWord = async (
  ctx,
  { id: senderId, name: senderName },
  { word, encoded, comment },
  isForwarded = false
) => {
  const { emoj } = allowedUsers[senderId];

  const message = `
  ${emoj} <b>#${senderName}</b> загадал <a href="${URL_BASE}${encoded}">слово</a>: 
  ${
    isForwarded
      ? `
Оригинальное сообщение ${new Date(
          ctx.message.forward_date * 1000
        ).toLocaleString("ru-RU", {
          timeZone: "Europe/Moscow",
        })}
    `
      : ""
  }
  
<tg-spoiler>${word}</tg-spoiler>
<code>${comment || ""}</code>

<a href="${URL_BASE}${encoded}">Играть</a>
  `;

  let messageId = null;

  try {
    const sendedMessage = await bot.telegram.sendMessage(
      FAMILY_CHAT_ID,
      message,
      {
        parse_mode: "HTML",
      }
    );

    messageId = sendedMessage.message_id; // Сохраняем ID отправленного сообщения
  } catch (error) {
    console.error("Ошибка при отправке сообщения в Telegram:", error);
    ctx.reply("❌ Произошла ошибка при отправке сообщения в чат.");
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
    console.error("Ошибка при сохранении в базу:", error);
    // Удаляем сообщение, если не удалось сохранить в базу
    await bot.telegram.deleteMessage(FAMILY_CHAT_ID, messageId);
    ctx.reply("❌ Ошибка при сохранении слова в базу данных.");
    throw error;
  }
};

const handleWord = async (ctx) => {
  const sender = getSender(ctx);
  const isForceMode = forceModeUsers.has(sender.id);

  const wordObjs = ctx.message.text
    .split("\n")
    .map((line) => parseLine(line))
    .filter((lineObj) => lineObj.word);

  if (isForceMode) wordObjs.length = 1;

  for (const wordObj of wordObjs) {
    const duplicates = isForceMode ? null : await checkWord(wordObj.word);

    if (!duplicates) {
      let messageId;
      try {
        // Если дубликата нет, отправляем слово
        messageId = await sendWord(ctx, sender, wordObj);
      } catch (error) {
        return;
      }

      // Успешно, отправляем подтверждение пользователю
      const replyMessage = `
        "<b>${wordObj.word}</b>" отправлено в чат
<a href="${MESSAGE_URL_BASE}${messageId}">Перейти к сообщению</a>
      `;

      await ctx.reply(replyMessage, {
        parse_mode: "HTML",
      });
    } else {
      // Если дубликат найден, выводим сообщение о нем
      reportDuplicate(ctx, duplicates);
    }
  }

  if (isForceMode) forceModeUsers.delete(sender.id);
};

const handleForwarded = async (ctx, url) => {
  const sender = getSender(ctx);
  const {
    message: { text },
  } = ctx;

  const wordObj = parseWord(url, text);

  if (await wordsBase.checkForwarded(wordObj.word, sender.id)) {
    ctx.reply("❗️ Это сообщение уже пересылалось", {
      reply_to_message_id: ctx.message.message_id,
    });
    return;
  }

  let messageId;
  try {
    messageId = await sendWord(ctx, sender, wordObj, true);
  } catch (error) {
    console.error("Ошибка при отправке слова:", error);
    return;
  }
  // Успешно, отправляем подтверждение пользователю
  const replyMessage = `
    Слово от ${sender.name} отправлено в чат
<a href="${MESSAGE_URL_BASE}${messageId}">Перейти к сообщению</a>
    `;

  await ctx.reply(replyMessage, {
    parse_mode: "HTML",
    reply_to_message_id: ctx.message.message_id,
  });
};

bot.start((ctx) =>
  ctx.reply("Привет. Этот бот генерирует Вордли ссылку для присланных слов.")
);

bot.help(async (ctx) => {
  const helpMessage = `
<b>/normal Обычный режим (по умолчанию):</b>
Можно отправить одно или несколько слов, каждое на своей строке.
Слова перед отправкой проверяются, дубликаты не отправляются.
Через "-" можно указать примечание

Отключает принудительный режим без отправки сообщения. 

Пример:<code>
заноза
отнюдь - причастие
ромашка </code>
__________          __________

<b>/force Принудительный режим:</b>
Отправляет одно слово без проверки на дубликат.
Через "-" можно указать примечание

Пример:<code>
заноза
отнюдь - причастие
ромашка </code>

Отправит только слово "заноза".
__________          __________

Можно переслать из другого чата сообщение со ссылкой на Вордли игру, тогда бот перешлет его в чат игры, если ранее такое слово не было переслано от того же пользователя. 
  `;
  await ctx.reply(helpMessage, {
    parse_mode: "HTML",
  });
});

bot.command("force", async (ctx) => {
  const userId = ctx.from.id;
  forceModeUsers.add(userId); // Добавляем пользователя в режим force
  await ctx.reply("Вы в режиме принудительной отправки. Отправьте слово.");
});

bot.command("normal", async (ctx) => {
  const userId = ctx.from.id;
  forceModeUsers.delete(userId); // Удаляем пользователя из режима force
  await ctx.reply(
    "Вы в нормальном режиме. Теперь слово будет проверятся пере отправкой."
  );
});

bot.on("message", async (ctx) => {
  const {
    message: { forward_date, chat, reply_to_message },
  } = ctx;

  if (!allowedUsers.hasOwnProperty(ctx.from.id)) {
    return ctx.reply("Вы не авторизованы для использования этого бота.");
  }

  if (chat.type !== "private" || reply_to_message) {
    return;
  }

  if (!forward_date) {
    handleWord(ctx);
    return;
  }

  const url =
    findUrl(ctx.message.text) || ctx.message.link_preview_options?.url;
  const isForwarded = url && url.includes(URL_BASE);
  if (isForwarded) {
    forwardedQueue.push({ ctx, url });
    processNextForwarded();
    return;
  }

  ctx.reply("❌ Что-то пошло не так, попробуйте еще раз");
});

bot.launch();

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
