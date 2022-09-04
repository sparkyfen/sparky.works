////////////////////////////////////////////////////////////////////
////           Telegram Bot using Cloudflare Worker             ////
////////////////////////////////////////////////////////////////////
////  Author: Nikhil John                                       ////
////  Repo: https://github.com/nikhiljohn10/telegram-bot-worker ////
////  License: MIT                                              ////
////                                                            ////
////  Author: Sean Behan                                        ////
////  Repo: https://github.com/codebam/cf-workers-telegram-bot  ////
////  License: Apache-2.0                                       ////
////////////////////////////////////////////////////////////////////

import commands from "./commands";
import Handler from "./handler";
import { responseToJSON } from "./libs";

interface Environment {
  SECRET_TELEGRAM_API_TOKEN: string;
  KV_BOT_STORAGE: KVNamespace;
}

export default {
  fetch: async (request: Request, env: Environment) =>
    new Handler([
      {
        bot_name: "stickerreplicatorbot",
        token: env.SECRET_TELEGRAM_API_TOKEN,
        commands: {
          "/chatinfo": commands.chatInfo,
          "/ping": commands.ping,
          "/code": commands.code,
          "/quit": commands.quit,
          "/commands": commands.commandList,
          "/help": commands.stickerReplicator.start,
          "/start": commands.stickerReplicator.start,
          "/transfer": commands.stickerReplicator.transfer,
          "/cancel": commands.stickerReplicator.cancel,
          "/stop": commands.stickerReplicator.cancel,
        },
        kv: env.KV_BOT_STORAGE,
      },
    ]).handle(request),
};
