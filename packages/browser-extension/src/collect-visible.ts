// This function is serialized by chrome.scripting.executeScript. Keep it self-contained.
export function collectVisiblePage(selectionOnly = false) {
  const forbidden =
    'script,style,nav,footer,aside,input,textarea,select,option,[contenteditable],[hidden],[aria-hidden="true"],noscript,iframe,[class*="cookie" i],[id*="cookie" i],[class*="banner" i],[class*="advert" i],[class*="answer" i],[id*="answer" i],[class*="profile" i],[data-private],[data-sensitive]';
  const visible = (element: Element) => {
    if (element.closest(forbidden)) return false;
    for (const block of [
      element,
      ...Array.from(
        element.closest("section,article,dl,tr")
          ? [element.closest("section,article,dl,tr")!]
          : [],
      ),
    ]) {
      const heading = block.querySelector("h1,h2,h3,h4,dt,th,label");
      if (
        heading &&
        /氏名|プロフィール|個人情報|住所|志望動機|自己PR|ガクチカ|回答内容|ES回答|あなたの回答/.test(
          heading.textContent ?? "",
        )
      )
        return false;
    }
    let parent: Element | null = element;
    while (parent) {
      const style = getComputedStyle(parent);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
      )
        return false;
      parent = parent.parentElement;
    }
    return element.getClientRects().length > 0;
  };
  const cloneVisible = (root: Element) => {
    if (!visible(root)) return "";
    const clone = root.cloneNode(true) as Element;
    const originals = [root, ...root.querySelectorAll("*")],
      copies = [clone, ...clone.querySelectorAll("*")];
    for (let i = copies.length - 1; i >= 0; i--)
      if (!visible(originals[i]) || copies[i].matches(forbidden))
        copies[i].remove();
    // Remove labelled private display blocks as well as editable inputs.
    clone
      .querySelectorAll("section,article,dl,tr,fieldset,div")
      .forEach((element) => {
        const heading = element.querySelector("h1,h2,h3,h4,h5,h6,dt,th,label");
        if (
          heading &&
          /氏名|お名前|プロフィール|個人情報|住所|連絡先|志望動機|自己PR|ガクチカ|回答内容|ES回答|あなたの回答/.test(
            heading.textContent ?? "",
          )
        )
          element.remove();
      });
    clone.querySelectorAll("br").forEach((el) => el.replaceWith("\n"));
    clone
      .querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,tr,section,article,div")
      .forEach((el) => el.append("\n"));
    return clone.textContent ?? "";
  };
  if (selectionOnly) {
    const selection = getSelection();
    const node = selection?.anchorNode;
    const element =
      node?.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : node?.parentElement;
    if (
      !selection ||
      !element ||
      !visible(element) ||
      document.activeElement?.matches("input,textarea,[contenteditable]")
    )
      return { title: document.title, url: location.href, text: "" };
    const holder = document.createElement("div");
    holder.append(selection.getRangeAt(0).cloneContents());
    holder.querySelectorAll(forbidden).forEach((el) => el.remove());
    return {
      title: document.title,
      url: location.href,
      text: (holder.textContent ?? "").slice(0, 50000),
    };
  }
  const root =
    document.querySelector("main") ??
    document.querySelector("article") ??
    document.body;
  return {
    title: document.title,
    url: location.href,
    text: cloneVisible(root).slice(0, 50000),
  };
}
