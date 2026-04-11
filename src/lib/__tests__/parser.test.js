import { describe, it, expect } from "vitest";
import { parseText } from "../parser.js";

describe("parseText()", () => {
  it("returns empty result for null input", () => {
    const result = parseText(null);
    expect(result.contacts).toEqual([]);
    expect(result.intents).toEqual([]);
    expect(result.actions).toEqual([]);
    expect(result.sentiment).toBe("neutral");
    expect(result.amounts).toEqual([]);
    expect(result.isUrgent).toBe(false);
  });

  it("returns empty result for undefined input", () => {
    const result = parseText(undefined);
    expect(result.contacts).toEqual([]);
  });

  it("returns empty result for empty string", () => {
    const result = parseText("");
    expect(result.contacts).toEqual([]);
  });

  it("extracts email addresses from text", () => {
    const result = parseText("Please contact john.doe@example.com about the invoice.");
    expect(result.contacts.some((c) => c.email === "john.doe@example.com")).toBe(true);
  });

  it("extracts dollar amounts", () => {
    const result = parseText("The invoice is for $3,500.");
    expect(result.amounts).toContain(3500);
  });

  it("detects negative sentiment", () => {
    const result = parseText("The client is very angry and frustrated with the delay.");
    expect(result.sentiment).toBe("negative");
  });

  it("detects positive sentiment", () => {
    const result = parseText("This is excellent work! The client is very happy and excited.");
    expect(result.sentiment).toBe("positive");
  });

  it("detects urgency", () => {
    const result = parseText("This is URGENT — we need payment immediately or the contract is cancelled.");
    expect(result.isUrgent).toBe(true);
  });

  it("detects collect action intent", () => {
    const result = parseText("We need to collect payment on the unpaid invoice.");
    expect(result.actions).toContain("collect");
  });

  it("detects follow_up action intent", () => {
    const result = parseText("Please follow up with the client about the proposal.");
    expect(result.actions).toContain("follow_up");
  });

  it("detects schedule action intent", () => {
    const result = parseText("We need to schedule a meeting with the team next week.");
    expect(result.actions).toContain("schedule");
  });

  it("detects escalate action intent", () => {
    const result = parseText("The client is not responding — we need to escalate this issue.");
    expect(result.actions).toContain("escalate");
  });
});
