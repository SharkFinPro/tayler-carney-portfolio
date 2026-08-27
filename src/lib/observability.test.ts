import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  auditEvent,
  getErrorReporter,
  reportError,
  setErrorReporter,
  type ErrorReporter,
} from "./observability";
import { at } from "@/test/at";

/** The default reporter, restored after any test that swaps it out. */
let original: ErrorReporter;

beforeEach(() => {
  original = getErrorReporter();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  setErrorReporter(original);
  vi.restoreAllMocks();
});

/** Parse the single JSON line the default reporter emits. */
function lastErrorLine(): Record<string, unknown> {
  const calls = vi.mocked(console.error).mock.calls;
  return JSON.parse(String(at(at(calls, calls.length - 1), 0)));
}

function lastInfoLine(): Record<string, unknown> {
  const calls = vi.mocked(console.info).mock.calls;
  return JSON.parse(String(at(at(calls, calls.length - 1), 0)));
}

describe("reportError — structured output", () => {
  it("emits one parseable JSON line", () => {
    reportError({ scope: "cms", context: "getSiteData", error: new Error("boom") });

    expect(console.error).toHaveBeenCalledOnce();
    // The whole point: filterable by a log drain, not grepped as prose.
    expect(() => lastErrorLine()).not.toThrow();
  });

  it("carries the fields you would filter on", () => {
    reportError({
      scope: "server-action",
      context: "updateBlockLayout",
      error: new Error("boom"),
      correlationId: "ABC123",
    });

    expect(lastErrorLine()).toMatchObject({
      level: "error",
      event: "error",
      scope: "server-action",
      context: "updateBlockLayout",
      correlationId: "ABC123",
    });
  });

  it("timestamps every record", () => {
    reportError({ scope: "route", context: "x", error: new Error("y") });
    expect(String(lastErrorLine().at)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("serializes an Error into name, message, and a trimmed stack", () => {
    reportError({ scope: "cms", context: "x", error: new Error("the message") });

    const error = lastErrorLine().error as Record<string, unknown>;
    expect(error.name).toBe("Error");
    expect(error.message).toBe("the message");
    // Trimmed, or one framework stack makes the line unreadable.
    expect(String(error.stack).split("\n").length).toBeLessThanOrEqual(8);
  });

  // The line above only bounds the line count from one side, which several
  // different wrong implementations satisfy: splitting the stack into
  // characters, or joining the frames back with no separator, both land well
  // under eight. What the trim has to do is keep the FIRST eight frames, still
  // one per line — so this pins the exact output against a stack of known
  // shape.
  it("keeps exactly the first eight stack frames, one per line", () => {
    const error = new Error("boom");
    const frames = Array.from({ length: 20 }, (_, i) => `    at frame${i} (file.ts:${i}:1)`);
    error.stack = ["Error: boom", ...frames].join("\n");

    reportError({ scope: "cms", context: "x", error });

    const stack = String((lastErrorLine().error as Record<string, unknown>).stack);
    expect(stack).toBe(["Error: boom", ...frames.slice(0, 7)].join("\n"));
    expect(stack.split("\n")).toHaveLength(8);
    // The frames it dropped are genuinely gone, not merely off the end.
    expect(stack).not.toContain("frame7");
  });

  // A stack is optional on Error — some runtimes and hand-built rejections
  // arrive without one. The logger reaching into it unguarded would throw
  // while trying to report a failure, replacing the original error with its
  // own.
  it("survives an Error carrying no stack at all", () => {
    const error = new Error("stackless");
    delete (error as { stack?: string }).stack;

    expect(() => reportError({ scope: "cms", context: "x", error })).not.toThrow();

    const logged = lastErrorLine().error as Record<string, unknown>;
    expect(logged.message).toBe("stackless");
    expect(logged.stack).toBeUndefined();
  });

  it("includes a cause when there is one", () => {
    const error = new Error("outer");
    error.cause = new Error("inner");
    reportError({ scope: "cms", context: "x", error });

    expect(String((lastErrorLine().error as Record<string, unknown>).cause)).toContain("inner");
  });

  it("merges extra fields at the top level, where they are filterable", () => {
    reportError({ scope: "ai", context: "draft", error: new Error("x"), extra: { blocks: 4 } });
    expect(lastErrorLine()).toMatchObject({ blocks: 4 });
  });

  it.each([
    ["a bare string", "just a string"],
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
    ["a plain object", { nope: true }],
  ])("handles a non-Error throw (%s)", (_label, thrown) => {
    expect(() => reportError({ scope: "cms", context: "x", error: thrown })).not.toThrow();
    // `toBeTruthy` alone would accept `{}` — an empty object is truthy, so a
    // serializer that dropped the value entirely would pass while logging a
    // failure with nothing in it. The point of this branch is that whatever
    // was thrown still reaches the log in readable form.
    expect(lastErrorLine().error).toEqual({ message: String(thrown) });
  });
});

describe("reportError — never breaks the request", () => {
  it("swallows a reporter that throws", () => {
    // A reporter that throws would turn a handled error into an unhandled one,
    // which is strictly worse than losing the log line.
    setErrorReporter(() => {
      throw new Error("reporter is broken");
    });

    expect(() => reportError({ scope: "cms", context: "x", error: new Error("y") })).not.toThrow();
  });
});

describe("setErrorReporter — the SDK seam", () => {
  it("routes reports to a replacement", () => {
    const captured: unknown[] = [];
    setErrorReporter((r) => captured.push(r));

    reportError({ scope: "route", context: "page", error: new Error("boom") });

    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ scope: "route", context: "page" });
    // The replacement owns output entirely — no duplicate console line.
    expect(console.error).not.toHaveBeenCalled();
  });

  it("passes the original error object through, not a copy", () => {
    const error = new Error("identity matters");
    let seen: unknown = null;
    setErrorReporter((r) => {
      seen = r.error;
    });

    reportError({ scope: "cms", context: "x", error });
    // An SDK needs the real Error to capture a usable stack.
    expect(seen).toBe(error);
  });

  it("can be wrapped to keep the default behavior as well", () => {
    const previous = getErrorReporter();
    const captured: unknown[] = [];
    setErrorReporter((r) => {
      previous(r);
      captured.push(r);
    });

    reportError({ scope: "cms", context: "x", error: new Error("y") });

    expect(captured).toHaveLength(1);
    expect(console.error).toHaveBeenCalledOnce();
  });
});

describe("auditEvent", () => {
  it("emits a parseable info record", () => {
    auditEvent({ action: "updateDraft", model: "Project", entryId: "p1", outcome: "ok" });

    expect(lastInfoLine()).toMatchObject({
      level: "info",
      event: "audit",
      action: "updateDraft",
      model: "Project",
      entryId: "p1",
      outcome: "ok",
    });
  });

  it("records failures as well as successes", () => {
    auditEvent({ action: "updateDraft", model: "SiteData", outcome: "failed" });
    expect(lastInfoLine()).toMatchObject({ outcome: "failed" });
  });

  it("records which field changed", () => {
    auditEvent({ action: "updateDraft", model: "SiteData", field: "about", outcome: "ok" });
    expect(lastInfoLine()).toMatchObject({ field: "about" });
  });

  it("never throws, so observability cannot break a save", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() =>
      auditEvent({ action: "x", outcome: "ok", extra: { circular } })
    ).not.toThrow();
  });

  it("writes to info, not error — an audit record is not a failure", () => {
    auditEvent({ action: "deleteProject", outcome: "ok" });
    expect(console.info).toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });
});
