export function inject_print_css(
  s,
  margins,
  columns,
  column_gap,
  font_family,
  base_font_pt,
  line_height,
  justify,
  hyphens,
  print_mode,
  spread_gutter
) {
  const mm = (n) => `${n}mm`;
  const sheet_w = print_mode === "spreads" ? s.w * 2 + spread_gutter : s.w;
  const sheet_h = s.h;
  const css = `
@page { size: ${mm(sheet_w)} ${mm(sheet_h)}; margin: 0; }
@media print {
  body { background: #fff !important; }
  .topbar, .workspace .left, .workspace .splitter, .right .spreads { display: none !important; }
  #print-root { display: block !important; }
  #print-root .print-page { width: ${mm(s.w)}; height: ${mm(
    s.h
  )}; background: #fff; box-shadow: none !important; page-break-after: always; }
  #print-root .print-page:last-child { page-break-after: auto; }
  #print-root .print-sheet { display: flex; align-items: stretch; width: ${mm(
    sheet_w
  )}; height: ${mm(sheet_h)}; page-break-after: always; background: #fff; }
  #print-root .print-sheet:last-child { page-break-after: auto; }
  #print-root .print-gutter { width: ${mm(spread_gutter)}; flex: 0 0 ${mm(
    spread_gutter
  )}; }
  #print-root .print-inner {
    box-sizing: border-box; width: 100%; height: 100%; overflow: hidden;
    padding: ${mm(margins.top)} ${mm(margins.right)} ${mm(margins.bottom)} ${mm(
    margins.left
  )};
    --pad-top:${mm(margins.top)}; --pad-right:${mm(
    margins.right
  )}; --pad-bottom:${mm(margins.bottom)}; --pad-left:${mm(margins.left)};
    column-count: ${columns}; column-gap: ${mm(column_gap)};
    font-family: ${font_family}; font-size: ${base_font_pt}pt; line-height: ${line_height};
    text-align: ${
      justify === "justify" ? "justify" : "left"
    }; hyphens: ${hyphens};
  }
}
`;
  let style = document.getElementById("print-rules");
  if (!style) {
    style = document.createElement("style");
    style.id = "print-rules";
    document.head.appendChild(style);
  }
  style.textContent = css;
}
