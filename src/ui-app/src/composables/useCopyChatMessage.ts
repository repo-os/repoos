import { copyToClipboard } from "../lib/clipboard.js";
import {
  copyTextForBubbleRow,
  copyTextForTaskDrawerRow,
  shouldCopyMessageOnClick,
} from "../lib/chat-message-copy.js";
import type { DisplayRow } from "../lib/chat-rows.js";
import { useRepoStore } from "../stores/repo.js";

export function useCopyChatMessage() {
  const repo = useRepoStore();

  async function copyMessageText(text: string | null): Promise<void> {
    if (text === null) return;
    if (await copyToClipboard(text)) {
      repo.pushToast("Message copied", "success");
    } else {
      repo.pushToast("Could not copy message", "error");
    }
  }

  async function onBubbleClick(row: DisplayRow, event: MouseEvent): Promise<void> {
    if (!shouldCopyMessageOnClick(event)) return;
    await copyMessageText(copyTextForBubbleRow(row));
  }

  async function onTaskDrawerBubbleClick(row: DisplayRow, event: MouseEvent): Promise<void> {
    if (!shouldCopyMessageOnClick(event)) return;
    await copyMessageText(copyTextForTaskDrawerRow(row));
  }

  return { onBubbleClick, onTaskDrawerBubbleClick };
}
