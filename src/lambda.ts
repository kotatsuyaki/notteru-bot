import {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from "https://deno.land/x/lambda@1.22.3/mod.ts";
import { FrameworkAdapter } from "https://deno.land/x/grammy@v1.8.3/mod.ts";
import {
  IPv4,
  IPv4CidrRange,
  IPv4Prefix,
} from "https://deno.land/x/ip_num@v1.4.0/index.ts";
import {
  assert,
  assertExists,
} from "https://deno.land/std@0.144.0/testing/asserts.ts";
import { DynamoDB } from "https://esm.sh/@aws-sdk/client-dynamodb@3.113.0";
import { DynamoDBDocument } from "https://esm.sh/@aws-sdk/lib-dynamodb@3.113.0";
import { Bot } from "https://deno.land/x/grammy@v1.8.3/mod.ts";
import { NotteruBot } from "./bot.ts";

console.log("Initializing bot");

const bot_token = Deno.env.get("BOT_TOKEN");
const admin_id = Number(Deno.env.get("ADMIN_ID"));
const channel_id = Number(Deno.env.get("CHANNEL_ID"));

assertExists(bot_token);
assert(isNaN(admin_id) == false);
assert(isNaN(channel_id) == false);

console.log("Got parameters from environment");

const client = new DynamoDB({
  region: "us-east-1",
  credentials: {
    secretAccessKey: Deno.env.get("AWS_SECRET_ACCESS_KEY")!,
    accessKeyId: Deno.env.get("AWS_ACCESS_KEY_ID")!,
    sessionToken: Deno.env.get("AWS_SESSION_TOKEN")!,
  },
});

console.log("Created client");

const doc_client = DynamoDBDocument.from(client);

console.log("Created doc_client");

const bot = new NotteruBot(
  new Bot(bot_token),
  doc_client,
  admin_id,
  channel_id,
);

console.log("Created bot");

const lambdaAdaptor: FrameworkAdapter = (
  event: APIGatewayProxyEventV2,
  _context: Context,
  callback,
) => ({
  update: JSON.parse(event.body!),
  end: () => callback(null, { statusCode: 200 }),
  respond: (json: string) => callback(null, { statusCode: 200, body: json }),
});
const callback = bot.webhook_callback(lambdaAdaptor);

console.log("Webhook callback is set");

export async function webhook(
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyResultV2> {
  console.log("Got event", event);

  const sourceIp = new IPv4(event.requestContext.http.sourceIp);
  if (is_ip_valid(sourceIp) == false) {
    console.warn("Bad source IP", sourceIp);
    return bad_input("Bad source IP");
  }

  try {
    const res = await new Promise((resolve, _reject) => {
      return callback(event, context, resolve);
    }) as APIGatewayProxyResultV2;

    console.log("Got result", res);
    return res;
  } catch (e) {
    console.warn("Error during bot callback", e);
    return internal_error();
  }
}

export async function periodic(
  _event: APIGatewayProxyEventV2,
  _context: Context,
): Promise<APIGatewayProxyResultV2> {
  await bot.periodic();
  return {
    statusCode: 200,
  };
}

function is_ip_valid(ip: IPv4) {
  const ip_net = new IPv4CidrRange(ip, new IPv4Prefix(32n));
  const valid_subnets = ["149.154.160.0/20", "91.108.4.0/22"].map(
    IPv4CidrRange.fromCidr,
  );
  return valid_subnets.some((net) => ip_net.inside(net));
}

function bad_input(msg?: string): APIGatewayProxyResultV2 {
  return {
    body: msg,
    statusCode: 400,
  };
}

function internal_error(body?: string): APIGatewayProxyResultV2 {
  return {
    body,
    statusCode: 500,
  };
}
