import { TelegramUpdate } from "./types";
import TelegramBot from "./telegram_bot";

export default {
  chatInfo: async (bot: TelegramBot, update: TelegramUpdate, args: string[]) =>
    bot.getChatInfo(update),
  ping: async (bot: TelegramBot, update: TelegramUpdate) =>
    bot.ping(update),
  code: async (bot: TelegramBot, update: TelegramUpdate, args: string[]) =>
    bot.code(update),
  quit: async (bot: TelegramBot, update: TelegramUpdate) =>
    bot.quit(update),
  cancel: async (bot: TelegramBot, update: TelegramUpdate) =>
    bot.cancel(update),
  stickerReplicator: {
    start: async (bot: TelegramBot, update: TelegramUpdate) =>
      bot.stickerReplicatorBotStart(update),
    transfer: async (bot: TelegramBot, update: TelegramUpdate, args: string[]) =>
      bot.stickerReplicatorBotTransfer(update, args),
  },
  spotifyQuerer: {
    start: async (bot: TelegramBot, update: TelegramUpdate) =>
      bot.spotifyQuererBotStart(update),
  },
  commandList: async (
    bot: TelegramBot,
    update: TelegramUpdate,
    args: string[]
  ) => bot.commandList(update),
};
