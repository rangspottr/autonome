import { uid, iso } from "./utils.js";

// Regex patterns
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_PATTERN = /(\+?1?\s?)?(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/g;
const DOLLAR_PATTERN = /\$[\d,]+(\.\d{1,2})?|\b\d+[\d,]*(\.\d{1,2})?\s*(dollars?|usd|k)\b/gi;

const URGENCY_KEYWORDS = ["urgent", "asap", "immediately", "critical", "emergency", "overdue", "past due", "late"];
const ACTION_KEYWORDS = {
  follow_up: ["follow up", "followup", "check in", "reach out", "touch base"],
  collect: ["collect", "payment", "invoice", "owe", "owes", "pay", "paid", "unpaid"],
  qualify: ["interested", "lead", "prospect", "potential client", "potential customer"],
  schedule: ["schedule", "meeting", "call", "appointment", "book"],
  escalate: ["escalate", "not responding", "no response", "ignored", "ghosted"],
};
const SENTIMENT_KEYWORDS = {
  positive: ["great", "excellent", "happy", "interested", "excited", "love", "perfect", "fantastic"],
  negative: ["angry", "frustrated", "upset", "disappointed", "terrible", "worst", "cancel"],
  urgent: URGENCY_KEYWORDS,
  neutral: [],
};

function detectSentiment(text) {
  const lower = text.toLowerCase();
  if (SENTIMENT_KEYWORDS.negative.some((k) => lower.includes(k))) return "negative";
  if (SENTIMENT_KEYWORDS.urgent.some((k) => lower.includes(k))) return "urgent";
  if (SENTIMENT_KEYWORDS.positive.some((k) => lower.includes(k))) return "positive";
  return "neutral";
}

function detectActions(text) {
  const lower = text.toLowerCase();
  const actions = [];
  for (const [action, keywords] of Object.entries(ACTION_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) {
      actions.push(action);
    }
  }
  return actions;
}

function extractDollarAmounts(text) {
  const amounts = [];
  const matches = text.matchAll(DOLLAR_PATTERN);
  for (const match of matches) {
    const raw = match[0].replace(/[$,\s]/g, "").replace(/k$/i, "000");
    const val = parseFloat(raw);
    if (!isNaN(val)) amounts.push(val);
  }
  return amounts;
}

export function parseText(text) {
  if (!text || typeof text !== "string") {
    return { contacts: [], intents: [], actions: [], sentiment: "neutral", amounts: [], isUrgent: false };
  }

  const emails = [...new Set((text.match(EMAIL_PATTERN) || []))];
  const phones = [...new Set((text.match(PHONE_PATTERN) || []).map((p) => p.trim()))];
  const amounts = extractDollarAmounts(text);
  const sentiment = detectSentiment(text);
  const actions = detectActions(text);
  const isUrgent = URGENCY_KEYWORDS.some((k) => text.toLowerCase().includes(k));

  // Extract names (capitalized words not at sentence start — rough heuristic)
  const namePattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g;
  const names = [...new Set((text.match(namePattern) || []))].filter(
    (n) => !["January","February","March","April","May","June","July","August","September","October","November","December"].includes(n)
  );

  const contacts = [];
  names.forEach((name) => {
    const emailForName = emails.find((e) => e.toLowerCase().includes(name.split(" ")[0].toLowerCase()));
    const phoneForName = phones[contacts.length] || null;
    contacts.push({
      id: uid(),
      name,
      email: emailForName || null,
      phone: phoneForName || null,
      type: "lead",
      createdAt: iso(),
      tags: [],
    });
  });

  emails.forEach((email) => {
    if (!contacts.some((c) => c.email === email)) {
      contacts.push({ id: uid(), name: email.split("@")[0], email, phone: null, type: "lead", createdAt: iso(), tags: [] });
    }
  });

  const intents = [];
  if (actions.includes("collect") && amounts.length > 0) {
    intents.push({ type: "invoice_collection", amount: amounts[0], description: "Payment collection needed" });
  }
  if (actions.includes("qualify")) {
    intents.push({ type: "lead_qualification", description: "New lead to qualify" });
  }
  if (actions.includes("follow_up")) {
    intents.push({ type: "deal_followup", description: "Follow-up action needed" });
  }
  if (actions.includes("schedule")) {
    intents.push({ type: "schedule_meeting", description: "Meeting to be scheduled" });
  }
  if (actions.includes("escalate") || isUrgent) {
    intents.push({ type: "escalation", description: "Escalation required" });
  }

  return { contacts, intents, actions, sentiment, amounts, isUrgent };
}

export async function parseTextWithAI(text, llmKey) {
  if (!llmKey) return null;
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": llmKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Extract business information from this text. Return JSON with: contacts (array of {name, email, phone, type}), intents (array of {type, description, amount?}), sentiment (positive/negative/neutral/urgent), actions (array of strings), isUrgent (boolean).\n\nText: ${text}`,
          },
        ],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const content = data.content?.[0]?.text || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error("AI parse error:", e);
  }
  return null;
}
