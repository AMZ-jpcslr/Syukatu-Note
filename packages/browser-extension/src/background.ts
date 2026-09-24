import { collectVisiblePage } from "./collect-visible";
import { extractPage } from "./providers";
import { sanitizeExtraction } from "../../../src/lib/import/parser";
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "career-import",
    title: "しゅうかつ手帳に追加",
    contexts: ["selection"],
  });
  chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
});
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "career-import" || !tab?.id) return;
  const consent = await chrome.storage.local.get("privacyAccepted");
  if (!consent.privacyAccepted) {
    await chrome.action.openPopup();
    return;
  }
  try {
    const response = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectVisiblePage,
      args: [true],
    });
    const page = response[0]?.result;
    if (!page) return;
    const result = sanitizeExtraction(extractPage(page));
    await chrome.storage.session.set({ draft: result });
    await chrome.action.setBadgeText({
      text: String(
        result.deadlines.length +
          result.events.length +
          result.detectedSelectionSteps.length,
      ),
      tabId: tab.id,
    });
    await chrome.action.openPopup();
  } catch {
    await chrome.action.setBadgeText({ text: "!", tabId: tab.id });
  }
});
