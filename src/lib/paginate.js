import { px_per_mm } from "./formats";

function measure_at_width(el, widthPx) {
  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.left = "-99999px";
  probe.style.top = "0";
  probe.style.width = widthPx + "px";
  probe.style.boxSizing = "border-box";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);

  const clone = el.cloneNode(true);
  probe.appendChild(clone);

  const cs = getComputedStyle(clone);
  const mt = parseFloat(cs.marginTop) || 0;
  const mb = parseFloat(cs.marginBottom) || 0;
  const h = clone.offsetHeight + mt + mb;

  probe.remove();
  return h;
}

function is_span_all(el) {
  const cls = el.classList || { contains: () => false };
  return (
    cls.contains("full") ||
    cls.contains("cols-1") ||
    cls.contains("cols-2") ||
    cls.contains("img-wide") ||
    cls.contains("figure-wide")
  );
}

function split_paragraph(pEl, colWidth, pageHeight, _flattened = false) {
  const rawText = (pEl.textContent ?? "").toString();
  if (!rawText.length) return { head: null, tail: null };

  const isPlainText =
    pEl.childNodes.length === 1 &&
    pEl.firstChild &&
    pEl.firstChild.nodeType === 3;
  if (!isPlainText) {
    if (_flattened) {
      return { head: null, tail: null };
    }
    const plain = document.createElement("p");
    plain.textContent = rawText;
    return split_paragraph(plain, colWidth, pageHeight, true);
  }

  const tokens = rawText.split(/(\s+)/);
  const head = pEl.cloneNode(false);

  head.textContent = rawText;
  if (measure_at_width(head, colWidth) <= pageHeight) {
    return { head: pEl.cloneNode(true), tail: null };
  }

  let acc = "";
  let lastHeight = -1;
  let i = 0;
  for (; i < tokens.length; i++) {
    const candidate = acc + tokens[i];
    head.textContent = candidate;

    const h = measure_at_width(head, colWidth);
    if (h > pageHeight) break;

    if (h === lastHeight && candidate.length > acc.length) break;
    lastHeight = h;
    acc = candidate;
  }

  if (!acc.trim()) {
    const chars = Array.from(rawText);
    let accChars = "";
    lastHeight = -1;
    let k = 0;
    for (; k < chars.length; k++) {
      const candidate = accChars + chars[k];
      head.textContent = candidate;
      const h = measure_at_width(head, colWidth);
      if (h > pageHeight) break;
      if (h === lastHeight && candidate.length > accChars.length) break;
      lastHeight = h;
      accChars = candidate;
    }
    if (!accChars) {
      return { head: null, tail: null };
    }
    const tail = pEl.cloneNode(false);
    tail.textContent = chars.slice(accChars.length).join("");
    head.textContent = accChars;
    return { head, tail: tail.textContent ? tail : null };
  }

  const tail = pEl.cloneNode(false);
  tail.textContent = tokens.slice(i).join("");
  head.textContent = acc;
  return { head, tail: tail.textContent.trim() ? tail : null };
}

function split_element(el, colWidth, pageHeight) {
  const tag = el.tagName;
  if (tag === "P") return split_paragraph(el, colWidth, pageHeight);
  if (tag === "UL" || tag === "OL") {
    const head = el.cloneNode(false),
      tail = el.cloneNode(false);
    const items = Array.from(el.children);
    for (let i = 0; i < items.length; i++) {
      head.appendChild(items[i].cloneNode(true));
      const h = measure_at_width(head, colWidth);
      if (h > pageHeight) {
        head.removeChild(head.lastChild);
        for (let j = i; j < items.length; j++)
          tail.appendChild(items[j].cloneNode(true));
        return {
          head: head.childNodes.length ? head : null,
          tail: tail.childNodes.length ? tail : null,
        };
      }
    }
    return { head, tail: null };
  }

  return { head: null, tail: null };
}

export function paginate({ measurerEl, pagePx, pad, columns, columnGap }) {
  if (!measurerEl) return [];

  const pageHeight = pagePx.h - (pad.top + pad.bottom);
  const cols = Math.max(1, Number(columns) || 1);
  const colGapPx = (Number(columnGap) || 0) * px_per_mm;
  const innerWidth = pagePx.w - (pad.left + pad.right);
  const colWidth =
    cols > 1 ? (innerWidth - colGapPx * (cols - 1)) / cols : innerWidth;

  const nodes = Array.from(measurerEl.childNodes);
  const pages = [];

  let pageChunks = [];
  let colIndex = 0;
  let colHeight = 0;

  const close_page = () => {
    pages.push(pageChunks.join(""));
    pageChunks = [];
    colIndex = 0;
    colHeight = 0;
  };
  const next_col_or_page = () => {
    if (colIndex < cols - 1) {
      colIndex += 1;
      colHeight = 0;
    } else {
      close_page();
    }
  };
  const push_now = (html) => pageChunks.push(html);

  for (let idx = 0; idx < nodes.length; idx++) {
    const n = nodes[idx];

    if (n.nodeType === 1) {
      const el = n;
      if (el.hasAttribute("data-pagebreak")) {
        close_page();
        continue;
      }
      if (el.hasAttribute("data-colbreak")) {
        push_now('<div class="force-colbreak" aria-hidden="true"></div>');
        next_col_or_page();
        continue;
      }
    }

    if (n.nodeType !== 1) continue;
    if (["META", "LINK", "SCRIPT", "STYLE"].includes(n.tagName)) continue;

    const el = n;
    const spanAll = is_span_all(el);
    const neededHeight = measure_at_width(el, spanAll ? innerWidth : colWidth);

    if (spanAll) {
      if (colIndex !== 0 || colHeight > 0) close_page();
      push_now(el.outerHTML);

      colIndex = 0;
      colHeight = Math.min(pageHeight, colHeight + neededHeight);
      if (colHeight >= pageHeight) close_page();
      continue;
    }

    if (colHeight + neededHeight <= pageHeight) {
      push_now(el.outerHTML);
      colHeight += neededHeight;
    } else {
      next_col_or_page();

      if (neededHeight > pageHeight) {
        const { head, tail } = split_element(el, colWidth, pageHeight);
        if (head) {
          push_now(head.outerHTML);
          colHeight += measure_at_width(head, colWidth);
          if (tail) nodes.splice(idx + 1, 0, tail);
        } else {
          push_now(el.outerHTML);
          close_page();
        }

        if (tail) {
          nodes.splice(idx + 1, 0, tail);
        }
      } else {
        push_now(el.outerHTML);
        colHeight += neededHeight;
      }
    }
  }

  pages.push(pageChunks.join(""));
  return pages;
}
