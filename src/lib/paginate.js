import { px_per_mm } from "./formats";

function measureAtWidth(el, widthPx) {
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

function isSpanAll(el) {
  const cls = el.classList || { contains: () => false };
  return (
    cls.contains("full") ||
    cls.contains("cols-1") ||
    cls.contains("cols-2") ||
    cls.contains("img-wide") ||
    cls.contains("figure-wide")
  );
}

function splitParagraphToFit(pEl, colWidth, pageHeight, _flattened = false) {
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
    return splitParagraphToFit(plain, colWidth, pageHeight, true);
  }

  const tokens = rawText.split(/(\s+)/);
  const head = pEl.cloneNode(false);

  head.textContent = rawText;
  if (measureAtWidth(head, colWidth) <= pageHeight) {
    return { head: pEl.cloneNode(true), tail: null };
  }

  let acc = "";
  let lastHeight = -1;
  let i = 0;
  for (; i < tokens.length; i++) {
    const candidate = acc + tokens[i];
    head.textContent = candidate;

    const h = measureAtWidth(head, colWidth);
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
      const h = measureAtWidth(head, colWidth);
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

function splitElementForColumn(el, colWidth, pageHeight) {
  const tag = el.tagName;
  if (tag === "P") return splitParagraphToFit(el, colWidth, pageHeight);
  if (tag === "UL" || tag === "OL") {
    const head = el.cloneNode(false),
      tail = el.cloneNode(false);
    const items = Array.from(el.children);
    for (let i = 0; i < items.length; i++) {
      head.appendChild(items[i].cloneNode(true));
      const h = measureAtWidth(head, colWidth);
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

  const closePage = () => {
    pages.push(pageChunks.join(""));
    pageChunks = [];
    colIndex = 0;
    colHeight = 0;
  };
  const nextColumnOrPage = () => {
    if (colIndex < cols - 1) {
      colIndex += 1;
      colHeight = 0;
    } else {
      closePage();
    }
  };
  const pushNow = (html) => pageChunks.push(html);

  for (let idx = 0; idx < nodes.length; idx++) {
    const n = nodes[idx];

    if (n.nodeType === 1) {
      const el = n;
      if (el.hasAttribute("data-pagebreak")) {
        closePage();
        continue;
      }
      if (el.hasAttribute("data-colbreak")) {
        pushNow('<div class="force-colbreak" aria-hidden="true"></div>');
        nextColumnOrPage();
        continue;
      }
    }

    if (n.nodeType !== 1) continue;
    if (["META", "LINK", "SCRIPT", "STYLE"].includes(n.tagName)) continue;

    const el = n;
    const spanAll = isSpanAll(el);
    const neededHeight = measureAtWidth(el, spanAll ? innerWidth : colWidth);

    if (spanAll) {
      if (colIndex !== 0 || colHeight > 0) closePage();
      pushNow(el.outerHTML);

      colIndex = 0;
      colHeight = Math.min(pageHeight, colHeight + neededHeight);
      if (colHeight >= pageHeight) closePage();
      continue;
    }

    if (colHeight + neededHeight <= pageHeight) {
      pushNow(el.outerHTML);
      colHeight += neededHeight;
    } else {
      nextColumnOrPage();

      if (neededHeight > pageHeight) {
        const { head, tail } = splitElementForColumn(el, colWidth, pageHeight);
        if (head) {
          pushNow(head.outerHTML);
          colHeight += measureAtWidth(head, colWidth);
          if (tail) nodes.splice(idx + 1, 0, tail);
        } else {
          pushNow(el.outerHTML);
          closePage();
        }

        if (tail) {
          nodes.splice(idx + 1, 0, tail);
        }
      } else {
        pushNow(el.outerHTML);
        colHeight += neededHeight;
      }
    }
  }

  pages.push(pageChunks.join(""));
  return pages;
}
