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
// Model: claude-haiku-4-5. Danny's call 2026-09-13. The parse is reading
// comprehension over one short sentence, which is what the baseline was actually
// bad at (typos 61.0% error, word-numbers 56.8%, restaurant items 36.4%) while
// its nutrition table was fine (3.8-4.3% on explicit-quantity meals). Whether
// Haiku is enough is a measured question, not an assumed one — evals/run.py
// scores it against the 19.8% baseline and --model swaps the tier.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "jsr:@supabase/supabase-js@2";

const DEFAULT_MODEL = "claude-haiku-4-5";
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
            basis: {
              type: "string",
              description:
                "The calorie arithmetic, written before the numbers: each part with its calories, then the sum. '8 oz cooked patty 580 + brioche bun 300 + cheddar 110 + fries 450 = 1440', '2 large eggs 144 + 1 tsp butter 34 = 178'. A part the dish arrives with (fries, rice, toast) is a part here. For a chain item, the basis is just its published figure: 'McDonald''s published 300'. For a simple food or a drink, do not break it into ingredients; the basis is one typical serving and its calories: '16 oz oat milk latte 190', 'a big handful of pretzels, 2 oz 220'. The calories field must equal this sum.",
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
          },
          required: [
            "name",
            "qty",
            "search_term",
            "basis",
            "calories",
            "protein",
            "carbs",
            "fat",
            "confidence",
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
- A named dish is that dish, not its category. "Carbonara" is egg, hard cheese
  and guanciale, not "pasta". "Poutine" is fries under curds and gravy, not
  fries. If a dish has a name, price what that name actually contains.
- If you know the named restaurant, use what you know about it: what kind of
  place it is and how it serves the dish. A steakhouse is not a diner.
- Count what the dish arrives with. Moules come with frites, a curry comes with
  rice or naan, a diner omelette comes with hash browns and toast, and a
  sit-down restaurant's burger or sandwich comes with fries. Those are part of
  the item, not extras the person would have listed separately.
- A burger is priced by its patty. A fast-food patty is 2 to 4 oz; a sit-down
  restaurant's is 6 to 8 oz; a steakhouse's or a menu's signature burger is
  often 10 oz to a pound raw (about 700 to 1100 kcal of cooked beef alone) of fatty, dry-aged or ground-steak beef with cheese on
  a brioche bun. The same goes for any dish a menu names as its house or
  premium version: it is the big one.
- Build a restaurant main from its parts rather than recalling one number for
  its name: the weight of the protein, the bread or starch, the cheese and fat,
  and the side it arrives with, each with its own calories in basis, then add them up. A remembered number for a
  dish name is usually the lightest version of it.
- Condiments and small extras still count. Sriracha, ketchup, a splash of milk.
- Combine nothing: if the sentence names three foods, return three items. One
  exception — restatement. When two names in the same sentence are the same food
  said twice ("a cheeseburger" and, later, "the burger"), that is one item.
  That includes a general name listed beside a specific one for the same
  course: "the bread basket" and "sourdough", or "dessert" and "tiramisu", in
  one list are one bread and one dessert — the specific name says what it was.
  Tables get one bread service, not two: a named bread and "bread service" or\n  "the bread basket" at the same meal are one item. A second helping is not restatement
  and does add: "a slice, then another slice" is two slices.
- Zero-calorie items (black coffee, water, diet soda) are real items with zeros,
  not omissions.
- If something is genuinely unknowable — an unspecified homemade dish — give your
  best single estimate and set confidence to "low". Never return an empty list.

Before returning, reread your item list for two entries that are one food named\ntwice, and merge them.\n\nEstimate the amount eaten, not the package size, unless the sentence says the
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
};

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
  const resolveMode = body.resolve ?? "estimate";
  const model = body.model ?? DEFAULT_MODEL;

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

  let response;
  try {
    response = await anthropic.messages.create({
      model,
      max_tokens: 2000,
      system: SYSTEM,
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

    if (resolveMode !== "none" && it.search_term) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } },
        );
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
      confidence: it.confidence,
      food_id: foodId,
      matched_name: matchedName,
      note: it.confidence === "low" ? "rough estimate" : "",
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
