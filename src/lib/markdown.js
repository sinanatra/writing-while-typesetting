import { marked } from "marked";

export function mdToHtml(md = "") {
  return marked.parse(String(md));
}
