import { Telegraf } from "telegraf";
import dotenv from "dotenv";
dotenv.config();
const allowedUsers = {
  50249573: "Лера",
  38036332: "Дима",
  84321375: "Мама",
};

const { BOT_TOKEN, FAMILY_CHAT_ID } = process.env;
const bot = new Telegraf(BOT_TOKEN);

bot.start((ctx) =>
  ctx.reply("Привет. Этот бот генерирует Вордли ссылку для присланных слов.")
);

bot.launch();

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
