import { describe, expect, it } from "vitest";
import type { ThreadSummary } from "@/types";
import { canDeleteGenericEmptySession } from "./emptyThreadSession";

function thread(id: string, name: string): ThreadSummary {
  return { id, name, updatedAt: 0 };
}

describe("emptyThreadSession", () => {
  it("allows deleting a generic empty session when another session is open", () => {
    expect(
      canDeleteGenericEmptySession(
        [thread("empty", "New Agent"), thread("other", "Work in progress")],
        "empty",
        [],
      ),
    ).toBe(true);
  });

  it("keeps the only generic empty session protected", () => {
    expect(
      canDeleteGenericEmptySession([thread("empty", "Session")], "empty", []),
    ).toBe(false);
  });

  it("does not classify sessions with conversation items as empty", () => {
    expect(
      canDeleteGenericEmptySession(
        [thread("thread-1", "New Agent"), thread("thread-2", "Other")],
        "thread-1",
        [{ id: "item-1", kind: "message", role: "user", text: "hello" }],
      ),
    ).toBe(false);
  });
});
