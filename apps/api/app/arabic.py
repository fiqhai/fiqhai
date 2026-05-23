from __future__ import annotations

import re


_DIACRITICS_RE = re.compile(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]")
_TATWEEL_RE = re.compile(r"\u0640+")
_PUNCT_RE = re.compile(r"[^\w\s\u0600-\u06FF]+", re.UNICODE)
_SPACE_RE = re.compile(r"\s+")


def normalize_arabic(value: str) -> str:
    """Return a conservative Arabic normalization used only for search."""
    value = _DIACRITICS_RE.sub("", value)
    value = _TATWEEL_RE.sub("", value)
    value = value.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا")
    value = value.replace("ى", "ي")
    value = value.replace("ؤ", "و").replace("ئ", "ي")
    value = value.replace("ة", "ه")
    value = _PUNCT_RE.sub(" ", value)
    return _SPACE_RE.sub(" ", value).strip()


_NORMALIZED_STOPWORDS = {
    "في", "من", "علي", "الي", "عن", "مع", "ان", "هذا", "هذه", "التي", "الذي",
    "ما", "لا", "لم", "لن", "ثم", "او", "ام", "بل", "لكن", "قد", "لقد", "كان", "كانت"
}


def fts_query(value: str, mode: str = "all") -> str:
    """Create a safe FTS5 query from user text based on search mode."""
    normalized = normalize_arabic(value)
    terms = [term for term in normalized.split(" ") if len(term) > 1]
    if not terms:
        return ""
    if mode == "exact":
        return f'"{ " ".join(terms) }"'
    
    # Filter common Arabic stopwords in non-exact matching modes to avoid noise
    terms = [t for t in terms if t not in _NORMALIZED_STOPWORDS]
    if not terms:
        # Fallback to original terms if everything was a stopword
        terms = [term for term in normalized.split(" ") if len(term) > 1]

    if not terms:
        return ""
        
    if mode == "any":
        return " OR ".join(terms)
    else:  # "all"
        return " AND ".join(terms)


def highlight_arabic_text(text: str, query: str) -> str:
    """Highlight matching words in the raw Arabic text, ignoring diacritics and tatweel."""
    normalized_query = normalize_arabic(query)
    # Get terms from query that are at least 2 characters long
    terms = [term for term in normalized_query.split(" ") if len(term) > 1]
    if not terms:
        return text

    # Sort terms by length in descending order to avoid matching substrings of longer matches first
    terms.sort(key=len, reverse=True)

    # Character mappings from normalized char to regex of possible raw chars
    char_map = {
        "ا": "[اأإآ]",
        "أ": "[اأإآ]",
        "إ": "[اأإآ]",
        "آ": "[اأإآ]",
        "ى": "[ىيئ]",
        "ي": "[ىيئ]",
        "ئ": "[ىيئ]",
        "ؤ": "[ؤو]",
        "و": "[ؤو]",
        "ة": "[ةه]",
        "ه": "[ةه]",
    }

    # Match diacritics (harakat) and tatweel that might appear between letters
    diacritics_pattern = r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]*"

    matches: list[tuple[int, int]] = []
    
    for term in terms:
        # Construct the regex pattern for this term
        pattern_parts = []
        for char in term:
            pattern_parts.append(char_map.get(char, re.escape(char)))
        # Join characters with optional diacritics
        pattern = diacritics_pattern.join(pattern_parts)
        
        try:
            regex = re.compile(pattern)
            for m in regex.finditer(text):
                matches.append((m.start(), m.end()))
        except Exception:
            continue

    if not matches:
        return text

    # Sort matches by start position, then by end position descending
    matches.sort(key=lambda x: (x[0], -x[1]))

    # Merge overlapping or contiguous matches
    merged_matches: list[tuple[int, int]] = []
    for start, end in matches:
        if not merged_matches:
            merged_matches.append((start, end))
        else:
            prev_start, prev_end = merged_matches[-1]
            if start <= prev_end:
                merged_matches[-1] = (prev_start, max(prev_end, end))
            else:
                merged_matches.append((start, end))

    # Reconstruct text with mark tags
    result_parts = []
    last_idx = 0
    for start, end in merged_matches:
        result_parts.append(text[last_idx:start])
        result_parts.append('<mark class="search-highlight">')
        result_parts.append(text[start:end])
        result_parts.append('</mark>')
        last_idx = end
    result_parts.append(text[last_idx:])

    return "".join(result_parts)


