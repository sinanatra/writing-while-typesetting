import { md_to_html } from "./markdown.js";

export function preprocess_markdown(md) {
  const lines = String(md).split(/\r?\n/);
  const out = [];
  let buf = [];

  const flush = () => {
    if (buf.length) {
      out.push(md_to_html(buf.join("\n")));
      buf.length = 0;
    }
  };

  const is_break = (s) =>
    /^\s*(\[\[(pagebreak|colbreak)\]\]|``|<!--\s*newpage\s*-->)\s*$/i.test(s);

  for (const raw of lines) {
    const m_head = raw.match(/^\s*\[\[\s*head(?:er)?:\s*(.*?)\s*\]\]\s*$/i);
    const m_foot = raw.match(/^\s*\[\[\s*foot:\s*(.*?)\s*\]\]\s*$/i);

    if (m_head) {
      flush();
      out.push(
        `<div data-runhead="${m_head[1].replace(/"/g, "&quot;")}"></div>`
      );
      continue;
    }
    if (m_foot) {
      flush();
      out.push(
        `<div data-runfoot="${m_foot[1].replace(/"/g, "&quot;")}"></div>`
      );
      continue;
    }

    if (is_break(raw)) {
      const t = raw.trim().toLowerCase();
      flush();
      if (t.includes("colbreak")) {
        out.push('<div data-colbreak="1" class="col-break-marker"></div>');
      } else {
        out.push('<div data-pagebreak="1" class="page-break-marker"></div>');
      }
    } else {
      buf.push(raw);
    }
  }
  flush();
  return out.join("\n");
}
