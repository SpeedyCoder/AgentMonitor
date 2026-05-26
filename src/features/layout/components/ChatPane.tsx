import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

type ChatPaneProps = {
  messagesNode: ReactNode;
  composerNode: ReactNode;
  headerNode?: ReactNode;
  className?: string;
};

export function ChatPane({ messagesNode, composerNode, headerNode, className }: ChatPaneProps) {
  const composerRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const [composerHeight, setComposerHeight] = useState(0);

  const [messagesDragging, setMessagesDragging] = useState(false);

  useEffect(() => {
    const messagesEl = messagesRef.current;
    if (!messagesEl) {
      return;
    }

    const handleMessagesMouseDown = () => {
      setMessagesDragging(true);
    };
    const handleWindowMouseUp = () => {
      setMessagesDragging(false);
    };

    messagesEl.addEventListener("mousedown", handleMessagesMouseDown);
    window.addEventListener("mouseup", handleWindowMouseUp);

    return () => {
      messagesEl.removeEventListener("mousedown", handleMessagesMouseDown);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [composerNode]);

  useEffect(() => {
    if (!composerNode) {
      setComposerHeight(0);
      return;
    }

    const node = composerRef.current;
    if (!node) {
      return;
    }

    const updateComposerHeight = () => {
      setComposerHeight(Math.ceil(node.getBoundingClientRect().height));
    };

    updateComposerHeight();

    const observer = new ResizeObserver(() => {
      updateComposerHeight();
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [composerNode]);

  const paneStyle = useMemo(
    () =>
      ({
        ["--composer-overlay-height" as string]: `${composerHeight}px`,
      }) satisfies CSSProperties,
    [composerHeight],
  );

  return (
    <div
      className={`chat-pane${headerNode ? " has-chat-header" : ""}${
        className ? ` ${className}` : ""
      }`}
      style={paneStyle}
    >
      {headerNode ? <div className="chat-pane-header">{headerNode}</div> : null}
      <div className="chat-pane-messages" ref={messagesRef}>
        {messagesNode}
      </div>
      {composerNode ? (
        <div
          className={`chat-pane-composer${messagesDragging ? " is-passthrough" : ""}`}
          ref={composerRef}
        >
          {composerNode}
        </div>
      ) : null}
    </div>
  );
}
