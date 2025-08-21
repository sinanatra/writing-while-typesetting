import { marked } from "marked";

export function md_to_html(md = "") {
  return marked.parse(String(md));
}
