// parse-meal — turns a sentence like "3 eggs on sourdough with sriracha" into
// the same {items, totals} shape ../../calorie-tracker/parse.py produces, so it
// drops straight into the existing UI and the eval harness scores both the same
// way.
//
// The Anthropic key lives here and only here. It is read from the function's
// secrets at runtime and never reaches the client bundle — same reasoning as the
// service_role key in docs/supabase.md. The function also refuses unauthenticated
// callers (verify_jwt, below), because an open endpoint holding an API key is a
// stranger's free Claude account.
//
// Model: claude-sonnet-5 since 2026-09-22 (Haiku 4.5 before that). Measured at
// 10 runs a side on the same prompt: hard 20 16.1% -> 5.0% mean calorie error,
// easy 50 13.8% -> 13.0%. Haiku undercounted restaurant food in a way prompt
// rules couldn't fix. Cost is ~2.2x, about $0.006 a meal. evals/run.py --model
// still swaps the tier for comparisons; only service_role may override it.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "jsr:@supabase/supabase-js@2";

const DEFAULT_MODEL = "claude-sonnet-5";
const MACROS = ["calories", "protein", "carbs", "fat"] as const;

// Strict tool use rather than output_config.format: the raw JSON shape is
// identical across SDK versions and needs no helper subpath import, which
// matters because this file cannot be run locally (no Deno, no Docker on the
// build machine) and first execution is on deploy.
const LOG_MEAL_TOOL = {
  name: "log_meal",
  description: "Record the foods in a meal description with their nutrition.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        description: "One entry per distinct food or drink in the sentence.",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description:
                "Clean display name, corrected for typos. 'protien bar' -> 'protein bar'.",
            },
            qty: {
              type: "string",
              description:
                "Human-readable amount as it should display, e.g. '3 large', '1 cup', '2 slices'. Empty string if genuinely unstated.",
            },
            search_term: {
              type: "string",
              description:
                "Two or three words to look this up in a food database. Include the brand or chain when there is one: 'chipotle chicken burrito bowl', 'quest protein bar'.",
            },
            calories: { type: "number" },
            protein: { type: "number", description: "grams" },
            carbs: { type: "number", description: "grams" },
            fat: { type: "number", description: "grams" },
            confidence: {
              type: "string",
              enum: ["high", "medium", "low"],
              description:
                "high = standard item with a stated amount; medium = amount assumed from a typical serving; low = genuinely unknowable, e.g. an unspecified homemade dish.",
            },
            menu: {
              type: "array",
              description:
                "Only when a RESTAURANT MENU is provided and this item comes from it: the menu lines that make up this item and how many of each. Empty array otherwise.",
              items: {
                type: "object",
                properties: {
                  line: { type: "integer", description: "The L-number of the menu line." },
                  count: { type: "number", description: "How many of that line. 2 for double, 0.5 for half." },
                },
                required: ["line", "count"],
                additionalProperties: false,
              },
            },
            food_line: {
              type: "integer",
              description:
                "Only when a FOOD DATABASE is provided: the F-number of the row that IS this food as eaten. 0 when none fits or no list was given.",
            },
            grams: {
              type: "number",
              description:
                "Edible weight eaten, in grams, as served (cooked weight for cooked food). Your best estimate; always fill it.",
            },
          },
          required: [
            "name",
            "qty",
            "search_term",
            "calories",
            "protein",
            "carbs",
            "fat",
            "confidence",
            "menu",
            "food_line",
            "grams",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["items"],
    additionalProperties: false,
  },
} as const;

const SYSTEM = `You estimate nutrition from short, casual meal descriptions.

Break the sentence into the foods a person would actually want to see listed, and
give calories, protein, carbs and fat for the amount described.

Rules that matter:
- Read past typos and run-together words. "3 eggz", "peanutbutter", "protien bar"
  are eggs, peanut butter, and a protein bar.
- Word-numbers are numbers. "half a dozen" is 6, "a couple" is 2.
- When no amount is stated, assume one typical serving and say so by setting
  confidence to "medium" — do not refuse and do not return zeros. "a bowl of
  oatmeal" is about a cup cooked.
- For chains, use that chain's actual published nutrition. A Chipotle chicken
  burrito bowl is not a generic burrito bowl.
- Most restaurants are not chains and publish nothing, and a serving there is a
  restaurant serving. Kitchens cook with far more butter, oil, cheese and cream
  than a home cook does, and plate more of it: a restaurant portion is commonly
  1.5 to 2 times the home or USDA serving of the same name. Price the dish as a
  kitchen makes it, not as a nutrition label averages it.
- Restaurant sizing is only for restaurant food. When the sentence gives no sign
  the food came from a restaurant, takeout, delivery, a venue or a chain, it was
  made or served at home: portion it as a standard home or package serving, and
  read size words as modestly above that, not as a restaurant plate.
- A named dish is that dish, not its category. "Carbonara" is egg, hard cheese
  and guanciale, not "pasta". "Poutine" is fries under curds and gravy, not
  fries. If a dish has a name, price what that name actually contains.
- Count what the dish arrives with. Moules come with frites, a curry comes with
  rice or naan, a diner omelette comes with hash browns and toast. Those are
  part of the item, not extras the person would have listed separately.
- Condiments and small extras still count. Sriracha, ketchup, a splash of milk.
- Combine nothing: if the sentence names three foods, return three items. One
  exception — restatement. When two names in the same sentence are the same food
  said twice ("a cheeseburger" and, later, "the burger"), that is one item. A
  second helping is not restatement and does add: "a slice, then another slice"
  is two slices.
- Zero-calorie items (black coffee, water, diet soda) are real items with zeros,
  not omissions.
- If something is genuinely unknowable — an unspecified homemade dish — give your
  best single estimate and set confidence to "low". Never return an empty list.

Estimate the amount eaten, not the package size, unless the sentence says the
whole package. Round to whole calories and one decimal for grams.

The most common failure in this task is underestimating food that came out of a
restaurant kitchen. When two portions are both plausible for a restaurant dish,
do not reflexively take the smaller one — take the one that matches where the
food came from.`;

type Item = {
  name: string;
  qty: string;
  search_term: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: "high" | "medium" | "low";
  menu?: { line: number; count: number }[];
  food_line?: number;
  grams?: number;
};

// ---------- restaurant menus ----------
//
// For chain food, the chain's own published numbers beat any estimate, and the
// 2026-09-21 A/B showed Haiku's arithmetic can't be trusted to add parts up
// (egg whites at 60 kcal each, a 5,005 kcal half-steak). So when the sentence
// names a chain we have, the model gets that chain's menu and only *picks
// lines and counts*; the numbers are computed here from public.restaurant_items.

type MenuRow = {
  chain_slug: string;
  category: string;
  item: string;
  size: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

const MAX_CHAINS = 2;
let chainCache: { at: number; rows: { slug: string; name: string; aliases: string[] }[] } | null =
  null;

// Aliases that are also ordinary words. "chipotle mayo", "took the subway",
// "three chilis", "candy canes", "a glass of cava", "in and out of meetings".
// These only count with restaurant context around them.
const AMBIGUOUS = new Set([
  "chipotle", "subway", "sonic", "chilis", "chili's", "canes", "cane's", "cava",
  "in and out", "in n out", "firehouse", "jj", "dominos", "domino's", "panda",
  "wawa", "sheetz", "potbelly", "noodles",
]);
const CONTEXT_BEFORE = "(?:at|from|to|got|get|ordered|grabbed|hit|went to|stopped at|drive thru|drive through)\\s+(?:the\\s+|a\\s+)?";
// ...or an order word within four words after: "chipotle chicken bowl",
// "canes box combo", "panda orange chicken", "in n out double double".
const CONTEXT_AFTER = "(?:'s|s)?(?:\\s+[a-z0-9']+){0,4}?\\s+(?:bowls?|burritos?|order|run|drive thru|drive through|meal|combo|box|footlong|sub|tacos?|quesadilla|double double|animal style|orange chicken|chow mein|fried rice|plate|bigger plate|caniac|nuggets|fries|lemonade|limeade|slush|pizza|slices?|pita|queso|guac)";

function normalise(s: string) {
  return s.toLowerCase().replace(/[’‘`]/g, "'");
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// deno-lint-ignore no-explicit-any
async function findChains(db: any, text: string) {
  if (!chainCache || Date.now() - chainCache.at > 10 * 60 * 1000) {
    const { data } = await db.from("restaurant_chains").select("slug, name, aliases");
    chainCache = { at: Date.now(), rows: data ?? [] };
  }
  const t = normalise(text);
  const bare = t.replace(/[^a-z0-9 ]/g, "");
  const hits: { slug: string; name: string; at: number }[] = [];
  for (const c of chainCache.rows) {
    let at = -1;
    for (const a of c.aliases) {
      const e = escapeRe(a);
      const re = AMBIGUOUS.has(a)
        ? new RegExp(`(?:(^|[^a-z0-9])${CONTEXT_BEFORE}${e}($|[^a-z0-9])|(^|[^a-z0-9])${e}${CONTEXT_AFTER}($|[^a-z0-9])|^${e}(?:'s)?\\s*(?:[-,:]|$))`)
        : new RegExp(`(^|[^a-z0-9])${e}($|[^a-z0-9])`);
      const m = re.exec(t) ?? re.exec(bare);
      if (m && (at < 0 || m.index < at)) at = m.index;
    }
    if (at >= 0) hits.push({ slug: c.slug, name: c.name, at });
  }
  return hits.sort((a, b) => a.at - b.at).slice(0, MAX_CHAINS);
}

// Whole menus go in when small. Big ones (Starbucks is 2,000+ rows, every size
// and milk) are cut to the lines sharing a word with the sentence, or the
// prompt balloons to ~30k tokens a parse.
const MENU_WHOLE = 250;
// 300 sent a "starbucks grande latte" parse 15.8k input tokens (2026-09-21);
// rows are ranked by words shared with the sentence, so 150 keeps every line
// that could plausibly match and halves the prompt.
const MENU_CAP = 150;
const STOP = new Set(["and", "the", "with", "from", "had", "got", "for", "some", "one", "two",
  "large", "small", "medium", "regular", "meal", "combo", "order", "plus", "then", "that"]);

function stems(s: string) {
  return normalise(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w))
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

function trimMenu(rows: MenuRow[], text: string, chainNames: string[]) {
  if (rows.length <= MENU_WHOLE) return rows;
  const skip = new Set(chainNames.flatMap(stems));
  const want = new Set(stems(text).filter((w) => !skip.has(w)));
  const scored = rows
    .map((r) => {
      const words = new Set(stems(`${r.item} ${r.size} ${r.category}`));
      let score = 0;
      for (const w of want) if (words.has(w)) score++;
      return { r, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, MENU_CAP).map((x) => x.r);
}

// deno-lint-ignore no-explicit-any
async function loadMenu(db: any, chains: { slug: string; name: string }[], text: string) {
  const rows: MenuRow[] = [];
  for (const c of chains) {
    // PostgREST caps a response at 1,000 rows, so page: a silent truncation
    // would drop the back half of Starbucks' menu with no error at all.
    const all: MenuRow[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await db
        .from("restaurant_items")
        .select("chain_slug, category, item, size, calories, protein, carbs, fat")
        .eq("chain_slug", c.slug)
        .order("category")
        .order("item")
        .order("size")
        .range(from, from + 999);
      all.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    rows.push(...trimMenu(all, text, [c.name]));
  }
  const names = Object.fromEntries(chains.map((c) => [c.slug, c.name]));
  const listing = rows
    .map((r, i) =>
      `L${i + 1} | ${names[r.chain_slug]} | ${r.category} | ${r.item}${r.size ? ` (${r.size})` : ""} | ${Math.round(Number(r.calories))} cal`
    )
    .join("\n");
  return { rows, text: listing };
}

const MENU_RULES = `RESTAURANT MENU
The sentence names a chain whose official published nutrition is listed below.
For every food or drink that came from that chain, fill "menu" with the lines
that make it up and a count for each; those numbers replace your estimate.
- Pick the line that matches what was ordered, including size. When no size is
  said, take the regular/default one (a medium, or the line with no size).
- Build-your-own orders (bowls, burritos, salads, pizzas, burgers listed as
  parts) are several lines: one per component named, plus the standard
  components that item always comes with. "Double" is count 2, "light" 0.5.
- Counts are per what was ordered. One burger or sandwich has one bun or one
  bread, whatever else is doubled. "Little", "single", "junior" and "small"
  burgers are one patty (and one cheese slice for a cheeseburger); only the
  chain's standard or "double" burger gets two.
- A combo or meal is its parts: the entree, the side and the drink.
- Only for food that came from the chain. A chain's name can also be an
  ordinary word ("chipotle mayo" is a sauce); food the person made or got
  elsewhere gets an empty "menu".
- If nothing on the menu matches, leave "menu" empty and estimate as usual.
Still fill calories/protein/carbs/fat with your own estimate either way.`;

// ---------- generic foods (resolve: "foods") ----------
//
// Same idea as the menus, for everyday food: the model picks a USDA row and
// says how many grams, and the calories come from the row. Not resolve_food's
// single best guess, which is often the wrong variant for numbers ('white
// rice' -> glutinous, 'chicken breast' -> deli roll). food_candidates returns
// a short list per food word, and the model picks the row or none.

type FoodRow = {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

// Words that never name a food on their own; each one would pull ~15 junk
// rows ("bowl" -> chili bowls, "grilled" -> grilled steak).
const FOOD_STOP = new Set([
  "bowl", "cup", "cups", "plate", "glass", "bag", "box", "container", "serving", "servings",
  "piece", "pieces", "slice", "slices", "handful", "scoop", "tablespoon", "tbsp", "teaspoon",
  "tsp", "ounce", "ounces", "gram", "grams", "pound", "lbs", "big", "little", "few", "bunch",
  "grilled", "fried", "baked", "roasted", "steamed", "boiled", "scrambled", "toasted",
  "homemade", "leftover", "breakfast", "lunch", "dinner", "snack", "ate", "eat", "was",
  "about", "like", "maybe", "half", "dozen", "couple", "worth", "top", "side", "extra",
  "after", "before", "morning", "night", "today", "place", "went", "made", "just", "really",
  "pretty", "hard", "good", "day", "time", "gym", "game", "office", "work", "friend", "mom",
  "dad", "roommate", "girlfriend", "boyfriend", "wife", "husband", "split", "shared",
]);

function foodWords(text: string, skip: string[]) {
  const out = new Set<string>();
  const drop = new Set(skip.flatMap(stems));
  for (const w0 of normalise(text).split(/[^a-z]+/)) {
    if (w0.length < 3 || STOP.has(w0) || FOOD_STOP.has(w0)) continue;
    const w = w0.endsWith("ies") ? w0.slice(0, -3) + "y"
      : w0.endsWith("oes") ? w0.slice(0, -2)
      : w0.length > 3 && w0.endsWith("s") && !w0.endsWith("ss") ? w0.slice(0, -1)
      : w0;
    if (!drop.has(w) && !FOOD_STOP.has(w)) out.add(w);
  }
  return [...out].slice(0, 8);
}

// deno-lint-ignore no-explicit-any
async function loadFoods(db: any, text: string, chainNames: string[]) {
  const words = foodWords(text, chainNames);
  if (!words.length) return { rows: [] as FoodRow[], text: "" };
  const { data } = await db.rpc("food_candidates", { words, per_word: 15, max_rows: 80 });
  const rows: FoodRow[] = data ?? [];
  const listing = rows
    .map((r, i) => `F${i + 1} | ${r.name} | ${Math.round(Number(r.calories))} cal per 100 g`)
    .join("\n");
  return { rows, text: listing };
}

const FOOD_RULES = `FOOD DATABASE (USDA, per 100 g)
Rows from a nutrition database that may match foods in the sentence. For each
item that is plainly one of these foods, set "food_line" to its F-number and
"grams" to the edible weight eaten; the database numbers replace your estimate.
- The row must be the food as eaten: cooked vs raw (rice and pasta are eaten
  cooked), plain vs flavored, whole vs skim, the right cut. A near miss is
  worse than no match: if the right variant isn't listed, use 0.
- One row per item. A mixed or named dish (a burrito, a stir fry, lasagna), or
  anything from a restaurant kitchen, gets 0 unless a row is that exact dish;
  estimate it as usual.
- grams is the weight of what was eaten, using standard household weights for
  counts and cups, and the same portion judgment you'd use for calories.
Still fill calories/protein/carbs/fat with your own estimate either way.`;

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

// Supabase's verify_jwt only proves the token was signed by this project — and
// the anon key is a valid project JWT that ships inside the app bundle, so
// verify_jwt alone leaves this endpoint open to anyone who unzips the APK. Read
// the role claim and require a real session. No signature check here on purpose:
// the platform already did it before this code ran.
function callerClaims(authHeader: string): { role: string | null; sub: string | null } {
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const payload = token.split(".")[1];
  if (!payload) return { role: null, sub: null };
  try {
    const pad = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(pad + "=".repeat((4 - (pad.length % 4)) % 4)));
    return { role: claims.role ?? null, sub: claims.sub ?? null };
  } catch {
    return { role: null, sub: null };
  }
}

// Record what the call cost, in tokens, against the user who made it.
//
// Written here rather than from the client for the same reason the API key is
// here: a client that reports its own usage is a client that can decline to.
// `ai_usage` is deliberately read-only to its owner (db/schema.sql) and the
// service_role key bypasses that, which is exactly the split we want —
// Phase 6's free-tier limits (5 AI logs/week) will count these rows, so they
// have to be unforgeable.
//
// Three deliberate choices:
//   - It never fails the request. A meal that parsed correctly must still be
//     returned if the metering insert breaks; the user's food is not hostage
//     to our accounting.
//   - Eval runs are not metered. The harness calls with the service_role key,
//     which has no `sub` — those tokens are Danny's testing, not a user's quota.
//   - It runs after the response is built, via waitUntil where the runtime
//     offers it, so metering never shows up as latency in the add-food modal.
function meterUsage(
  sub: string | null,
  role: string | null,
  model: string,
  usage: { input_tokens: number; output_tokens: number },
) {
  if (role !== "authenticated" || !sub) return;

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) return;

  const write = (async () => {
    try {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
      await admin.from("ai_usage").insert({
        user_id: sub,
        kind: "parse",
        model,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
      });
    } catch {
      // Accounting is not worth a failed meal. Swallow it.
    }
  })();

  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  if (typeof runtime?.waitUntil === "function") runtime.waitUntil(write);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json({ error: "POST only" }, 405, origin);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const { role, sub } = callerClaims(authHeader);
  if (role !== "authenticated" && role !== "service_role") {
    // 'anon' lands here, which is the point.
    return json({ error: "Sign in to use this." }, 401, origin);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    // Deployed without the secret set. Say so plainly rather than 500ing with
    // an SDK stack trace — this is the single most likely first-run failure.
    // The visible names make a *misnamed* secret diagnosable without guessing;
    // that is not hypothetical, it cost a round trip on 2026-09-13 when the
    // secret got saved as "Snack-Track" (the project name in the Name field).
    const seen = Object.keys(Deno.env.toObject()).filter(
      (k) => !/KEY|SECRET|TOKEN|PASSWORD/i.test(k) || /ANTHROPIC|CLAUDE/i.test(k),
    );
    return json(
      {
        error:
          "ANTHROPIC_API_KEY is not set on this function. Add it under Project Settings -> Edge Functions -> Secrets.",
        env_names_visible: seen.sort(),
      },
      500,
      origin,
    );
  }

  let body: {
    text?: string;
    meal?: string;
    resolve?: string;
    model?: string;
    debug?: boolean;
    /** false = skip restaurant menus, for A/B-ing them in evals/run.py. */
    menus?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body must be JSON." }, 400, origin);
  }

  const text = (body.text ?? "").trim();
  if (!text) {
    return json({ error: "Nothing to parse: 'text' is required." }, 400, origin);
  }
  const meal = body.meal ?? "snacks";
  // "estimate" — Claude's numbers stand, the database only attaches provenance.
  // "db"       — a confident database match overrides Claude's numbers.
  // "none"     — skip the lookup entirely.
  // "foods"    — the model picks a USDA row + grams and the row's numbers stand.
  const resolveMode = body.resolve ?? "estimate";
  // Only the eval harness (service_role) may pick the model. A signed-in user
  // choosing Opus on our key is a cost hole, not a feature.
  const model = role === "service_role" && body.model ? body.model : DEFAULT_MODEL;

  // An API key created at the org level rather than inside a workspace is not
  // scoped to one, and the Messages API then requires the workspace to be named
  // explicitly. A workspace-scoped key needs none of this — this is the escape
  // hatch for a key that already exists.
  const workspaceId = Deno.env.get("ANTHROPIC_WORKSPACE_ID");

  // Identify the stored key without revealing it: a short SHA-256 prefix can be
  // compared against the same hash of the local .env.local value, which settles
  // "is the secret the key I think it is" in one call instead of guessing.
  // service_role only — a signed-in user has no business asking.
  if (body.debug === true && role === "service_role") {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(apiKey),
    );
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 12);
    return json(
      {
        debug: {
          key_length: apiKey.length,
          sha256_prefix: hex,
          starts_with_sk_ant_api: apiKey.startsWith("sk-ant-api"),
          has_surrounding_whitespace: apiKey !== apiKey.trim(),
          has_internal_whitespace: /\s/.test(apiKey.trim()),
          workspace_id_set: Boolean(workspaceId),
        },
      },
      200,
      origin,
    );
  }

  const anthropic = new Anthropic({
    apiKey,
    ...(workspaceId
      ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } }
      : {}),
  });

  // Caller's own JWT, so RLS applies exactly as it does in the app. Shared by
  // the menu lookup here and resolve_food below.
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  let menu: { rows: MenuRow[]; text: string } = { rows: [], text: "" };
  let chains: { slug: string; name: string }[] = [];
  if (body.menus !== false) {
    try {
      chains = await findChains(db, text);
      if (chains.length) menu = await loadMenu(db, chains, text);
    } catch {
      // A menu lookup failure costs accuracy, never the parse.
    }
  }

  let foods: { rows: FoodRow[]; text: string } = { rows: [], text: "" };
  if (resolveMode === "foods") {
    try {
      foods = await loadFoods(db, text, chains.map((c) => c.name));
    } catch {
      // A lookup failure costs accuracy, never the parse.
    }
  }

  const system = [{ type: "text" as const, text: SYSTEM }];
  if (menu.rows.length) system.push({ type: "text", text: `${MENU_RULES}\n\n${menu.text}` });
  if (foods.rows.length) system.push({ type: "text", text: `${FOOD_RULES}\n\n${foods.text}` });

  let response;
  try {
    response = await anthropic.messages.create({
      model,
      max_tokens: 2000,
      system,
      tools: [LOG_MEAL_TOOL],
      tool_choice: { type: "tool", name: "log_meal" },
      messages: [{ role: "user", content: text }],
    });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 502;
    return json(
      { error: `Claude call failed: ${(e as Error).message}` },
      status === 401 || status === 400 ? 500 : 502,
      origin,
    );
  }

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return json(
      { error: "Claude returned no structured result.", stop_reason: response.stop_reason },
      502,
      origin,
    );
  }

  // Never string-match a serialized tool input — escaping varies by model.
  const parsed = toolUse.input as { items: Item[] };
  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];

  // Resolve against `foods` using the caller's own JWT, so RLS and the
  // authenticated-only grant on resolve_food apply exactly as they do in the app.
  const items = [];

  for (const it of rawItems) {
    let source = "estimate";
    let foodId: string | null = null;
    let matchedName: string | null = null;
    let macros = {
      calories: it.calories,
      protein: it.protein,
      carbs: it.carbs,
      fat: it.fat,
    };

    // Menu lines win outright: they are the chain's published numbers, summed
    // here rather than by the model. Any invalid line voids the whole pick, so
    // a half-understood order falls back to the estimate instead of silently
    // dropping a component.
    const picks = (it.menu ?? []).filter((p) => p && p.count > 0);
    const valid = picks.length > 0 &&
      picks.every((p) => Number.isInteger(p.line) && p.line >= 1 && p.line <= menu.rows.length && p.count <= 20);
    if (valid) {
      const sum = { calories: 0, protein: 0, carbs: 0, fat: 0 };
      for (const p of picks) {
        const r = menu.rows[p.line - 1];
        for (const k of MACROS) sum[k] += Number(r[k]) * p.count;
      }
      macros = sum;
      source = "restaurant";
      matchedName = picks
        .map((p) => {
          const r = menu.rows[p.line - 1];
          const label = `${r.item}${r.size ? ` (${r.size})` : ""}`;
          return p.count === 1 ? label : `${p.count}x ${label}`;
        })
        .join(" + ");
    }

    // A picked USDA row times the grams eaten. Guarded both ways: a line that
    // doesn't exist, or a result more than 3x off the model's own estimate,
    // means a misread row or a unit slip, and the estimate is the safer number.
    let foodRejected = false;
    if (source === "estimate" && foods.rows.length && it.food_line && it.food_line > 0) {
      const row = foods.rows[it.food_line - 1];
      const g = Number(it.grams);
      if (row && g > 0 && g <= 3000) {
        const f = g / 100;
        const cand = {
          calories: Number(row.calories) * f,
          protein: Number(row.protein) * f,
          carbs: Number(row.carbs) * f,
          fat: Number(row.fat) * f,
        };
        const ratio = it.calories > 0 ? cand.calories / it.calories : 1;
        if (ratio >= 1 / 3 && ratio <= 3) {
          macros = cand;
          source = "database";
          foodId = row.id;
          matchedName = `${row.name} (${Math.round(g)} g)`;
        } else {
          foodRejected = true;
        }
      }
    }

    if (source === "estimate" && resolveMode !== "none" && resolveMode !== "foods" && it.search_term) {
      try {
        const supabase = db;
        // resolve_food, not search_foods: search is built for recall and a
        // human picking from a list, and its top hit is wrong often enough to
        // be dangerous here (2026-09-14: 'apple' -> PINEAPPLE SALSA, 'chicken'
        // -> Fat chicken, 'banana' -> banana pepper). resolve_food answers the
        // different question "which single row IS this", prefers whole foods,
        // and returns nothing when it is not confident.
        const { data } = await supabase.rpc("resolve_food", { q: it.search_term });
        const hit = data?.[0];
        if (hit) {
          foodId = hit.id;
          matchedName = hit.brand ? `${hit.brand} ${hit.name}` : hit.name;
          source = "database";
          if (resolveMode === "db") {
            // Claude's calorie estimate divided by the row's per-serving
            // calories is how many servings it thinks were eaten; scale the
            // row's macros by that rather than trusting either alone.
            const per = Number(hit.calories) || 0;
            const servings = per > 0 ? it.calories / per : 1;
            macros = {
              calories: round1(per * servings),
              protein: round1(Number(hit.protein) * servings),
              carbs: round1(Number(hit.carbs) * servings),
              fat: round1(Number(hit.fat) * servings),
            };
          }
        }
      } catch {
        // A lookup failure must not lose the parse — fall through on the estimate.
      }
    }

    items.push({
      name: it.name,
      qty: it.qty ?? "",
      calories: round1(macros.calories),
      protein: round1(macros.protein),
      carbs: round1(macros.carbs),
      fat: round1(macros.fat),
      source,
      confidence: source === "restaurant" ? "high" : it.confidence,
      food_id: foodId,
      matched_name: matchedName,
      note: source === "restaurant" ? "" : it.confidence === "low" ? "rough estimate" : "",
      // What the model itself guessed, kept so evals can measure how far the
      // menu moved it. Not shown in the app.
      ...(source === "restaurant"
        ? { estimate_calories: round1(it.calories), menu_lines: picks }
        : {}),
      ...(resolveMode === "foods"
        ? { estimate_calories: round1(it.calories), grams: it.grams, food_rejected: foodRejected }
        : {}),
    });
  }

  const totals = Object.fromEntries(
    MACROS.map((k) => [k, round1(items.reduce((s, i) => s + (i[k] as number), 0))]),
  );

  meterUsage(sub, role, model, response.usage);

  return json(
    {
      items,
      totals,
      meal,
      questions: [],
      chains: chains.map((c) => c.name),
      model,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    },
    200,
    origin,
  );
});
