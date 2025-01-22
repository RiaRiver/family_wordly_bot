/* eslint-disable camelcase */
import wordsBase from './wordsBase.js';
import {
  findUrl,
} from './utils.js';
import {
  ALLOWED_USERS, bot, CHECK_MODE_USERS, FORCE_MODE_USERS, replyMessages, URL_BASE,
} from './constans.js';
import { messageQueue, processNextMessage } from './services.js';

bot.telegram.setMyCommands([
  {
    command: 'start',
    description: 'Приветственное сообщение',
  },
  {
    command: 'help',
    description: 'Помощь',
  },
  {
    command: 'check',
    description:
      'Режим проверки слов. Проверяет были ли ранее отправлены слова из следующего сообщения.',
  },
  {
    command: 'force',
    description: 'Режим принудительной отправки для следующего слова',
  },
  {
    command: 'normal',
    description: 'Обычный режим',
  },
]);

wordsBase.create();

bot.start((ctx) => ctx.reply(replyMessages.start));

bot.help(async (ctx) => {
  await ctx.reply(replyMessages.help, {
    parse_mode: 'HTML',
  });
});

bot.command('force', async (ctx) => {
  const userId = ctx.from.id;
  CHECK_MODE_USERS.delete(userId);
  FORCE_MODE_USERS.add(userId); // Добавляем пользователя в режим force
  await ctx.reply(replyMessages.forceMode);
});

bot.command('check', async (ctx) => {
  const userId = ctx.from.id;
  FORCE_MODE_USERS.delete(userId);
  CHECK_MODE_USERS.add(userId); // Добавляем пользователя в режим force
  await ctx.reply(replyMessages.checkMode);
});

bot.command('normal', async (ctx) => {
  const userId = ctx.from.id;
  CHECK_MODE_USERS.delete(userId);
  FORCE_MODE_USERS.delete(userId); // Удаляем пользователя из режима force
  await ctx.reply(replyMessages.normalMode);
});

bot.on('message', async (ctx) => {
  const {
    message: { forward_date, chat, reply_to_message },
  } = ctx;

  if (!Object.prototype.hasOwnProperty.call(ALLOWED_USERS, ctx.from.id)) {
    return ctx.reply(replyMessages.unauthorized);
  }

  if (chat.type !== 'private' || reply_to_message) {
    return undefined;
  }

  const url = findUrl(ctx.message.text) || ctx.message.link_preview_options?.url;
  const isForwarded = url && url.includes(URL_BASE);

  if (forward_date) {
    if (isForwarded) messageQueue.push({ ctx, url });
    else { ctx.reply(replyMessages.error); return undefined; }
  } else messageQueue.push({ ctx });

  processNextMessage();
  return undefined;
});

bot.launch();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
