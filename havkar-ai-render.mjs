export function ssePayloads(buffer, flush) {
  const lines = String(buffer || "").split(/\r?\n/);
  const rest = flush ? "" : (lines.pop() ?? "");
  const payloads = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try { payloads.push(JSON.parse(data)); } catch { payloads.push(null); }
  }
  return { rest, payloads };
}

export function assistantBlocks(text) {
  const blocks = [];
  String(text || "").split("```").forEach((part, index) => {
    if (index % 2 === 1) {
      const newline = part.indexOf("\n");
      blocks.push({ type: "code", text: newline === -1 ? part : part.slice(newline + 1) });
    } else if (part) {
      blocks.push({ type: "text", text: part });
    }
  });
  return blocks;
}

/** Split inline text into plain and **bold** parts without HTML injection. */
export function markdownInlineParts(text) {
  const source = String(text || "");
  const parts = [];
  const pattern = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", text: source.slice(lastIndex, match.index) });
    }
    parts.push({ type: "strong", text: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < source.length) {
    parts.push({ type: "text", text: source.slice(lastIndex) });
  }
  return parts;
}

function appendMarkdownText(parent, text) {
  markdownInlineParts(text).forEach((part) => {
    if (part.type === "strong") {
      const strong = document.createElement("strong");
      strong.textContent = part.text;
      parent.appendChild(strong);
      return;
    }
    parent.appendChild(document.createTextNode(part.text));
  });
}

export function renderAssistant(container, text) {
  const actions = container.querySelector(".bubble-actions");
  container.replaceChildren();
  assistantBlocks(text).forEach((block) => {
    if (block.type === "code") {
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = block.text;
      pre.appendChild(code);
      container.appendChild(pre);
    } else {
      const span = document.createElement("span");
      appendMarkdownText(span, block.text);
      container.appendChild(span);
    }
  });
  if (actions) container.appendChild(actions);
}
