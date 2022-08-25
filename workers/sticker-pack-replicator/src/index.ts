import { Markup, Scenes, Telegraf, session } from 'telegraf';
import { Application, Router } from '@cfworker/web';
import createTelegrafMiddware from 'cfworker-middware-telegraf';

import { DEFAULT_CORS_HEADERS } from './utils';

const router = new Router();

const bot = new Telegraf(TELEGRAM_API_TOKEN);

const transferScene = new Scenes.BaseScene('transfer');
transferScene.enter((ctx) => ctx.reply('Please send the link of the sticker pack or a sticker from the pack.'));
transferScene.leave((ctx) => ctx.reply('The command was cancelled.\nSend /help for a list of commands.'));
transferScene.command('cancel', Scenes.Stage.leave())
transferScene.on('text', (ctx) => {
  return ctx.reply(`Received message: ${ctx.message.text}`);
})
transferScene.on('sticker', (ctx) => ctx.reply('Received sticker!'));
transferScene.on('message', (ctx) => ctx.reply('Sorry this input is unaccepted.'));

const stage = new Scenes.Stage([transferScene]);
bot.use(stage.middleware());

bot.start((ctx) => ctx.reply(`Hello there!\n\nThis bot has the ability to copy stickers from one pack to another.\nNote: It won't retain stats on the previous one or update/delete the old pack.\nTo get started, type /transfer with a link or follow it up with a sticker.`));
bot.help((ctx) => ctx.reply('TODO!'));
bot.command('ping', (ctx) => {
  return ctx.reply('pong');
});
bot.command('transfer', (ctx) => {
  if(ctx.message.from.id != SPARKY_TELEGRAM_ID) {
    return ctx.reply('Work in progress, come back soon <3.');
  }
  return Scenes.Stage.enter('transfer');
});

bot.command('echo', (ctx) => {
  return ctx.reply('echo');
});

bot.command('cancel', (ctx) => {
  return ctx.reply('There was no active command to cancel');
});
bot.command('stop', (ctx) => ctx.leaveChat());
bot.command('quit', (ctx) => ctx.leaveChat());
bot.on('message', (ctx) => ctx.reply('Got another message!'));

// Simple CORS middleware.
const cors = async ({res}, next) => {
  for (const HEADER_KEY in DEFAULT_CORS_HEADERS) {
    res.headers.set(HEADER_KEY, DEFAULT_CORS_HEADERS[HEADER_KEY]);
  }
  await next();
};

router.get('/', ({res}) => {
  res.headers.set('Content-Type', 'application/json;charset=UTF-8');
  res.body = JSON.stringify({message: 'Hello world!'});
});

router.post(`/${TELEGRAM_SECRET_PATH}`, createTelegrafMiddware(bot));
new Application().use(cors).use(router.middleware).listen();