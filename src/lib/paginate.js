import { px_per_mm } from "./formats";

let measure_host = null;

function measure_at_width(el, width_px) {
  const host = measure_host || document.body;
  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.left = "-99999px";
  probe.style.top = "0";
  probe.style.width = width_px + "px";
  probe.style.boxSizing = "border-box";
  probe.style.visibility = "hidden";
  probe.style.whiteSpace = "normal";
  probe.style.wordBreak = "normal";
  probe.style.overflowWrap = "anywhere";
  host.appendChild(probe);

  const clone = el.cloneNode(true);
  clone.style.whiteSpace = "inherit";
  clone.style.wordBreak = "inherit";
  clone.style.overflowWrap = "inherit";
  probe.appendChild(clone);

  const cs = getComputedStyle(clone);
  const mt = parseFloat(cs.marginTop) || 0;
  const mb = parseFloat(cs.marginBottom) || 0;
  const h = clone.offsetHeight + mt + mb;

  probe.remove();
  return { h, mt, mb };
}

function is_span_all(el) {
  const cls = el.classList || { contains: () => false };
  return (
    cls.contains("span-all") ||
    cls.contains("full") ||
    cls.contains("cols") ||
    cls.contains("cols-1") ||
    cls.contains("cols-2") ||
    cls.contains("img-page") ||
    cls.contains("img-wide") ||
    cls.contains("figure-wide")
  );
}

function split_paragraph(p_el, col_width, page_height, _flattened = false) {
  const raw_text = (p_el.textContent ?? "").toString();
  const text = raw_text.replace(/\s+/g, " ").trim();
  if (!text.length) return { head: null, tail: null };

  const is_plain_text =
    p_el.childNodes.length === 1 &&
    p_el.firstChild &&
    p_el.firstChild.nodeType === 3;

  if (!is_plain_text) {
    if (_flattened) return { head: null, tail: null };
    const plain = document.createElement("p");
    plain.textContent = text;
    return split_paragraph(plain, col_width, page_height, true);
  }

  const full = p_el.cloneNode(false);
  full.textContent = text;
  if (measure_at_width(full, col_width).h <= page_height) {
    return { head: p_el.cloneNode(true), tail: null };
  }

  const head = p_el.cloneNode(false);
  const tail = p_el.cloneNode(false);

  let lo = 0,
    hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    head.textContent = text.slice(0, mid);
    const m = measure_at_width(head, col_width);
    if (m.h <= page_height) lo = mid;
    else hi = mid - 1;
  }

  let break_idx = lo;
  while (break_idx > 0 && !/\s/.test(text[break_idx - 1])) break_idx--;
  if (break_idx === 0) break_idx = lo;

  const head_text = text.slice(0, break_idx).replace(/\s+$/, "");
  const tail_text = text.slice(break_idx).replace(/^\s+/, "");

  head.textContent = head_text;
  tail.textContent = tail_text;

  return {
    head: head_text ? head : null,
    tail: tail_text ? tail : null,
  };
}

function split_element(el, col_width, page_height) {
  const tag = el.tagName;
  if (tag === "P") return split_paragraph(el, col_width, page_height);
  if (tag === "UL" || tag === "OL") {
    const head = el.cloneNode(false);
    const tail = el.cloneNode(false);
    const items = Array.from(el.children);
    for (let i = 0; i < items.length; i++) {
      head.appendChild(items[i].cloneNode(true));
      const m = measure_at_width(head, col_width);
      if (m.h > page_height) {
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

export function paginate(args) {
  const measurer_el = args.measurer_el ?? args.measurerEl;
  const page_px = args.page_px ?? args.pagePx;
  const pad = args.pad;
  const columns = args.columns;
  const column_gap = args.column_gap ?? args.columnGap;
  if (!measurer_el || !page_px || !pad)
    return { pages: [], heads: [], foots: [] };

  measure_host = measurer_el;

  const page_height = page_px.h - (pad.top + pad.bottom);
  const cols = Math.max(1, Number(columns) || 1);
  const col_gap_px = (Number(column_gap) || 0) * px_per_mm;
  const inner_width = page_px.w - (pad.left + pad.right);
  const col_width =
    cols > 1 ? (inner_width - col_gap_px * (cols - 1)) / cols : inner_width;

  const nodes = Array.from(measurer_el.childNodes).filter(
    (n) => n.nodeType === 1
  );

  const pages = [];
  const heads = [];
  const foots = [];

  let page_chunks = [];
  let col_index = 0;
  let col_height = 0;
  let prev_mb = 0;
  let run_head = "";
  let run_foot = "";

  const close_page = () => {
    pages.push(page_chunks.join(""));
    heads.push(run_head);
    foots.push(run_foot);
    page_chunks = [];
    col_index = 0;
    col_height = 0;
    prev_mb = 0;
  };

  const next_col_or_page = () => {
    if (col_index < cols - 1) {
      col_index += 1;
      col_height = 0;
      prev_mb = 0;
    } else {
      close_page();
    }
  };

  const push_now = (html) => {
    page_chunks.push(html);
  };

  let i = 0;
  while (i < nodes.length) {
    const n = nodes[i];

    if (n.hasAttribute && n.hasAttribute("data-runhead")) {
      run_head = n.getAttribute("data-runhead") || "";
      i++;
      continue;
    }
    if (n.hasAttribute && n.hasAttribute("data-runfoot")) {
      run_foot = n.getAttribute("data-runfoot") || "";
      i++;
      continue;
    }

    if (n.hasAttribute && n.hasAttribute("data-pagebreak")) {
      close_page();
      i++;
      continue;
    }
    if (n.hasAttribute && n.hasAttribute("data-colbreak")) {
      push_now('<div class="force-colbreak"></div>');
      next_col_or_page();
      i++;
      continue;
    }
    if (n.hasAttribute && n.hasAttribute("data-rowbreak")) {
      const meas = measure_at_width(n, col_width);
      const inc =
        col_height === 0 ? meas.h : meas.h - Math.min(prev_mb, meas.mt);

      if (inc <= page_height - col_height) {
        push_now(n.outerHTML);
        col_height += inc;
        prev_mb = meas.mb;
        i++;
      } else {
        next_col_or_page();
      }
      continue;
    }

    if (["META", "LINK", "SCRIPT", "STYLE"].includes(n.tagName)) {
      i++;
      continue;
    }

    const el = n;
    const span_all = is_span_all(el);

    const meas = measure_at_width(el, span_all ? inner_width : col_width);
    const inc = col_height === 0 ? meas.h : meas.h - Math.min(prev_mb, meas.mt);
    const room = page_height - col_height;

    if (inc <= room) {
      push_now(el.outerHTML);
      col_height += inc;
      prev_mb = meas.mb;
      i++;
      continue;
    }

    if (meas.h <= page_height) {
      next_col_or_page();

      continue;
    }

    const target_width = span_all ? inner_width : col_width;
    const { head, tail } = split_element(el, target_width, room);
    if (head) {
      const head_meas = measure_at_width(head, target_width);
      const head_inc =
        col_height === 0
          ? head_meas.h
          : head_meas.h - Math.min(prev_mb, head_meas.mt);

      if (head_inc <= page_height - col_height) {
        push_now(head.outerHTML);
        col_height += head_inc;
        prev_mb = head_meas.mb;
        if (tail) nodes.splice(i + 1, 0, tail);
        i++;
        continue;
      } else {
        next_col_or_page();
        continue;
      }
    }

    push_now(el.outerHTML);
    close_page();
    i++;
  }

  pages.push(page_chunks.join(""));
  heads.push(run_head);
  foots.push(run_foot);

  measure_host = null;
  return { pages, heads, foots };
}
