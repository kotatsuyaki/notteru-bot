import { Bot } from "https://deno.land/x/grammy@v1.8.3/mod.ts";
import {
  assert,
  assertExists,
} from "https://deno.land/std@0.144.0/testing/asserts.ts";
import { DynamoDB } from "https://esm.sh/@aws-sdk/client-dynamodb@3.113.0";
import { DynamoDBDocument } from "https://esm.sh/@aws-sdk/lib-dynamodb@3.113.0";

import { NotteruBot } from "./bot.ts";

const bot_token = Deno.env.get("BOT_TOKEN");
const admin_id = Number(Deno.env.get("ADMIN_ID"));
const channel_id = Number(Deno.env.get("CHANNEL_ID"));

assertExists(bot_token);
assert(isNaN(admin_id) == false);
assert(isNaN(channel_id) == false);

const client = new DynamoDB({
  region: "local",
  endpoint: "http://localhost:8000",
  credentials: {
    accessKeyId: "dummy_access_key_id",
    secretAccessKey: "dummy_secret_access_key",
  },
});
const doc_client = DynamoDBDocument.from(client);

const bot = new NotteruBot(
  new Bot(bot_token),
  doc_client,
  admin_id,
  channel_id,
);
const bot_promise = bot.start();
await bot.periodic();
await bot_promise;
