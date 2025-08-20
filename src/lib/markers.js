import { mdToHtml } from "./markdown.js";

export function preprocessMarkdown(md) {
  const lines = String(md).split(/\r?\n/);
  const out = [];
  let buf = [];

  const flush = () => {
    if (buf.length) {
      out.push(mdToHtml(buf.join("\n")));
      buf.length = 0;
    }
  };

  const isBreak = (s) =>
    /^\s*(\[\[(pagebreak|colbreak)\]\]|``|<!--\s*newpage\s*-->)\s*$/i.test(s);

  for (const raw of lines) {
    if (isBreak(raw)) {
      const t = raw.trim().toLowerCase();
      flush();
      if (t.includes("colbreak")) {
        out.push(
          '<div data-colbreak="1" class="col-break-marker" aria-hidden="true"></div>'
        );
      } else {
        out.push(
          '<div data-pagebreak="1" class="page-break-marker" aria-hidden="true"></div>'
        );
      }
    } else {
      buf.push(raw);
    }
  }
  flush();
  return out.join("\n");
}
