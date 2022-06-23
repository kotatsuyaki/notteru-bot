import {
  Bot,
  Context,
  FrameworkAdapter,
  webhookCallback,
} from "https://deno.land/x/grammy@v1.8.3/mod.ts";
import {
  DOMParser,
  Element,
} from "https://deno.land/x/deno_dom@v0.1.31-alpha/deno-dom-wasm.ts";
import { DynamoDBDocument } from "https://esm.sh/@aws-sdk/lib-dynamodb@3.113.0";

interface Query {
  name: string;
  url: string;
  selector: string;
  filter_string: string;
  last_latest_output: string;
  not_fetched: boolean;
}

interface QueryCheckResult {
  updated_query: Query;
  is_first_fetch: boolean;
}

export class NotteruBot {
  bot: Bot;
  client: DynamoDBDocument;
  /** User ID of admin, used for verification prior to write operations */
  admin_id: number;
  /** Channel ID for notice messages */
  channel_id: number;

  constructor(
    bot: Bot,
    client: DynamoDBDocument,
    admin_id: number,
    channel_id: number,
  ) {
    this.client = client;
    this.bot = bot;
    this.admin_id = admin_id;
    this.channel_id = channel_id;

    this.bot.command("ping", this.on_ping.bind(this));
    this.bot.command("register", this.on_register.bind(this));
  }

  async start() {
    await this.bot.start();
  }

  webhook_callback(adaptor: FrameworkAdapter) {
    return webhookCallback(this.bot, adaptor);
  }

  async periodic() {
    console.log("Starting periodic check");
    const scan_output = await this.client.scan({
      TableName: "queries",
    });
    if (scan_output.Items == undefined) {
      console.log("Scan returns no items");
      return;
    } else {
      console.log("Scanned items", scan_output.Items);
    }

    const queries = scan_output.Items as Query[];

    console.log("Checking queries");
    const query_check_results = await Promise.all(
      queries.map((q) => this.check_is_query_changed(q)),
    );
    const updated_queries = query_check_results.filter((el) =>
      el != undefined
    ) as QueryCheckResult[];

    console.log("Updating queries", updated_queries);
    await Promise.all(
      updated_queries.map((qcr) => this.update_query(qcr)),
    );
  }

  /** Save the update query back */
  async update_query(qcr: QueryCheckResult) {
    const { is_first_fetch, updated_query: query } = qcr;

    if (is_first_fetch == false) {
      console.log(`Sending notify message for query with name ${query.name}`);
      await this.bot.api.sendMessage(
        this.channel_id,
        `<a href="${query.url}">【喜】${query.name} が載ってる</a>`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true,
        },
      );
    } else {
      console.log(
        `Not sending notify message for query with name ${query.name}, since it's the first fetch`,
      );
    }

    console.log(`Updating query with name ${query.name}`);
    await this.client.put({ TableName: "queries", Item: query });
    console.log(`Updated query with name ${query.name}`);
  }

  /** Check if the query has changed */
  async check_is_query_changed(
    query: Query,
  ): Promise<QueryCheckResult | undefined> {
    const res = await fetch(query.url);
    const text = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/html");
    if (doc == undefined) {
      console.warn(`Failed to parse html for query url ${query.url}`);
      return;
    }
    const elements = Array.from(
      doc.querySelectorAll(query.selector),
    ) as Element[];
    const inners: string[] = elements.map((el) => el.innerHTML);
    const filtered = inners.filter((s) => s.includes(query.filter_string));

    if (filtered.length == 0) {
      console.warn(
        `Query with name ${query.name} resulted in zero filtered elements`,
      );
      return;
    }
    const latest = filtered[0];

    if (latest !== query.last_latest_output) {
      console.log(`Query with name ${query.name} is updated`);
      return {
        is_first_fetch: query.not_fetched,
        updated_query: {
          ...query,
          not_fetched: false,
          last_latest_output: latest,
        },
      };
    } else {
      console.log(`Query with name ${query.name} is unchanged`);
      return;
    }
  }

  async on_ping(ctx: Context) {
    if (ctx.from?.id != this.admin_id) {
      console.log(`Pinged from ${ctx.from?.id}, not from admin id`);
      return;
    }
    console.log("Replying to ping");
    await ctx.reply("pong", { reply_to_message_id: ctx.message?.message_id });
  }

  async on_register(ctx: Context) {
    if (ctx.from?.id != this.admin_id) {
      console.log(`Register from ${ctx.from?.id}, not from admin id`);
      return;
    }

    const text_trimmed = ctx.msg?.text?.trim();
    const matches = text_trimmed?.match(/"[^"]*"/g);

    if (matches == undefined || matches.length !== 4) {
      await ctx.reply(
        'Bad command format. Quote the parameters with double quotes. For example, /register "name" "url" "selector" "filter word".',
      );
      return;
    }

    const [name, url, selector, filter_string] = matches.map((m) =>
      m.replace(/"/g, "")
    );

    const query: Query = {
      name,
      url,
      selector,
      filter_string,
      last_latest_output: "",
      not_fetched: true,
    };
    console.log(`Registering query ${JSON.stringify(query)}`);

    try {
      await this.client.put({
        TableName: "queries",
        Item: query,
      });
      await ctx.reply("Registered", {
        reply_to_message_id: ctx.message?.message_id,
      });
    } catch (e) {
      console.log("Failed to put query", e);
      await ctx.reply("Internal error", {
        reply_to_message_id: ctx.message?.message_id,
      });
    }
  }
}
