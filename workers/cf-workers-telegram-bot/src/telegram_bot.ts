import Bot from "./bot";
import {
  preTagString,
  prettyJSON,
  addSearchParams,
  responseToJSON,
  log,
  URL_REGEX,
  STICKER_SUFFIX_REGEX,
} from "./libs";
import {
  TelegramInlineQueryResultArticle,
  TelegramInlineQueryResultPhoto,
  TelegramUpdate,
  TelegramStickerSet,
  Config,
} from "./types";

export default class TelegramBot extends Bot {
  constructor(config: Config) {
    super(config);
  }

  // bot command: /code
  code = async (update: TelegramUpdate): Promise<Response> =>
    ((url) =>
      (update.inline_query &&
        this.answerInlineQuery(update.inline_query.id, [
          new TelegramInlineQueryResultArticle(url),
        ])) ??
      this.sendMessage(update.message.chat.id, url))(
      'https://github.com/sparkyfen/sparky.works'
    );

  // bot command: /commandList
  commandList = async (update: TelegramUpdate): Promise<Response> => {
    const commandKeys = Object.keys(this.commands);
    let commandList = '';
    for (var index in commandKeys) {
      const command = commandKeys[index];
      commandList += `* ${command}\n`;
    }
    this.sendMessage(
      update.message.chat.id,
      commandList,
      'MarkdownV2'
    );
  }

  // bot command: /ping
  ping = async (update: TelegramUpdate): Promise<Response> =>
    this.sendMessage(
      update.message.chat.id,
      'pong'
    );

  quit = async (update: TelegramUpdate): Promise<Response> =>
    this.sendMessage(
      update.message.chat.id,
      "Just delete the chat. Nothing else to do here :)"
    );

  // @stickerreplicatorbot
  // bot command: /start
  stickerReplicatorBotStart = async (update: TelegramUpdate): Promise<Response> => {
    const startMessage = `Hello there\\!\n\nThis bot has the ability to copy stickers from one pack to another\\.\n*Notes*: It won't retain stats on the previous one or update/delete the old pack\\.\nThe bot only handles non animated/video packs and packs under 25 stickers total\\.\n\nTo get started, type /transfer with a link or follow it up with a sticker\\.`;
    this.sendMessage(
      update.message.chat.id,
      startMessage,
      "MarkdownV2"
    );
  }

  // bot command: /transfer
  stickerReplicatorBotTransfer = async (update: TelegramUpdate, args: string[]): Promise<Response[]> => {
    const validInput = (input: string): boolean => {
      const urlMatches = input.match(URL_REGEX);
      if (!urlMatches || urlMatches.length < 4) {
        return false;
      }
      return STICKER_SUFFIX_REGEX.test(urlMatches[4]);
    };
    const getStickerPackName = (input: string): string => {
      const urlMatches = input.match(URL_REGEX);
      const nameMatches = urlMatches[4].match(STICKER_SUFFIX_REGEX);
      return nameMatches[1];
    };
    if (args.length <= 1) {
      this.sendMessage(
        update.message.chat.id,
        'Please send the link of the sticker pack `\\/transfer \\<URL\\>` or a sticker from the pack to find necessary command\\.',
        'MarkdownV2'
      );
    } else {
      if (!validInput(args[1])) {
        this.sendMessage(
          update.message.chat.id,
          `Please send a valid Telegram sticker URL. Send a sticker from the pack if you're unsure the value URL.`,
        );
        return;
      }
      const stickerUrl = args[1];
      const stickerName = getStickerPackName(stickerUrl);
      console.log('Got sticker name', stickerName);
      // TODO Handle animated packs or video packs.
      const stickerSet = await this.getStickerSet(stickerName);
      if (stickerSet.result.stickers.length > 25) {
        this.sendMessage(
          update.message.chat.id,
          'Unable to currently process packs with counts greater than 25, please try another pack.',
        )
        return;
      }
      if (stickerSet.result.is_animated || stickerSet.result.is_video) {
        this.sendMessage(
          update.message.chat.id,
          'Unable to currently process animated or video packs, please try another pack.',
        )
        return;
      }
      console.log('Processing sticker pack', stickerName);
      const newStickerSuffix = `_by_${this.bot_name}`;
      const newStickerName = `${stickerName.slice(0, 64 - newStickerSuffix.length)}${newStickerSuffix}`; //SparkyFen_by_stickerreplicatorbot
      await this.sendMessage(
        update.message.chat.id,
        `Creating new sticker pack with name ${newStickerName}`,
      );
      const stickers = stickerSet.result.stickers;
      const firstSticker = stickers.shift();
      const stickerSetInput: TelegramStickerSet = {
        user_id: update.message.from.id,
        name: newStickerName,
        title: stickerSet.result.title,
        png_sticker: firstSticker.file_id,
        emojis: firstSticker.emoji,
        // TODO sticker_type & mask_position if needed from first sticker
      };
      const stickerSetRes = await this.createNewStickerSet(stickerSetInput);
      if (!stickerSetRes.result) {
        console.error(stickerSetRes);
        await this.sendMessage(
          update.message.chat.id,
          'Something went wrong with the process, please retry.',
        );
        return;
      }
      for (const sticker of stickers) {
        await this.addStickerToSet({
          user_id: update.message.from.id,
          name: newStickerName,
          png_sticker: sticker.file_id,
          emojis: sticker.emoji,
          // TODO mask_position if needed (when support for masks)
        });
      }
      await this.sendMessage(
        update.message.chat.id,
        `Congrats! Your sticker pack is at https://t.me/addstickers/${newStickerName}. Check @About_StickerReplicatorBot for more details.`,
      );
      // await this.sendMessage(
      //   update.message.chat.id,
      //   '/newpack',
      //   '',
      //   false,
      //   true, //disable_notification
      // );
      // await this.sendMessage(
      //   update.message.chat.id,
      //   newStickerName,
      //   '',
      //   false,
      //   true, //disable_notification
      // );
      // for (const sticker of stickerSet.result.stickers) {
      //   await this.sendSticker(update.message.chat.id, sticker.file_id, true);
      //   await this.sendMessage(update.message.chat.id, sticker.emoji, '', false, true);
      //   await this.sendMessage(update.message.chat.id, '/addsticker', '', false, true);
      //   await this.sendMessage(update.message.chat.id, `<${newStickerName}>`, '', false, true);
      // }
      // await this.sendMessage(
      //   update.message.chat.id,
      //   '*Work in Progress*: Above are the commands you need to forward to the @Stickers bot\\. Check @About\\_StickerReplicatorBot for more instructions\\.',
      //   'MarkdownV2'
      // );
    }
  }

  stickerReplicatorBotCancel  = async (update: TelegramUpdate): Promise<Response> => {
    // TODO Implement if needed.
    this.sendMessage(
      update.message.chat.id,
      'Doesn\'t really do anything, zzz...',
    );
  }

  // bot command: /chatInfo
  getChatInfo = async (update: TelegramUpdate): Promise<Response> =>
    this.sendMessage(
      update.message.chat.id,
      preTagString(prettyJSON(update.message.chat)),
      "HTML"
    );
}
