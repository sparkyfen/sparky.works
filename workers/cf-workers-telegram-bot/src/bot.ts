import Webhook from "./webhook";
import { addSearchParams, log, responseToJSON, JSONResponse } from "./libs";
import {
  Commands,
  Config,
  TelegramInlineQueryResult,
  TelegramSticker,
  TelegramUpdate,
} from "./types";
import Handler from "./handler";

export default class Bot {
  token: string;
  commands: Commands;
  api: URL;
  webhook: Webhook;
  kv: KVNamespace;
  handler: Handler;

  constructor(config: Config) {
    this.token = config.token || null;
    this.commands = config.commands;
    this.api = new URL(`https://api.telegram.org/bot${config.token}`);
    this.webhook = new Webhook(this.api, config.token, config.url);
    this.kv = config.kv || null;
    this.handler = config.handler;
  }

  inlineQueryUpdate = async (update: TelegramUpdate): Promise<Response> =>
    this.executeInlineCommand(update).then(
      (response) => responseToJSON(response) && response
    ) || this.updates.default(update, 'inlineQueryUpdate');

  messageUpdate = async (update: TelegramUpdate): Promise<Response> => {
    return ((update.message.sticker && 
      await this.handleSticker(update)) ??
      (typeof update.message.text === "string" &&
      (await this.executeCommand(update).then(
        async () => await this.greetUsers(update)
      )))) ??
    this.updates.default(update, 'messageUpdate');
  }

  defaultMessage = async(update: TelegramUpdate, incomer: string): Promise<Response> => {
    console.log('Default message', incomer);
    return this.sendMessage(
      update.message.chat.id,
      `Unknown request, please check /commands.`,
    )
  }
    

  updates = {
    inline_query: this.inlineQueryUpdate,
    message: this.messageUpdate,
    default: this.defaultMessage,
    doNothing: new Response()
  };

  // Main handler from invoker.
  update = async (update: TelegramUpdate): Promise<Response> =>
    (log({ update }) &&
      update.message !== undefined &&
      (await this.updates.message(update))) ||
    (update.inline_query !== undefined &&
      (await this.updates.inline_query(update))) ||
    this.updates.doNothing;

  // greet new users who join
  greetUsers = async (update: TelegramUpdate): Promise<Response> =>
    (update.message.new_chat_members !== undefined &&
      this.sendMessage(
        update.message.chat.id,
        `Welcome to ${update.message.chat.title}, ${update.message.from.username}`
      )) ??
    this.updates.default(update, 'greetUsers');

  getCommand = (args: string[]): string => args[0]?.split("@")[0];

  // run command passed from executeCommand
  _executeCommand = async (
    update: TelegramUpdate,
    text: string,
    args: string[] = []
  ) => {
    return (log({ execute: { text, args } }) &&
      (async (text_args: string[]) =>
        ((command) =>
          ((this.commands[command] ||
            log({
              error: `command '${command}' does not exist`,
            })) &&
            this.commands[command]?.(this, update, [...text_args, ...args])) ||
          // run the command
          this.updates.default(update, 'inner _executeCommand'))(this.getCommand(text_args)))(
        // get the command to run
        text
          .trimStart()
          .replace(/^([^\s]*\s)\s*/gm, "$1")
          .split(" ")
      )) ??
    this.updates.default(update, '_executeCommand');
  }

  _handleSticker = async (update: TelegramUpdate, sticker: TelegramSticker): Promise<Response> => {
    log({ sticker });
    if (!sticker.set_name) {
      this.sendMessage(
        update.message.chat.id,
        `Sticker pack name missing for this sticker, try another one.`
      );
    } else {
      // TODO Move this into something the end user can add to the handler constructor.
      this.sendMessage(
        update.message.chat.id,
        `Please send the following command to transfer the pack\\.\n\`\\/transfer https\\:\\/\\/t\\.me\\/addstickers\\/${sticker.set_name}\``,
        'MarkdownV2'
      );
    }
  }

  // execute the inline custom bot commands from bot configurations
  executeInlineCommand = async (update: TelegramUpdate): Promise<Response> =>
    ((await this._executeCommand(update, update.inline_query.query)) &&
      (await this._executeCommand(
        update,
        "inline",
        update.inline_query.query.trimStart().split(" ")
      ))) ??
    this.updates.default(update, 'executeInlineCommand');

  // execute the custom bot commands from bot configurations
  executeCommand = async (update: TelegramUpdate): Promise<Response> => {
    return this._executeCommand(update, update.message.text) || this.updates.default(update, 'executeCommand');
  }
    

  handleSticker = async (update: TelegramUpdate): Promise<Response> =>
    this._handleSticker(update, update.message.sticker) || this.updates.default(update, 'handleSticker');


  // trigger answerInlineQuery command of BotAPI
  answerInlineQuery = async (
    inline_query_id: number,
    results: TelegramInlineQueryResult[],
    cache_time = 0
  ) =>
    fetch(
      log(
        addSearchParams(new URL(`${this.api.href}/answerInlineQuery`), {
          inline_query_id: inline_query_id.toString(),
          results: JSON.stringify(results),
          cache_time: cache_time.toString(),
        }).href
      )
    );

  // trigger sendMessage command of BotAPI
  sendMessage = async (
    chat_id: number,
    text: string,
    parse_mode = "",
    disable_web_page_preview = false,
    disable_notification = false,
    reply_to_message_id = 0,
    reply_markup = {}
  ): Promise<Response> =>
    fetch(
      log(
        addSearchParams(new URL(`${this.api.href}/sendMessage`), {
          chat_id: chat_id.toString(),
          text,
          parse_mode: parse_mode,
          disable_web_page_preview: disable_web_page_preview.toString(),
          disable_notification: disable_notification.toString(),
          reply_to_message_id: reply_to_message_id.toString(),
          reply_markup: JSON.stringify(reply_markup),
        }).href
      )
    );

  // trigger forwardMessage command of BotAPI
  forwardMessage = async (
    chat_id: number,
    from_chat_id: number,
    disable_notification = false,
    message_id: number
  ) =>
    fetch(
      log(
        addSearchParams(new URL(`${this.api.href}/sendMessage`), {
          chat_id: chat_id.toString(),
          from_chat_id: from_chat_id.toString(),
          message_id: message_id.toString(),
          disable_notification: disable_notification.toString(),
        }).href
      )
    );

  // trigger sendPhoto command of BotAPI
  sendPhoto = async (
    chat_id: number,
    photo: string,
    caption = "",
    parse_mode = "",
    disable_notification = false,
    reply_to_message_id = 0
  ) =>
    fetch(
      log(
        addSearchParams(new URL(`${this.api.href}/sendPhoto`), {
          chat_id: chat_id.toString(),
          photo,
          caption,
          parse_mode,
          disable_notification: disable_notification.toString(),
          reply_to_message_id: reply_to_message_id.toString(),
        }).href
      )
    );

  // trigger sendPhoto command of BotAPI
  sendSticker = async (
    chat_id: number,
    sticker: string,
    disable_notification = false,
    allow_sending_without_reply = true,
    reply_to_message_id = 0
  ) =>
    fetch(
      log(
        addSearchParams(new URL(`${this.api.href}/sendSticker`), {
          chat_id: chat_id.toString(),
          sticker,
          disable_notification: disable_notification.toString(),
          allow_sending_without_reply: allow_sending_without_reply.toString(),
          reply_to_message_id: reply_to_message_id.toString(),
        }).href
      )
    );

  // trigger sendVideo command of BotAPI
  sendVideo = async (
    chat_id: number,
    video,
    duration = 0,
    width = 0,
    height = 0,
    thumb = "",
    caption = "",
    parse_mode = "",
    supports_streaming = false,
    disable_notification = false,
    reply_to_message_id = 0
  ) =>
    fetch(
      log(
        addSearchParams(new URL(`${this.api.href}/sendVideo`), {
          chat_id: chat_id.toString(),
          video: JSON.stringify(video),
          duration: duration.toString(),
          width: width.toString(),
          height: height.toString(),
          thumb: thumb,
          caption: caption,
          parse_mode: parse_mode,
          supports_streaming: supports_streaming.toString(),
          disable_notification: disable_notification.toString(),
          reply_to_message_id: reply_to_message_id.toString(),
        }).href
      )
    );

  // trigger sendAnimation command of BotAPI
  sendAnimation = async (
    chat_id: number,
    animation,
    duration = 0,
    width = 0,
    height = 0,
    thumb = "",
    caption = "",
    parse_mode = "",
    disable_notification = false,
    reply_to_message_id = 0
  ) =>
    fetch(
      log(
        addSearchParams(new URL(`${this.api.href}/sendAnimation`), {
          chat_id: chat_id.toString(),
          animation: JSON.stringify(animation),
          duration: duration.toString(),
          width: width.toString(),
          height: height.toString(),
          thumb,
          caption,
          parse_mode,
          disable_notification: disable_notification.toString(),
          reply_to_message_id: reply_to_message_id.toString(),
        }).href
      )
    );

  // trigger sendLocation command of BotAPI
  sendLocation = async (
    chat_id: number,
    latitude: number,
    longitude: number,
    live_period = 0,
    disable_notification = false,
    reply_to_message_id = 0
  ) =>
    fetch(
      log(
        addSearchParams(new URL(`${this.api.href}/sendLocation`), {
          chat_id: chat_id.toString(),
          latitude: latitude.toString(),
          longitude: longitude.toString(),
          live_period: live_period.toString(),
          disable_notification: disable_notification.toString(),
          reply_to_message_id: reply_to_message_id.toString(),
        }).href
      )
    );

  // trigger senPoll command of BotAPI
  sendPoll = async (
    chat_id: number,
    question: string,
    options: string[],
    is_anonymous = false,
    type = "",
    allows_multiple_answers = false,
    correct_option_id = 0,
    explanation = "",
    explanation_parse_mode = "",
    open_period = 0,
    close_date = 0,
    is_closed = false,
    disable_notification = false,
    reply_to_message_id = 0
  ) =>
    fetch(
      log(
        addSearchParams(new URL(`${this.api.href}/sendPoll`), {
          chat_id: chat_id.toString(),
          question,
          options: options.toString(),
          is_anonymous: is_anonymous.toString(),
          type,
          allows_multiple_answers: allows_multiple_answers.toString(),
          correct_option_id: correct_option_id.toString(),
          explanation: explanation,
          explanation_parse_mode: explanation_parse_mode,
          open_period: open_period.toString(),
          close_date: close_date.toString(),
          is_closed: is_closed.toString(),
          disable_notification: disable_notification.toString(),
          reply_to_message_id: reply_to_message_id.toString(),
        }).href
      )
    );

  // trigger senDice command of BotAPI
  sendDice = async (
    chat_id: number,
    emoji = "",
    disable_notification = false,
    reply_to_message_id = 0
  ) =>
    fetch(
      log(
        addSearchParams(new URL(`${this.api.href}/sendDice`), {
          chat_id: chat_id.toString(),
          emoji,
          disable_notification: disable_notification.toString(),
          reply_to_message_id: reply_to_message_id.toString(),
        }).href
      )
    );

  // bot api command to get user profile photos
  getUserProfilePhotos = async (
    user_id: number,
    offset = 0,
    limit = 0
  ) =>
    fetch(
      log(
        addSearchParams(new URL(`${this.api.href}/getUserProfilePhotos`), {
          user_id: user_id.toString(),
          offset: offset.toString(),
          limit: limit.toString(),
        }).href
      )
    );

  // bot api command to get sticker set.
  getStickerSet = async (
    sticker_name: string,
  ): Promise<string> => {
    const response = await fetch(
      log(
        addSearchParams(new URL(`${this.api.href}/getStickerSet`), {
          name: sticker_name.toString(),
        }).href
      ),
      {
        headers: {
          'content-type': 'application/json;charset=UTF-8',
        },
      }
    );
    return await responseToJSON(response);
  }
}
