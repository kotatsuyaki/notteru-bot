import {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from "https://deno.land/x/lambda@1.22.3/mod.ts";
import {
  Bot,
  FrameworkAdapter,
  webhookCallback,
} from "https://deno.land/x/grammy@v1.8.3/mod.ts";
import {
  IPv4,
  IPv4CidrRange,
  IPv4Prefix,
} from "https://deno.land/x/ip_num@v1.4.0/index.ts";

console.log("Initializing bot");

// const channel_id = Deno.env.get("CHANNEL_ID")!;
const bot_token = Deno.env.get("BOT_TOKEN")!;
const lambda_version = Deno.env.get("AWS_LAMBDA_FUNCTION_VERSION");
const bot = new Bot(bot_token);

bot.command("ping", async (ctx) => {
  await ctx.reply(`pong from lambda version ${lambda_version}`, {
    reply_to_message_id: ctx.msg.message_id,
  });
});

const lambdaAdaptor: FrameworkAdapter = (
  event: APIGatewayProxyEventV2,
  _context: Context,
  callback,
) => ({
  update: JSON.parse(event.body!),
  end: () => callback(null, { statusCode: 200 }),
  respond: (json: string) => callback(null, { statusCode: 200, body: json }),
});
const callback = webhookCallback(bot, lambdaAdaptor);

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
