const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatPlainSegment(text: string): string {
  const tokens: string[] = [];
  const token = (html: string) => {
    const id = tokens.length;
    tokens.push(html);
    return `\x00T${id}\x00`;
  };

  let out = text;

  out = out.replace(/<mark class="search-highlight">([\s\S]*?)<\/mark>/g, (_match, inner: string) =>
    token(`<mark class='search-highlight'>${escapeHtml(inner)}</mark>`),
  );

  out = out.replace(
    /(^|\n)([ـ\u0640]+|(?:\.\s*){4,})(?=\n|$)/g,
    (_match, prefix: string, separator: string) =>
      `${prefix}${token(`<span class='fiqh-separator' aria-hidden='true'>${separator}</span>`)}`,
  );

  out = out.replace(
    /(^|\n)(\*{2,3})(?=\n|$)/g,
    (_match, prefix: string, marker: string) =>
      `${prefix}${token(`<span class='fiqh-section-mark'>${marker}</span>`)}`,
  );

  out = out.replace(/""([^"]+)""/g, (_match, inner: string) =>
    token(`<span class='fiqh-quote'>"${inner}"</span>`),
  );

  out = out.replace(/\(\(([^)]+)\)\)/g, (_match, inner: string) =>
    token(`<span class='fiqh-hadith-ref'>((${inner}))</span>`),
  );

  out = out.replace(
    /\[([^\[\]\n]+?)\]/g,
    (match, inner: string) => {
      const trimmed = inner.trim();
      if (/^\(?[٠-٩0-9]+\)?$/.test(trimmed)) {
        return token(`<sup class='fiqh-fn-ref'>${match}</sup>`);
      }
      return token(`<span class='fiqh-source-ref'>[${inner}]</span>`);
    },
  );

  out = out.replace(
    new RegExp(`\\(([${ARABIC_DIGITS}0-9]+)\\)`, "g"),
    (_match, num: string) => token(`<sup class='fiqh-fn-ref'>(${num})</sup>`),
  );

  out = out.replace(/"([^"]+)"/g, (_match, inner: string) =>
    token(`<span class='fiqh-quote'>"${inner}"</span>`),
  );

  out = out.replace(/(^|[\s(])م:\s*/g, (_match, prefix: string) =>
    `${prefix}${token("<span class='fiqh-matn-label'>م:</span>")} `,
  );
  out = out.replace(/(^|[\s(])ش:\s*/g, (_match, prefix: string) =>
    `${prefix}${token("<span class='fiqh-sharh-label'>ش:</span>")} `,
  );
  out = out.replace(/قوله:\s*/g, () => token("<span class='fiqh-speaker'>قوله:</span> "));
  out = out.replace(/قال\s+/g, () => token("<span class='fiqh-speaker'>قال</span> "));

  out = out.replace(/\*\*([^*\n]+?)\*\*/g, (_match, inner: string) =>
    token(`<strong class='fiqh-emphasis'>${inner}</strong>`),
  );

  out = out.replace(/(^|[^\*])\*([^*\n]+?)\*(?!\*)/g, (_match, prefix: string, inner: string) =>
    `${prefix}${token(`<span class='fiqh-ayah'>* ${inner} *</span>`)}`,
  );

  out = out.replace(/\n/g, () => token("<br />"));

  const expandTokens = (value: string): string =>
    value.replace(/\x00T(\d+)\x00/g, (_, id: string) => {
      const content = tokens[Number(id)] ?? "";
      return expandTokens(content);
    });

  return out.split(/(\x00T\d+\x00)/).map((part) => {
    const match = part.match(/^\x00T(\d+)\x00$/);
    if (match) {
      return expandTokens(tokens[Number(match[1])] ?? "");
    }
    return escapeHtml(part);
  }).join("");
}

export function formatPassageHtml(raw: string): string {
  return formatPlainSegment(raw);
}
