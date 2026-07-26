/**
 * Standalone test: Ollama/Gemma 4 translation quality for Bulgarian menu items.
 * No codebase dependencies — runs directly with `npx tsx`.
 *
 * Usage: npx tsx scratch/test-ollama-translation.ts
 */

const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL = "gemma4:latest";

// ── Sample Bulgarian menu items (real terms from the seed glossary) ──
const SAMPLE_TEXTS = [
  // Dish names
  "Шопска салата",
  "Кебапче",
  "Кюфте",
  "Мусака",
  "Баница",
  "Таратор",
  "Пълнени чушки с кайма и ориз",
  "Пилешка супа",
  "Свинско с кисело зеле",
  "Телешко варено",
  // Options / descriptors
  "Средно изпечено",
  "Добре изпечено",
  "Без лук",
  "С гарнитура картофи",
  "Домашен хляб",
  // Descriptive text
  "Крехко пилешко филе на скара с пресни зеленчуци и чеснов сос",
  "Традиционна българска салата от пресни домати, краставици, чушки и сирене",
] as const;

// ── Glossary: known Bulgarian → English terminology ──
const GLOSSARY: Record<string, string> = {
  кебапче: "kebapche",
  кюфте: "kyufte",
  мусака: "moussaka",
  баница: "banitsa",
  таратор: "tarator",
  шопска: "shopska",
  салата: "salad",
  чушки: "peppers",
  кайма: "minced meat",
  пилешко: "chicken",
  свинско: "pork",
  телешко: "veal",
  "кисело зеле": "sauerkraut",
  сирене: "white cheese",
  скара: "grill",
  чесън: "garlic",
  хляб: "bread",
  картофи: "potatoes",
  домати: "tomatoes",
  краставици: "cucumbers",
  лук: "onion",
  супа: "soup",
  гарнитура: "side dish",
  пресни: "fresh",
  зеленчуци: "vegetables",
  домашен: "homemade",
  традиционна: "traditional",
  българска: "Bulgarian",
};

// ── Prompt templates ──
const SYSTEM_DIRECT =
  "You are a professional menu translator. Translate the following Bulgarian menu items to English. Return ONLY the translations, one per line, in the exact same order. No explanations, no formatting, no markdown.";

const SYSTEM_GLOSSARY = `You are a professional menu translator. Translate the following Bulgarian menu items to English.
CRITICAL: Use these EXACT translations for the listed terms:
${Object.entries(GLOSSARY)
  .map(([bg, en]) => `- "${bg}" → "${en}"`)
  .join("\n")}

Return ONLY the translations, one per line, in the exact same order. No explanations, no markdown.`;

async function translate(
  texts: readonly string[],
  systemPrompt: string,
  label: string,
) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${"=".repeat(60)}\n`);

  const input = texts.join("\n");
  const prompt = `${systemPrompt}\n\n${input}`;

  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300_000); // 5 min for large models

  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        prompt,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 1024,
        },
      }),
    });

    const data = (await response.json()) as any;
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    const output = data.response || "";
    const lines = output
      .split("\n")
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0);

    // Print side-by-side comparison
    const maxBgLen = Math.max(...texts.map((t) => t.length));
    for (let i = 0; i < texts.length; i++) {
      const bg = texts[i].padEnd(maxBgLen);
      const en = lines[i] || "⚠ MISSING";
      const icon = lines[i] ? " " : "⚠";
      console.log(`  ${icon} ${bg}  →  ${en}`);
    }

    console.log(`\n  ⏱ ${elapsed}s | ${lines.length}/${texts.length} results`);
    if (data.eval_count) {
      console.log(
        `  📊 ${data.eval_count} tokens | ${data.eval_duration ? (data.eval_duration / 1e9).toFixed(1) + "s eval" : ""}`,
      );
    }
  } catch (err: any) {
    console.log(`\n  ❌ Failed: ${err.message || err}`);
    if (err.cause) console.log(`     Cause: ${err.cause.message || err.cause}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  console.log("🧪 Ollama Translation Test — Gemma 4");
  console.log(`   Model: ${MODEL}`);
  console.log(`   Texts: ${SAMPLE_TEXTS.length} Bulgarian menu items\n`);

  // Test 1: Direct translation (no glossary)
  await translate(
    SAMPLE_TEXTS,
    SYSTEM_DIRECT,
    "TEST 1: Direct Translation (no glossary)",
  );

  // Test 2: With glossary injection
  await translate(
    SAMPLE_TEXTS,
    SYSTEM_GLOSSARY,
    "TEST 2: With Glossary Injection",
  );

  // Test 3: Short phrases only (typical dish names)
  const short = SAMPLE_TEXTS.filter((t) => t.length < 30);
  await translate(
    short,
    SYSTEM_DIRECT,
    "TEST 3: Short Phrases Only (no glossary)",
  );

  console.log("\n✅ Done.\n");
}

main().catch(console.error);
