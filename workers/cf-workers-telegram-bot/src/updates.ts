import { TelegramUpdate } from "./types";
import TelegramBot from "./telegram_bot";

export default {
  stickerReplicator: {
    sticker: async (bot: TelegramBot, update: TelegramUpdate) =>
      bot.stickerReplicatorBotSticker(update),
    channelPost: async (bot: TelegramBot, update: TelegramUpdate) => new Response(),
  },
};
