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
      "https://github.com/sparkyfen/sparky.works"
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
      "MarkdownV2"
    );
  }

  // bot command: /ping
  ping = async (update: TelegramUpdate): Promise<Response> =>
    this.sendMessage(
      update.message.chat.id,
      "pong"
    );

  // @stickerreplicatorbot
  // bot command: /start
  stickerReplicatorBotStart = async (update: TelegramUpdate): Promise<Response> => {
    const startMessage = `Hello there\\!\n\nThis bot has the ability to copy stickers from one pack to another\\.\n*Note*: It won't retain stats on the previous one or update/delete the old pack\\.\nTo get started, type /transfer with a link or follow it up with a sticker\\.`;
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
      try {
        const content = await this.getStickerSet(stickerName);
        this.sendMessage(
          update.message.chat.id,
          'Below are the commands you need to forward to the @Stickers bot.',
        );
        // TODO This runs in parallel so we need a way to maintain the order of the sticker pack.
        return Promise.allSettled(content.result.stickers.map((sticker) => {
          return this.sendSticker(update.message.chat.id, sticker.file_id);
        }));
      } catch(err) {
        console.log(err);
      }
    }
  }

  stickerReplicatorBotCancel  = async (update: TelegramUpdate): Promise<Response> => {
    // TODO Implement if needed.
    this.sendMessage(
      update.message.chat.id,
      'Current operation cancelled',
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
