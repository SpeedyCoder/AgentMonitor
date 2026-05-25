import { describe, expect, it } from "vitest";
import type { ConversationItem } from "../../../types";
import { buildToolGroups, buildToolSummary, statusToneFromText } from "./messageRenderUtils";

function makeToolItem(
  overrides: Partial<Extract<ConversationItem, { kind: "tool" }>>,
): Extract<ConversationItem, { kind: "tool" }> {
  return {
    id: "tool-1",
    kind: "tool",
    toolType: "webSearch",
    title: "Web search",
    detail: "trantor",
    status: "completed",
    output: "",
    ...overrides,
  };
}

describe("messageRenderUtils", () => {
  it("renders web search as searching while in progress", () => {
    const summary = buildToolSummary(makeToolItem({ status: "inProgress" }), "");
    expect(summary.label).toBe("searching");
    expect(summary.value).toBe("trantor");
  });

  it("renders mcp search calls as searching while in progress", () => {
    const summary = buildToolSummary(
      makeToolItem({
        toolType: "mcpToolCall",
        title: "Tool: web / search_query",
        detail: '{\n  "query": "trantor"\n}',
        status: "inProgress",
      }),
      "",
    );
    expect(summary.label).toBe("searching");
    expect(summary.value).toBe("trantor");
  });

  it("classifies camelCase inProgress as processing", () => {
    expect(statusToneFromText("inProgress")).toBe("processing");
  });

  it("renders collab tool calls with nickname and role", () => {
    const summary = buildToolSummary(
      makeToolItem({
        toolType: "collabToolCall",
        title: "Collab: wait",
        detail: "From thread-parent → thread-child",
        status: "completed",
        output: "Robie [explorer]: completed",
        collabReceivers: [
          {
            threadId: "thread-child",
            nickname: "Robie",
            role: "explorer",
          },
        ],
      }),
      "",
    );
    expect(summary.label).toBe("waited for");
    expect(summary.value).toBe("Robie [explorer]");
    expect(summary.output).toContain("Robie [explorer]: completed");
  });

  it("groups agent activity after a user request and summarizes file edits", () => {
    const items: ConversationItem[] = [
      {
        id: "user-1",
        kind: "message",
        role: "user",
        text: "Add the feature",
      },
      {
        id: "tool-1",
        kind: "tool",
        toolType: "fileChange",
        title: "File change",
        detail: "",
        changes: [
          {
            path: "src/a.ts",
            kind: "modify",
            diff: "diff --git a/src/a.ts b/src/a.ts\n@@\n-old\n+new\n+extra",
          },
          {
            path: "src/b.ts",
            kind: "add",
            diff: "diff --git a/src/b.ts b/src/b.ts\n@@\n+created",
          },
        ],
      },
      {
        id: "assistant-1",
        kind: "message",
        role: "assistant",
        text: "Done.",
      },
    ];

    const grouped = buildToolGroups(items);
    expect(grouped[0]).toEqual({ kind: "item", item: items[0] });
    expect(grouped[1]?.kind).toBe("toolGroup");
    if (grouped[1]?.kind !== "toolGroup") {
      throw new Error("Expected tool group");
    }
    expect(grouped[1].group.toolCount).toBe(1);
    expect(grouped[1].group.editCount).toBe(2);
    expect(grouped[1].group.editedFileCount).toBe(2);
    expect(grouped[1].group.editedFiles).toEqual([
      {
        path: "src/a.ts",
        kind: "modify",
        diff: "diff --git a/src/a.ts b/src/a.ts\n@@\n-old\n+new\n+extra",
        additions: 2,
        deletions: 1,
      },
      {
        path: "src/b.ts",
        kind: "add",
        diff: "diff --git a/src/b.ts b/src/b.ts\n@@\n+created",
        additions: 1,
        deletions: 0,
      },
    ]);
    expect(grouped[1].group.additions).toBe(3);
    expect(grouped[1].group.deletions).toBe(1);
    expect(grouped[1].group.lastAssistantMessage?.id).toBe("assistant-1");
  });

  it("groups intermediate assistant responses and uses the last response as the preview", () => {
    const assistantOne: ConversationItem = {
      id: "assistant-1",
      kind: "message",
      role: "assistant",
      text: "First update.",
    };
    const assistantTwo: ConversationItem = {
      id: "assistant-2",
      kind: "message",
      role: "assistant",
      text: "Second update.",
    };
    const items: ConversationItem[] = [
      {
        id: "user-1",
        kind: "message",
        role: "user",
        text: "Inspect the repo",
      },
      assistantOne,
      makeToolItem({ id: "tool-1" }),
      assistantTwo,
    ];

    const grouped = buildToolGroups(items);

    expect(grouped[0]).toEqual({ kind: "item", item: items[0] });
    expect(grouped[1]?.kind).toBe("toolGroup");
    if (grouped[1]?.kind !== "toolGroup") {
      throw new Error("Expected tool group");
    }
    expect(grouped[1].group.items.map((item) => item.id)).toEqual([
      "assistant-1",
      "tool-1",
      "assistant-2",
    ]);
    expect(grouped[1].group.lastAssistantMessage).toEqual(assistantTwo);
  });

  it("marks the latest agent activity group active while thinking", () => {
    const grouped = buildToolGroups(
      [
        {
          id: "user-1",
          kind: "message",
          role: "user",
          text: "Run tests",
        },
        {
          id: "tool-1",
          kind: "tool",
          toolType: "commandExecution",
          title: "Command: npm test",
          detail: "/tmp",
          status: "running",
        },
      ],
      { isThinking: true },
    );

    expect(grouped[1]?.kind).toBe("toolGroup");
    if (grouped[1]?.kind !== "toolGroup") {
      throw new Error("Expected tool group");
    }
    expect(grouped[1].group.isActive).toBe(true);
  });
});
