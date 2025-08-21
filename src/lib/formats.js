export const page_sizes = {
  A7: {
    id: "A7",
    label: "A7 (74×105mm)",
    w: 74,
    h: 105,
    margins: { top: 5, right: 5, bottom: 5, left: 5 },
  },
  A6: {
    id: "A6",
    label: "A6 (105×148mm)",
    w: 105,
    h: 148,
    margins: { top: 5, right: 5, bottom: 5, left: 5 },
  },
  A5: {
    id: "A5",
    label: "A5 (148×210mm)",
    w: 148,
    h: 210,
    margins: { top: 5, right: 5, bottom: 5, left: 5 },
  },
  A4: {
    id: "A4",
    label: "A4 (210×297mm)",
    w: 210,
    h: 297,
    margins: { top: 5, right: 5, bottom: 5, left: 5 },
  },
  Letter: {
    id: "Letter",
    label: "Letter (216×279mm)",
    w: 216,
    h: 279,
    margins: { top: 5, right: 5, bottom: 5, left: 5 },
  },
};

export const px_per_mm = 96 / 25.4;

export function build_print_css({ sizeId }) {
  const s = page_sizes[sizeId] ?? page_sizes.A7;
  const mm = (n) => `${n}mm`;

  return `
@media print {
  @page { size: ${mm(s.w)} ${mm(s.h)}; margin: 0; }

  html, body { margin: 0; padding: 0; height: auto; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  .topbar, .workspace .left, .workspace .splitter, .spreads { display: none !important; }
  #print-root { display: block !important; }

  #print-root .print-page {
    width: ${mm(s.w)} !important;
    height: ${mm(s.h)} !important;
    page-break-after: always;
    box-shadow: none !important;
    background: white;
  }
  #print-root .print-page:last-child { page-break-after: auto; }
}
`;
}
