import { Bot } from "https://deno.land/x/grammy@v1.8.3/mod.ts";
import { assertExists } from "https://deno.land/std@0.144.0/testing/asserts.ts";

const bot_token = Deno.env.get("BOT_TOKEN");
assertExists(bot_token, "BOT_TOKEN is missing");

const bot = new Bot(bot_token);
const url = prompt("What is the webhook url?");
assertExists(url, "url is empty");

console.log(`Setting webhook url to ${url}`);
console.log(await bot.api.setWebhook(url));
