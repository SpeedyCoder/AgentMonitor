import { describe, expect, it } from "vitest";
import { extractThreadFromResponse } from "./threadSummary";

describe("extractThreadFromResponse", () => {
  it("carries top-level model metadata into extracted thread payloads", () => {
    const thread = extractThreadFromResponse({
      result: {
        thread: {
          id: "thread-1",
          preview: "hello",
        },
        model: "sonnet-4.5",
        modelProvider: "anthropic",
        reasoningEffort: "medium",
      },
    });

    expect(thread).toMatchObject({
      id: "thread-1",
      model: "sonnet-4.5",
      modelProvider: "anthropic",
      reasoningEffort: "medium",
    });
  });

  it("extracts ACP start responses that only include thread and session ids", () => {
    expect(
      extractThreadFromResponse({
        threadId: "session-1",
        sessionId: "session-1",
      }),
    ).toMatchObject({ id: "session-1" });
  });

  it("uses ACP start ids as a fallback when a nested thread omits id", () => {
    expect(
      extractThreadFromResponse({
        result: {
          threadId: "session-2",
          thread: { preview: "Started" },
        },
      }),
    ).toMatchObject({ id: "session-2", preview: "Started" });
  });
});
