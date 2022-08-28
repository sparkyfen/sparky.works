import { Bot, webhookCallback } from 'grammy';
import { Router as WorktopRouter } from 'worktop';
import { listen } from 'worktop/cache';
import * as CORS from 'worktop/cors';

const bot = new Bot(TELEGRAM_API_TOKEN);
const API = new WorktopRouter();

bot.command('start', async (ctx) => 
  ctx.reply(`Hello there!\n\nThis bot has the ability to copy stickers from one pack to another.\nNote: It won't retain stats on the previous one or update/delete the old pack.\nTo get started, type /transfer with a link or follow it up with a sticker.`, {
  reply_to_message_id: ctx.message.msg.message_id,
}));
bot.command('help', async (ctx) => ctx.reply('TODO!', {
  reply_to_message_id: ctx.message.msg.message_id,
}));
bot.command('ping', async (ctx) => {
  return ctx.reply('pong', {
    reply_to_message_id: ctx.message.msg.message_id,
  });
});
bot.command('cancel', async (ctx) => {
  return ctx.reply('There was no active command to cancel', {
    reply_to_message_id: ctx.message.msg.message_id,
  });
});
bot.command('stop', async (ctx) => ctx.leaveChat());
bot.command('quit', async (ctx) => ctx.leaveChat());
bot.on('message:text', async (ctx) => ctx.reply('Got another message!', {
  reply_to_message_id: ctx.message.msg.message_id,
}));
bot.catch(err => console.log(err));

/**
 * Handles `OPTIONS` requests using the same settings.
 * NOTE: Call `CORS.preflight` per-route for individual settings.
 */
API.prepare = CORS.preflight({
  origin: '*', // allow any `Origin` to connect
  headers: ['Cache-Control', 'Content-Type'],
  methods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
});

API.add('GET', '/', async (req, res) => {
  res.setHeader('Content-Type', 'application/json;charset=UTF-8');
  res.send(200, JSON.stringify({message: 'Hello world!'}))
});

API.add('POST', `/${TELEGRAM_SECRET_PATH}`, (req, res) => webhookCallback(bot, 'worktop')(req, res));
listen(API.run);