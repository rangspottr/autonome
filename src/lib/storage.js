import { deepClone } from "./utils.js";

export const KEY = "autonome-v3";

let _storageWarning = null;

export function getStorageWarning() {
  return _storageWarning;
}

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
  // Note: invoices in txns should include a contactId field to link to db.contacts
};

export async function dbLoad() {
  // Try window.storage (embedded environments)
  try {
    if (window.storage) {
      const result = await window.storage.get(KEY);
      if (result && result.value) {
        const parsed = JSON.parse(result.value);
        _storageWarning = null;
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
    console.error("dbLoad window.storage error:", e);
  }

  // Fall back to localStorage
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      _storageWarning = null;
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
    _storageWarning = null;
  } catch (e) {
    console.error("dbLoad localStorage error:", e);
    _storageWarning = "Storage unavailable — data will not persist across sessions.";
  }

  return deepClone(BLANK);
}

export async function dbSave(data) {
  let saved = false;

  // Try window.storage first
  try {
    if (window.storage) {
      await window.storage.set(KEY, JSON.stringify(data));
      saved = true;
    }
  } catch (e) {
    console.error("dbSave window.storage error:", e);
  }

  // Fall back to localStorage
  if (!saved) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      saved = true;
    } catch (e) {
      console.error("dbSave localStorage error:", e);
    }
  }

  if (!saved) {
    console.error("dbSave: All storage mechanisms failed. Data will not persist.");
    _storageWarning = "Storage unavailable — data will not persist across sessions.";
  }
}
