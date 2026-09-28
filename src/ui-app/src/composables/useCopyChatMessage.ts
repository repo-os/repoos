import { copyToClipboard } from "../lib/clipboard.js";
import {
  copyTextForBubbleRow,
  copyTextForTaskDrawerRow,
  isCopyableBubbleRow,
  shouldCopyMessageOnClick,
} from "../lib/chat-message-copy.js";
import type { DisplayRow } from "../lib/chat-rows.js";
import { useRepoStore } from "../stores/repo.js";

export function useCopyChatMessage() {
  const repo = useRepoStore();

  async function copyMessageText(text: string): Promise<void> {
    if (await copyToClipboard(text)) {
      repo.pushToast("Message copied", "success", { dedupe: false });
    } else {
      repo.pushToast("Could not copy message", "error");
    }
  }

  async function onBubbleClick(row: DisplayRow, event: MouseEvent): Promise<void> {
    const text = copyTextForBubbleRow(row);
    if (text === null) return;
    if (!shouldCopyMessageOnClick(event)) return;
    await copyMessageText(text);
  }

  async function onTaskDrawerBubbleClick(row: DisplayRow, event: MouseEvent): Promise<void> {
    const text = copyTextForTaskDrawerRow(row);
    if (text === null) return;
    if (!shouldCopyMessageOnClick(event)) return;
    await copyMessageText(text);
  }

  /** Attach only on copyable bubbles so status rows keep normal selection behaviour. */
  function messageBubbleListeners(row: DisplayRow): Record<string, (event: MouseEvent) => void> {
    if (!isCopyableBubbleRow(row)) return {};
    return {
      click: (event: MouseEvent) => void onBubbleClick(row, event),
    };
  }

  return { onBubbleClick, onTaskDrawerBubbleClick, messageBubbleListeners };
}
