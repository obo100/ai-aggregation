import type { ToolConfig } from "../types";

export function buildInjectScript(prompt: string, tool: ToolConfig): string {
  const inputSelector = tool.inputSelector?.trim() ?? "";
  const sendSelector = tool.sendSelector?.trim() ?? "";
  const sendWithEnter = tool.sendWithEnter !== false;

  return `(() => {
    const prompt = ${JSON.stringify(prompt)};
    const inputSelector = ${JSON.stringify(inputSelector)};
    const sendSelector = ${JSON.stringify(sendSelector)};
    const sendWithEnter = ${JSON.stringify(sendWithEnter)};

    const isVisible = (el) => {
      if (!(el instanceof HTMLElement)) {
        return false;
      }
      const style = window.getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const queryAllDeep = (selectors) => {
      const results = [];
      const selectorList = Array.isArray(selectors) ? selectors : [selectors];

      const safeQuery = (root, selector) => {
        try {
          return Array.from(root.querySelectorAll(selector));
        } catch {
          return [];
        }
      };

      const walk = (root) => {
        for (const selector of selectorList) {
          results.push(...safeQuery(root, selector));
        }
        const tree = root.querySelectorAll("*");
        for (const node of tree) {
          const shadow = node.shadowRoot;
          if (shadow) {
            walk(shadow);
          }
        }
      };

      walk(document);
      return results;
    };

    const inputCandidates = inputSelector
      ? [inputSelector]
      : [
          "textarea",
          "[contenteditable='true']",
          "div[role='textbox']",
          "input[type='text']",
          "input:not([type])"
        ];

    const sendCandidates = sendSelector
      ? [sendSelector]
      : [
          "button[type='submit']",
          "button[aria-label*='Send']",
          "button[aria-label*='send']",
          "button[data-testid*='send']",
          "[role='button']",
          "button"
        ];

    const findInput = () => {
      const all = queryAllDeep(inputCandidates);
      const visible = all.filter(isVisible);
      if (visible.length === 0) {
        return null;
      }
      visible.sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();
        return rectB.width * rectB.height - rectA.width * rectA.height;
      });
      return visible[0] ?? null;
    };

    const findSendButton = () => {
      const input = findInput();
      if (input) {
        const form = input.closest("form");
        if (form) {
          const buttons = queryAllDeep(sendCandidates).filter((el) => form.contains(el));
          const visibleButtons = buttons.filter(isVisible);
          if (visibleButtons.length > 0) {
            return visibleButtons[0];
          }
        }
      }

      const candidates = queryAllDeep(sendCandidates);
      const visible = candidates.filter(isVisible);
      const labelMatcher = new RegExp("send|submit|\\u53d1\\u9001|\\u63d0\\u4ea4|\\u53d1\\u5e03", "i");
      for (const el of visible) {
        const label =
          el.getAttribute("aria-label") ||
          el.getAttribute("title") ||
          el.textContent ||
          "";
        if (labelMatcher.test(label)) {
          return el;
        }
      }
      return visible[0] ?? null;
    };

    const setNativeValue = (el, value) => {
      const proto = Object.getPrototypeOf(el);
      const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
      if (descriptor && descriptor.set) {
        descriptor.set.call(el, value);
        return;
      }
      el.value = value;
    };

    const setInputValue = (el, value) => {
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
        el.click();
        el.focus();
        setNativeValue(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }

      if (el instanceof HTMLElement) {
        el.click();
        el.focus();
        if (document.execCommand) {
          document.execCommand("selectAll", false);
          document.execCommand("insertText", false, value);
        } else {
          el.textContent = value;
        }
        el.dispatchEvent(new InputEvent("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    };

    const triggerEnter = (el) => {
      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      });
      el.dispatchEvent(event);
    };

    const trySend = () => {
      const input = findInput();
      if (!input) {
        return false;
      }

      setInputValue(input, prompt);

      if (sendWithEnter) {
        triggerEnter(input);
        return true;
      }

      const sendButton = findSendButton();
      if (sendButton) {
        sendButton.click();
        return true;
      }
      return false;
    };

    let tries = 0;
    const maxTries = 120;
    const timer = setInterval(() => {
      try {
        const done = trySend();
        tries += 1;
        if (done || tries >= maxTries) {
          clearInterval(timer);
        }
      } catch {
        tries += 1;
        if (tries >= maxTries) {
          clearInterval(timer);
        }
      }
    }, 200);
  })();`;
}
