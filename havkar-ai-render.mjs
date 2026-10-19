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

export function renderAssistant(container, text) {
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
      span.textContent = block.text;
      container.appendChild(span);
    }
  });
}
