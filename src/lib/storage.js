import { deepClone } from "./utils.js";

export const KEY = "autonome-v3";

export const BLANK = {
  cfg: {
    name: "",
    type: "",
    ok: false,
    at: null,
    autoExec: true,
    lastCycle: null,
    lastBriefing: null,
    riskLimits: {
      maxAutoSpend: 500,
      refundThreshold: 100,
      approvalAbove: 5000,
      dailyEmailLimit: 50,
    },
    keys: { stripe: null, gmail: null, twilio: null, llm: null },
  },
  contacts: [],
  txns: [],
  tasks: [],
  assets: [],
  events: [],
  deals: [],
  campaigns: [],
  agentQueue: [],
  memory: [],
  audit: [],
  outcomes: {
    collected: 0,
    dealsClosed: 0,
    dealsProgressed: 0,
    emailsSent: 0,
    leadsQualified: 0,
    tasksAuto: 0,
    saved: 0,
  },
  workflows: [],
  knowledge: [],
  log: [],
  sent: [],
};

export async function dbLoad() {
  try {
    if (window.storage) {
      const result = await window.storage.get(KEY);
      if (result && result.value) {
        const parsed = JSON.parse(result.value);
        return {
          ...BLANK,
          ...parsed,
          cfg: {
            ...BLANK.cfg,
            ...(parsed.cfg || {}),
            riskLimits: {
              ...BLANK.cfg.riskLimits,
              ...(parsed.cfg?.riskLimits || {}),
            },
            keys: { ...BLANK.cfg.keys, ...(parsed.cfg?.keys || {}) },
          },
          outcomes: { ...BLANK.outcomes, ...(parsed.outcomes || {}) },
        };
      }
    }
  } catch (e) {
    console.error("dbLoad error:", e);
  }
  return deepClone(BLANK);
}

export async function dbSave(data) {
  try {
    if (window.storage) {
      await window.storage.set(KEY, JSON.stringify(data));
    }
  } catch (e) {
    console.error("dbSave error:", e);
  }
}
