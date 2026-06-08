"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatPassageHtml } from "@/lib/formatPassage";

type Book = {
  id: number;
  title: string;
  authors: string[];
  categories: string[];
  publisher: string | null;
  year: string | null;
  chunk_count: number;
};

type SearchResult = {
  id: number;
  book_id: number;
  book_title: string;
  authors: string[];
  categories: string[];
  publisher: string | null;
  year: string | null;
  part_name: string | null;
  page_number: number | null;
  page_id: number | null;
  breadcrumb: string[];
  text: string;
  score: number;
  citation: string;
  text_highlighted?: string;
};

type SearchResponse = {
  query: string;
  count: number;
  results: SearchResult[];
  disclaimer: string;
};

type UiCopy = (typeof uiCopy)[Locale];

const ARABIC_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

function stripArabicDiacritics(text: string): string {
  return text.replace(/[\u064B-\u0652]/g, "");
}

const MATCH_REASON_TYPES = ["literal", "partial", "semantic", "adjacent", "indexed"] as const;
type MatchReasonType = (typeof MATCH_REASON_TYPES)[number];

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, "");
}

function contentDir(text: string): "rtl" | "ltr" | "auto" {
  const hasArabic = ARABIC_SCRIPT_RE.test(text);
  const hasLatin = /[A-Za-z]/.test(text);
  if (hasArabic) return "rtl";
  if (hasLatin) return "ltr";
  return "auto";
}

function resolveMatchReason(result: SearchResult, queryText: string): { type: MatchReasonType; partialCount?: number } {
  const textClean = stripArabicDiacritics(result.text).toLowerCase();
  const queryClean = stripArabicDiacritics(queryText).toLowerCase().trim();

  if (queryClean && textClean.includes(queryClean)) {
    return { type: "literal" };
  }

  const queryWords = queryClean.split(/\s+/).filter((word) => word.length > 2);
  const matchedWords = queryWords.filter((word) => textClean.includes(word));
  if (matchedWords.length > 0) {
    return { type: "partial", partialCount: matchedWords.length };
  }

  if (result.score > 0 && result.score < 1) {
    return { type: "semantic" };
  }
  if (result.score === 0) {
    return { type: "adjacent" };
  }
  return { type: "indexed" };
}

function formatMatchReason(
  reason: { type: MatchReasonType; partialCount?: number },
  copy: UiCopy,
): string {
  switch (reason.type) {
    case "literal":
      return copy.literalMatch;
    case "partial":
      return copy.partialMatch(reason.partialCount ?? 0);
    case "semantic":
      return copy.semanticMatch;
    case "adjacent":
      return copy.adjacentContext;
    case "indexed":
      return copy.indexedMatch;
  }
}

function matchReasonFilterLabel(type: MatchReasonType, copy: UiCopy): string {
  switch (type) {
    case "literal":
      return copy.literalMatch;
    case "partial":
      return copy.partialMatchShort;
    case "semantic":
      return copy.semanticMatch;
    case "adjacent":
      return copy.adjacentContext;
    case "indexed":
      return copy.indexedMatch;
  }
}

type AppView = "search" | "method" | "developers" | "policies";

type SearchExperienceProps = {
  apiBaseUrl: string;
  books: Book[];
  view?: AppView;
};

const themes = [
  { id: "parchment", label: { ar: "فاتح", en: "Light" } },
  { id: "sepia", label: { ar: "سيبيا", en: "Sepia" } },
  { id: "night", label: { ar: "داكن", en: "Dark" } },
] as const;

type ThemeId = (typeof themes)[number]["id"];

function normalizeThemeId(id: string | null | undefined): ThemeId {
  if (!id || id === "emerald") return "parchment";
  return themes.some((item) => item.id === id) ? (id as ThemeId) : "parchment";
}
type SearchMode = "all" | "any" | "exact";
type Locale = "ar" | "en";
const DEFAULT_LOCALE: Locale = "ar";
type ReadingFontId = "amiri" | "noto";

function normalizeReadingFontId(id: string | null | undefined): ReadingFontId {
  return id === "noto" ? "noto" : "amiri";
}

type DeveloperCredit = {
  name: string;
  role: { ar: string; en: string };
  imageUrl: string;
  portfolioUrl?: string;
};

const developers: DeveloperCredit[] = [
  {
    name: "Mohammad Usman",
    role: { ar: "مطور تطبيقات", en: "App Developer" },
    imageUrl: "https://www.myrentalfind.com/dev/mohammad-usman.png",
    portfolioUrl: "https://portfolio-mohammad.web.app/",
  },
  {
    name: "Hashim Hameem",
    role: { ar: "مطور شامل للويب والجوال", en: "Full-Stack Developer" },
    imageUrl: "https://www.myrentalfind.com/dev/hashim-hameem.png",
    portfolioUrl: "https://hashimhameem.site",
  },
];

const arabicKeyboardRows = [
  ["ض", "ص", "ث", "ق", "ف", "غ", "ع", "ه", "خ", "ح", "ج"],
  ["ش", "س", "ي", "ب", "ل", "ا", "ت", "ن", "م", "ك", "ط"],
  ["ئ", "ء", "ؤ", "ر", "لا", "ى", "ة", "و", "ز", "ظ", "د", "ذ"],
  ["أ", "إ", "آ"],
] as const;

const arabicKeyboardNumberRow = ["١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩", "٠"] as const;

type ArabicKeyboardTarget = "search" | "book";

const uiCopy = {
  ar: {
    navSearch: "البحث",
    navAbout: "المنهجية",
    booksCount: (count: number) => `${count} كتاب`,
    landingTagline: "بحث مرجعي في نصوص الفقه الحنفي المعتمدة",
    homeKicker: (count: number) => `${count} كتب مفهرسة`,
    homeTitleStart: "بحث في كتب الفقه",
    homeTitleAccent: "الحنفي",
    searchPanelLabel: "لوحة البحث",
    indexedBooks: (count: number) => `${count} كتاب مفهرس`,
    matching: "المطابقة",
    display: "العرض",
    allWords: "الكل",
    anyWord: "أي كلمة",
    exactPhrase: "عبارة",
    group: "تجميع",
    searchPlaceholder: "اسأل أو ابحث في النصوص...",
    searchAria: "عبارة البحث الفقهي",
    arabicKeyboard: "لوحة المفاتيح العربية",
    arabicKeyboardHint: "لوحة عربية",
    arabicKeyboardSpace: "مسافة",
    arabicKeyboardBackspace: "حذف",
    backHome: "العودة للبحث",
    searching: "يبحث...",
    search: "بحث",
    controlsLabel: "خيارات البحث",
    showControls: "ضبط البحث",
    hideControls: "إخفاء الضبط",
    settings: "الإعدادات",
    appearance: "المظهر",
    readingFontLabel: "خط القراءة",
    languageLabel: "اللغة",
    arabic: "العربية",
    english: "English",
    changeTheme: "تغيير المظهر",
    themeMenu: "المظهر",
    sourcesHistory: "المصادر والسجل",
    language: "EN",
    examplesLabel: "أمثلة بحث سريعة",
    examplesTitle: "أمثلة",
    noResults: "لا نتائج",
    context: "السياق",
    copy: "نسخ",
    save: "حفظ",
    saved: "محفوظ",
    readContext: "قراءة الصفحات السابقة واللاحقة",
    copyCitation: "نسخ التخريج بصيغ متعددة",
    removeBookmark: "حذف من المحفوظات",
    addBookmark: "حفظ في المحفوظات",
    chicago: "شيكاغو",
    classical: "تراثي",
    tahqiq: "تحقيق",
    footnote: "حاشية",
    markdown: "ماركداون",
    plain: "نص عادي",
    matches: (count: number) => `${count} مواضع`,
    collapseMore: "طي المواضع",
    showMore: (count: number) => `عرض ${count} مواضع أخرى`,
    loadMore: (count: number) => `تحميل المزيد (${count})`,
    close: "إغلاق",
    notice: "تنبيه",
    noticeCopy: "أداة بحث ومراجعة للمصادر، وليست إصداراً للفتوى.",
    sources: "المصادر",
    clear: "مسح",
    cancelSelected: (count: number) => `إلغاء (${count})`,
    bookSearchPlaceholder: "ابحث عن كتاب...",
    unknownAuthor: "مؤلف غير محدد",
    noMatchingBook: "لا يوجد كتاب مطابق.",
    loadingIndex: "جاري جلب الفهرس...",
    savedItems: "المحفوظات",
    noSavedItems: "لا توجد محفوظات.",
    history: "السجل",
    noHistory: "لا يوجد سجل.",
    contextSubtitle: "الصفحات المتصلة بالموضع",
    decreaseFont: "تصغير الخط",
    increaseFont: "تكبير الخط",
    amiriFont: "أميري",
    naskhFont: "نسخ",
    plainFont: "عادي",
    loadingContext: "جاري جلب السياق...",
    showBookDetails: "عرض تفاصيل الكتاب",
    activePassage: "موضع البحث",
    neighborPage: "صفحة مجاورة",
    closeReader: "إغلاق القارئ",
    aboutTitle: "عن fiqh.ai",
    aboutLead: "بحث مرجعي داخل كتب الفقه الحنفي المعتمدة، مع استرجاع النصوص والمصادر دون توليد الفتوى.",
    semanticTitle: "بحث دلالي",
    semanticCopy: "يربط المعاني والمسائل القريبة داخل النصوص المفهرسة.",
    lexicalTitle: "مطابقة لفظية",
    lexicalCopy: "يدعم البحث الحرفي للحفاظ على دقة التخريج.",
    safetyTitle: "سلامة المصدر",
    safetyCopy: "يعرض النص والصفحة والكتاب كما وردت في الفهرس.",
    readerTitle: "قارئ السياق",
    readerCopy: "يفتح الصفحات المجاورة، مع التحكم في الخط والتوثيق.",
    libraryTitle: (count: number) => `المكتبة (${count})`,
    authoredBy: "تأليف",
    fiqhChunks: (count: number) => `${count} مقطع`,
    oldEdition: "طبعة قديمة",
    bookCardTitle: "تفاصيل الكتاب",
    bookCardSubtitle: "بيانات المصدر",
    author: "المؤلف",
    category: "التصنيف",
    publisher: "الناشر",
    year: "السنة",
    indexedSize: "المقاطع",
    bookId: "المعرّف",
    unknownPublisher: "غير محدد",
    undated: "غير مؤرخ",
    chunkCount: (count: number) => `${count} مقطع`,
    citationFormat: "صيغة التوثيق",
    copyCitationFormat: "نسخ التوثيق",
    closeBookCard: "إغلاق",
    top: "العودة لأعلى الصفحة",
    emptyPrompt: "أدخل عبارة للبحث في النصوص المفهرسة.",
    shortQuery: "اكتب كلمتين أو أكثر للبحث.",
    searchingIndex: "جاري البحث في الفهرس...",
    foundResults: (count: number) => `تم العثور على ${count} نتيجة.`,
    notFound: "لم يتم العثور على مرجع موثوق. جرب عبارة أخرى.",
    searchError: "تعذر الاتصال بواجهة البحث.",
    contextError: "تعذر تحميل الصفحات المحيطة.",
    bookmarkRemoved: "تمت إزالة المحفوظة",
    bookmarkSaved: "تم الحفظ",
    historyCleared: "تم مسح السجل",
    copiedChicago: "تم نسخ تنسيق شيكاغو",
    copiedClassical: "تم نسخ الاقتباس",
    copiedTahqiq: "تم نسخ التخريج",
    copiedFootnote: "تم نسخ الحاشية",
    copiedMarkdown: "تم نسخ ماركداون",
    copiedPlain: "تم نسخ النص",
    copiedBookCitation: "تم نسخ التوثيق",
    partAbbrev: "ج",
    pageAbbrev: "ص",
    literalMatch: "مطابقة لفظية تامة",
    partialMatch: (count: number) => `تطابق جزئي (${count})`,
    semanticMatch: "تقارب دلالي",
    adjacentContext: "سياق مجاور",
    indexedMatch: "مطابقة فهرسية",
    matchReasonLabel: "سبب الظهور",
    matchReasonFilterLabel: "تصفية حسب سبب الظهور",
    partialMatchShort: "تطابق جزئي",
    mainNavigation: "التنقل الرئيسي",
    readContextAction: "قراءة السياق",
    overview: "نظرة عامة",
    sourceVerificationTitle: "التزامنا بالسلامة العلمية",
    sourceVerificationCopy: "كل نتيجة تعرض مع مصدرها الأصلي ورقم الجزء والصفحة لضمان التوثيق الدقيق.",
    sectionSemantic: "البحث الدلالي",
    sectionLexical: "المطابقة اللفظية",
    sectionSafety: "السلامة العلمية",
    sectionReader: "منصة الباحث",
    tableBook: "الكتاب",
    tableAuthor: "المؤلف",
    tableChunks: "عدد المقاطع",
    tableDeathYear: "سنة الوفاة",
    bookFilters: "تصفية حسب الكتب",
    indexedChunksLabel: "عدد الصفحات المفهرسة",
    citationTemplate: "نموذج تخريج",
    copyTemplate: "نسخ النموذج",
    templateCopied: "تم نسخ النموذج",
    contextReaderTitle: "قارئ السياق",
    toastCopiedTitle: "تم النسخ بنجاح",
    toastCopiedDefault: "تم نسخ التخريج إلى الحافظة",
    mobileMethodology: "منهجية العمل",
    authorSeparator: "، ",
    pageTitle: "fiqh.ai — بحث مرجعي في كتب الفقه الحنفي",
    exampleQueries: [
      "سؤر الهرة",
      "الماء المستعمل",
      "تطهير الآبار",
      "صلاة المسافر",
      "زكاة الفطر",
      "الوضوء",
      "غسل الجنابة",
      "الوتر",
      "الخاتم في الوضوء",
    ],
    noticeIcon: "تنبيه",
    bookFiltersIcon: "كتب",
    savedIcon: "محفوظ",
    historyIcon: "سجل",
    searchHistoryIcon: "بحث",
    fontSizeUnit: "بكسل",
    citationSample: (title: string, author: string, publisher: string, year: string) =>
      `${title}، ${author}، ${publisher}، ${year}، المجلد 2، الصفحة 221.`,
    sectionHeading: (num: string, title: string) => `${num} ${title}`,
    topicLabel: "باب/موضوع",
    generalTopic: "عام",
    chunkRef: (id: number) => `مقطع #${id}`,
    publisherLabel: "ناشر",
    yearPrintedLabel: "سنة الطبع",
    volumePartLabel: "المجلد/الجزء",
    pageLabel: "الصفحة",
    undefinedPage: "غير محدد",
    sourceLabel: "المصدر",
    chicagoCitation: (citation: string, breadcrumb: string, id: number) =>
      `${citation}، باب/موضوع: ${breadcrumb} (${uiCopy.ar.chunkRef(id)})`,
    classicalCitation: (bookTitle: string, authors: string, publisherPart: string, volumePart: string, pagePart: string) =>
      `(${bookTitle}، ${uiCopy.ar.authoredBy}: ${authors}${publisherPart}${volumePart}${pagePart})`,
    tahqiqCitation: (bookTitle: string, authors: string, publisherPart: string, yearPart: string, volumePart: string, pagePart: string) =>
      `${bookTitle}،\n${uiCopy.ar.authoredBy}: ${authors}،\n${publisherPart}${yearPart}${volumePart}${pagePart}`,
    footnoteCitation: (authors: string, bookTitle: string, publisherPart: string, volumePart: string, pagePart: string) =>
      `¹ ${authors}، ${bookTitle}${publisherPart}${volumePart}${pagePart}.`,
    markdownCitation: (text: string, citation: string, breadcrumb: string, id: number) =>
      `> ${text}\n\n— *${citation}، ${uiCopy.ar.topicLabel}: ${breadcrumb}* (${uiCopy.ar.chunkRef(id)})`,
    plainCitation: (text: string, citation: string) => `"${text}"\n[${uiCopy.ar.sourceLabel}: ${citation}]`,
    publisherPart: (publisher: string) => `، ${uiCopy.ar.publisherLabel}: ${publisher}`,
    publisherPartLong: (publisher: string) => `الناشر: ${publisher}، `,
    yearPart: (year: string) => `${uiCopy.ar.yearPrintedLabel}: ${year}، `,
    volumePartShort: (part: string) => `، ${uiCopy.ar.partAbbrev}${part}`,
    pagePartShort: (page: number) => `، ${uiCopy.ar.pageAbbrev}${page}`,
    volumePartLong: (part: string) => `${uiCopy.ar.volumePartLabel}: ${part}، `,
    pagePartLong: (page: number) => `${uiCopy.ar.pageLabel}: ${page}`,
    pagePartUndefined: () => `${uiCopy.ar.pageLabel}: ${uiCopy.ar.undefinedPage}`,
    footnotePublisherPart: (publisher: string) => ` (${publisher})`,
    footnoteVolumePart: (part: string) => `، ${uiCopy.ar.partAbbrev} ${part}`,
    footnotePagePart: (page: number) => `، ${uiCopy.ar.pageAbbrev} ${page}`,
    builtBy: "التطوير:",
    navDevelopers: "المطورون",
    navPolicies: "السياسات",
    footerNavigation: "روابط الموقع",
    developersTitle: "فريق تطوير fiqh.ai",
    developersLead: "المطورون الذين يبنون ويحافظون على منصة البحث الفقهي.",
    policiesTitle: "السياسات والإرشادات",
    policiesLead: "مبادئ الاستخدام والمصادر والخصوصية لمنصة البحث في الفقه الحنفي.",
    policyUsageTitle: "الاستخدام",
    policyUsageCopy: "fiqh.ai أداة بحث ومراجعة في كتب الفقه الحنفي المعتمدة فقط. لا تصدر فتوى ولا تحل محل الاستفتاء عند أهل العلم.",
    policySourceTitle: "دقة المصادر",
    policySourceCopy: "كل نتيجة تعرض النص كما ورد في الفهرس، مع الكتاب والجزء والصفحة، من مصادر حنفية محققة ومفهرسة.",
    policyPrivacyTitle: "الخصوصية",
    policyPrivacyCopy: "يُحفظ سجل البحث وتفضيلات العرض محلياً في متصفحك. تُرسل عبارات البحث إلى واجهة الفهرس لاسترجاع النتائج فقط، دون إنشاء حساب أو جمع بيانات شخصية.",
  },
  en: {
    navSearch: "Search",
    navAbout: "Method",
    booksCount: (count: number) => `${count} books`,
    landingTagline: "Reference search across verified Hanafi fiqh texts",
    homeKicker: (count: number) => `${count} indexed books`,
    homeTitleStart: "Search Hanafi fiqh",
    homeTitleAccent: "books",
    searchPanelLabel: "Search panel",
    indexedBooks: (count: number) => `${count} indexed books`,
    matching: "Match",
    display: "View",
    allWords: "All",
    anyWord: "Any",
    exactPhrase: "Phrase",
    group: "Group",
    searchPlaceholder: "Ask or search the texts...",
    searchAria: "Fiqh search query",
    arabicKeyboard: "Arabic keyboard",
    arabicKeyboardHint: "Arabic keyboard",
    arabicKeyboardSpace: "Space",
    arabicKeyboardBackspace: "Backspace",
    backHome: "Back to search",
    searching: "Searching...",
    search: "Search",
    controlsLabel: "Search options",
    showControls: "Options",
    hideControls: "Hide options",
    settings: "Settings",
    appearance: "Appearance",
    readingFontLabel: "Reading font",
    languageLabel: "Language",
    arabic: "العربية",
    english: "English",
    changeTheme: "Change theme",
    themeMenu: "Theme",
    sourcesHistory: "Sources",
    language: "AR",
    examplesLabel: "Quick examples",
    examplesTitle: "Examples",
    noResults: "No results",
    context: "Context",
    copy: "Copy",
    save: "Save",
    saved: "Saved",
    readContext: "Read surrounding pages",
    copyCitation: "Copy citation formats",
    removeBookmark: "Remove from saved",
    addBookmark: "Save result",
    chicago: "Chicago",
    classical: "Classical",
    tahqiq: "Tahqiq",
    footnote: "Footnote",
    markdown: "Markdown",
    plain: "Plain text",
    matches: (count: number) => `${count} matches`,
    collapseMore: "Collapse",
    showMore: (count: number) => `Show ${count} more`,
    loadMore: (count: number) => `Load more (${count})`,
    close: "Close",
    notice: "Note",
    noticeCopy: "A source review tool, not a fatwa issuer.",
    sources: "Sources",
    clear: "Clear",
    cancelSelected: (count: number) => `Clear (${count})`,
    bookSearchPlaceholder: "Search books...",
    unknownAuthor: "Unknown author",
    noMatchingBook: "No matching book.",
    loadingIndex: "Loading index...",
    savedItems: "Saved",
    noSavedItems: "No saved items.",
    history: "History",
    noHistory: "No history.",
    contextSubtitle: "Pages around this passage",
    decreaseFont: "Smaller text",
    increaseFont: "Larger text",
    amiriFont: "Amiri",
    naskhFont: "Naskh",
    plainFont: "Plain",
    loadingContext: "Loading context...",
    showBookDetails: "Show book details",
    activePassage: "Result",
    neighborPage: "Nearby",
    closeReader: "Close reader",
    aboutTitle: "About fiqh.ai",
    aboutLead: "Reference search across verified Hanafi fiqh books, retrieving source text and citations without issuing fatwa.",
    semanticTitle: "Semantic search",
    semanticCopy: "Connects nearby meanings and related legal questions in the indexed texts.",
    lexicalTitle: "Lexical match",
    lexicalCopy: "Keeps exact phrase search available for precise citation work.",
    safetyTitle: "Source safety",
    safetyCopy: "Shows the text, page, and book as stored in the index.",
    readerTitle: "Context reader",
    readerCopy: "Opens neighboring pages with typography and citation controls.",
    libraryTitle: (count: number) => `Library (${count})`,
    authoredBy: "By",
    fiqhChunks: (count: number) => `${count} chunks`,
    oldEdition: "Older edition",
    bookCardTitle: "Book details",
    bookCardSubtitle: "Source metadata",
    author: "Author",
    category: "Category",
    publisher: "Publisher",
    year: "Year",
    indexedSize: "Indexed text",
    bookId: "ID",
    unknownPublisher: "Unknown",
    undated: "Undated",
    chunkCount: (count: number) => `${count} chunks`,
    citationFormat: "Citation",
    copyCitationFormat: "Copy citation",
    closeBookCard: "Close",
    top: "Back to top",
    emptyPrompt: "Enter a phrase to search indexed texts.",
    shortQuery: "Type at least two characters to search.",
    searchingIndex: "Searching the index...",
    foundResults: (count: number) => `${count} results found.`,
    notFound: "No trusted indexed source found. Try another phrase.",
    searchError: "Could not reach the search API.",
    contextError: "Could not load surrounding pages.",
    bookmarkRemoved: "Removed from saved",
    bookmarkSaved: "Saved",
    historyCleared: "History cleared",
    copiedChicago: "Chicago copied",
    copiedClassical: "Citation copied",
    copiedTahqiq: "Tahqiq copied",
    copiedFootnote: "Footnote copied",
    copiedMarkdown: "Markdown copied",
    copiedPlain: "Text copied",
    copiedBookCitation: "Citation copied",
    partAbbrev: "vol.",
    pageAbbrev: "p.",
    literalMatch: "Exact lexical match",
    partialMatch: (count: number) => `Partial match (${count})`,
    semanticMatch: "Semantic match",
    adjacentContext: "Adjacent context",
    indexedMatch: "Indexed match",
    matchReasonLabel: "Match reason",
    matchReasonFilterLabel: "Filter by match reason",
    partialMatchShort: "Partial match",
    mainNavigation: "Main navigation",
    readContextAction: "Read context",
    overview: "Overview",
    sourceVerificationTitle: "Source verification",
    sourceVerificationCopy: "Each result displays with its original source and page number to ensure precise references.",
    sectionSemantic: "Semantic search",
    sectionLexical: "Lexical match",
    sectionSafety: "Scientific integrity",
    sectionReader: "Context reader",
    tableBook: "Book",
    tableAuthor: "Author",
    tableChunks: "Chunks",
    tableDeathYear: "Death year",
    bookFilters: "Book filters",
    indexedChunksLabel: "Indexed chunks",
    citationTemplate: "Citation template",
    copyTemplate: "Copy template",
    templateCopied: "Citation template copied",
    contextReaderTitle: "Context reader",
    toastCopiedTitle: "Copied successfully",
    toastCopiedDefault: "Citation copied to clipboard",
    mobileMethodology: "Methodology",
    authorSeparator: ", ",
    pageTitle: "fiqh.ai — Hanafi fiqh reference search",
    exampleQueries: [
      "سؤر الهرة",
      "الماء المستعمل",
      "تطهير الآبار",
      "صلاة المسافر",
      "زكاة الفطر",
      "الوضوء",
      "غسل الجنابة",
      "الوتر",
      "الخاتم في الوضوء",
    ],
    noticeIcon: "Note",
    bookFiltersIcon: "Books",
    savedIcon: "Saved",
    historyIcon: "History",
    searchHistoryIcon: "Search",
    fontSizeUnit: "px",
    citationSample: (title: string, author: string, publisher: string, year: string) =>
      `${title}, ${author}, ${publisher}, ${year}, vol. 2, p. 221.`,
    sectionHeading: (num: string, title: string) => `${num} ${title}`,
    topicLabel: "section/topic",
    generalTopic: "general",
    chunkRef: (id: number) => `chunk #${id}`,
    publisherLabel: "publisher",
    yearPrintedLabel: "edition year",
    volumePartLabel: "volume/part",
    pageLabel: "page",
    undefinedPage: "unspecified",
    sourceLabel: "source",
    chicagoCitation: (citation: string, breadcrumb: string, id: number) =>
      `${citation}, ${uiCopy.en.topicLabel}: ${breadcrumb} (${uiCopy.en.chunkRef(id)})`,
    classicalCitation: (bookTitle: string, authors: string, publisherPart: string, volumePart: string, pagePart: string) =>
      `(${bookTitle}, ${uiCopy.en.authoredBy}: ${authors}${publisherPart}${volumePart}${pagePart})`,
    tahqiqCitation: (bookTitle: string, authors: string, publisherPart: string, yearPart: string, volumePart: string, pagePart: string) =>
      `${bookTitle},\n${uiCopy.en.authoredBy}: ${authors},\n${publisherPart}${yearPart}${volumePart}${pagePart}`,
    footnoteCitation: (authors: string, bookTitle: string, publisherPart: string, volumePart: string, pagePart: string) =>
      `¹ ${authors}, ${bookTitle}${publisherPart}${volumePart}${pagePart}.`,
    markdownCitation: (text: string, citation: string, breadcrumb: string, id: number) =>
      `> ${text}\n\n— *${citation}, ${uiCopy.en.topicLabel}: ${breadcrumb}* (${uiCopy.en.chunkRef(id)})`,
    plainCitation: (text: string, citation: string) => `"${text}"\n[${uiCopy.en.sourceLabel}: ${citation}]`,
    publisherPart: (publisher: string) => `, ${uiCopy.en.publisherLabel}: ${publisher}`,
    publisherPartLong: (publisher: string) => `Publisher: ${publisher}, `,
    yearPart: (year: string) => `${uiCopy.en.yearPrintedLabel}: ${year}, `,
    volumePartShort: (part: string) => `, ${uiCopy.en.partAbbrev} ${part}`,
    pagePartShort: (page: number) => `, ${uiCopy.en.pageAbbrev} ${page}`,
    volumePartLong: (part: string) => `${uiCopy.en.volumePartLabel}: ${part}, `,
    pagePartLong: (page: number) => `${uiCopy.en.pageLabel}: ${page}`,
    pagePartUndefined: () => `${uiCopy.en.pageLabel}: ${uiCopy.en.undefinedPage}`,
    footnotePublisherPart: (publisher: string) => ` (${publisher})`,
    footnoteVolumePart: (part: string) => `, ${uiCopy.en.partAbbrev} ${part}`,
    footnotePagePart: (page: number) => `, ${uiCopy.en.pageAbbrev} ${page}`,
    builtBy: "Built by",
    navDevelopers: "Developers",
    navPolicies: "Policies",
    footerNavigation: "Site links",
    developersTitle: "Developers behind fiqh.ai",
    developersLead: "The team building and maintaining this Hanafi fiqh reference search platform.",
    policiesTitle: "Policies & guidance",
    policiesLead: "Usage, source integrity, and privacy for this Hanafi-only reference search.",
    policyUsageTitle: "Usage",
    policyUsageCopy: "fiqh.ai searches and surfaces verified Hanafi fiqh texts only. It does not issue fatwa or replace consultation with qualified scholars.",
    policySourceTitle: "Source accuracy",
    policySourceCopy: "Every result shows the indexed passage with book, part, and page metadata from the curated Hanafi corpus.",
    policyPrivacyTitle: "Privacy",
    policyPrivacyCopy: "Search history and display preferences stay in your browser. Queries are sent to the search API to retrieve results; no accounts or personal profiles are collected.",
  },
} as const;

function buildLocaleHref(path: string, locale: Locale, theme: ThemeId) {
  const params = new URLSearchParams();
  params.set("lang", locale);
  if (theme !== "parchment") {
    params.set("theme", theme);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

type Copy = (typeof uiCopy)[Locale];

function isKnownMessage(value: string, getter: (copy: Copy) => string) {
  return (Object.keys(uiCopy) as Locale[]).some((key) => getter(uiCopy[key]) === value);
}

function translateStatusMessage(value: string, nextCopy: Copy, resultCount: number, hasSearched: boolean) {
  if (!value) return value;
  if (isKnownMessage(value, (copy) => copy.emptyPrompt)) return nextCopy.emptyPrompt;
  if (isKnownMessage(value, (copy) => copy.shortQuery)) return nextCopy.shortQuery;
  if (isKnownMessage(value, (copy) => copy.searchingIndex)) return nextCopy.searchingIndex;
  if (isKnownMessage(value, (copy) => copy.notFound)) return nextCopy.notFound;
  if (
    hasSearched &&
    resultCount > 0 &&
    (Object.keys(uiCopy) as Locale[]).some((key) => uiCopy[key].foundResults(resultCount) === value)
  ) {
    return nextCopy.foundResults(resultCount);
  }
  return value;
}

function translateErrorMessage(value: string, nextCopy: Copy) {
  if (isKnownMessage(value, (copy) => copy.searchError)) return nextCopy.searchError;
  if (isKnownMessage(value, (copy) => copy.contextError)) return nextCopy.contextError;
  return value;
}

function translateToastMessage(value: string, nextCopy: Copy) {
  if (!value) return value;
  const toastMessages = [
    (copy: Copy) => copy.historyCleared,
    (copy: Copy) => copy.copiedChicago,
    (copy: Copy) => copy.copiedClassical,
    (copy: Copy) => copy.copiedTahqiq,
    (copy: Copy) => copy.copiedFootnote,
    (copy: Copy) => copy.copiedMarkdown,
    (copy: Copy) => copy.copiedPlain,
    (copy: Copy) => copy.copiedBookCitation,
    (copy: Copy) => copy.templateCopied,
    (copy: Copy) => copy.toastCopiedDefault,
  ] as const;

  for (const getter of toastMessages) {
    if (isKnownMessage(value, getter)) return getter(nextCopy);
  }
  return value;
}

function formatAuthors(authors: string[], separator: string, fallback: string) {
  return authors.length > 0 ? authors.join(separator) : fallback;
}

function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div>
        <div className="skeleton-line wide" />
        <div className="skeleton-line narrow" style={{ marginTop: 8 }} />
      </div>
      <div className="skeleton-line text" />
      <div className="skeleton-line text" />
      <div className="skeleton-line text-short" />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
        <div className="skeleton-line" style={{ width: 90, height: 28 }} />
        <div className="skeleton-line" style={{ width: 90, height: 28 }} />
      </div>
    </div>
  );
}

// Doodle-style SVG icons for the refined research UI
const DoodleLogoIcon = () => (
  <svg className="doodle-logo-icon" width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true">
    <path className="doodle-fill" d="M5.6 8.7c4.1-1.9 8.2-1.2 11.1 1.4 3-2.6 7.4-3.2 11.7-1.4v18.1c-4.5-1.6-8.6-1.1-11.7 1.3-3.1-2.4-7-2.9-11.1-1.3V8.7Z" />
    <path d="M16.8 10.1v18" />
    <path d="M8.9 12.5c2.6-.6 5.1 0 6.7 1.3" />
    <path d="M8.9 17.1c2.5-.5 4.8-.1 6.7 1.2" />
    <path d="M25.2 12.5c-2.8-.6-5.3-.1-6.9 1.3" />
    <path d="M25.2 17.1c-2.7-.5-5.1-.1-6.9 1.2" />
    <path d="M11.2 22.5c1.5-.1 3 .2 4.2.9" />
    <path d="M22.9 22.5c-1.6-.1-3 .2-4.2.9" />
  </svg>
);

const DoodleSettingsIcon = () => (
  <svg
    className="icon-svg doodle-settings-icon"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 4.2c1.1 0 1.9.6 2.2 1.6l.2.6 1.2.5.6-.3c.9-.4 1.9-.2 2.6.5s.8 1.8.3 2.6l-.3.6.5 1.2.6.2c1 .3 1.6 1.1 1.6 2.2s-.6 1.9-1.6 2.2l-.6.2-.5 1.2.3.6c.5.9.3 1.9-.4 2.6s-1.7.8-2.6.4l-.6-.3-1.2.5-.2.6c-.3 1-1.1 1.6-2.2 1.6s-1.9-.6-2.2-1.6l-.2-.6-1.2-.5-.6.3c-.9.4-1.9.2-2.6-.5s-.8-1.8-.3-2.6l.3-.6-.5-1.2-.6-.2c-1-.3-1.6-1.1-1.6-2.2s.6-1.9 1.6-2.2l.6-.2.5-1.2-.3-.6c-.5-.9-.3-1.9.4-2.6s1.7-.8 2.6-.4l.6.3 1.2-.5.2-.6c.3-1 1.1-1.6 2.2-1.6Z" />
    <path d="M9.2 12.2c.5-1.8 2.5-2.8 4.2-2.1 1.6.7 2.3 2.7 1.4 4.2-.8 1.4-2.7 1.9-4.1 1.1-1.1-.6-1.8-1.8-1.5-3.2Z" />
  </svg>
);

const BookIcon = () => (
  <svg className="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

const ClockIcon = () => (
  <svg className="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const SparkleIcon = () => (
  <svg className="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707-.707M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
  </svg>
);

const ShieldCheckIcon = () => (
  <svg className="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 11 2 2 4-4" />
  </svg>
);

const SearchIcon = () => (
  <svg className="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const CheckIcon = () => (
  <svg className="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const CloseIcon = () => (
  <svg className="icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg className="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const ChevronLeftIcon = () => (
  <svg className="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const KeyboardIcon = () => (
  <svg className="icon-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle" }}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />
  </svg>
);

export function SearchExperience({ apiBaseUrl, books, view = "search" }: SearchExperienceProps) {
  const [query, setQuery] = useState("سؤر الهرة");
  const [searchMode, setSearchMode] = useState<SearchMode>("all");
  const [selectedBooks, setSelectedBooks] = useState<number[]>([]);
  const [bookSearchQuery, setBookSearchQuery] = useState("");
  const filteredBooks = books.filter((book) =>
    book.title.toLowerCase().includes(bookSearchQuery.toLowerCase()) ||
    book.authors.some((auth) => auth.toLowerCase().includes(bookSearchQuery.toLowerCase()))
  );
  const [results, setResults] = useState<SearchResult[]>([]);
  const [resultCount, setResultCount] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [theme, setTheme] = useState<ThemeId>("parchment");
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const copy = uiCopy[locale];

  const [fontSize, setFontSize] = useState(19);
  const [fontFamily, setFontFamily] = useState<ReadingFontId>("amiri");
  const [activeCitationDropdown, setActiveCitationDropdown] = useState<number | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isFiltersVisible, setIsFiltersVisible] = useState(false);
  const [showSearchExamples, setShowSearchExamples] = useState(false);
  const [settingsAnchor, setSettingsAnchor] = useState<null | "header" | "footer">(null);
  const [openArabicKeyboard, setOpenArabicKeyboard] = useState<ArabicKeyboardTarget | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const bookSearchInputRef = useRef<HTMLInputElement>(null);

  const copyChicago = (result: SearchResult) => {
    const breadcrumb = result.breadcrumb.join(" / ") || copy.generalTopic;
    const formatted = copy.chicagoCitation(result.citation, breadcrumb, result.id);
    void navigator.clipboard.writeText(formatted);
    showToast(copy.copiedChicago);
    setActiveCitationDropdown(null);
  };

  const copyClassical = (result: SearchResult) => {
    const authors = formatAuthors(result.authors, copy.authorSeparator, copy.unknownAuthor);
    const publisherPart = result.publisher ? copy.publisherPart(result.publisher) : "";
    const volumePart = result.part_name ? copy.volumePartShort(result.part_name) : "";
    const pagePart = result.page_number ? copy.pagePartShort(result.page_number) : "";
    const formatted = copy.classicalCitation(result.book_title, authors, publisherPart, volumePart, pagePart);
    void navigator.clipboard.writeText(formatted);
    showToast(copy.copiedClassical);
    setActiveCitationDropdown(null);
  };

  const copyTahqiq = (result: SearchResult) => {
    const authors = formatAuthors(result.authors, copy.authorSeparator, copy.unknownAuthor);
    const publisherPart = result.publisher ? copy.publisherPartLong(result.publisher) : "";
    const yearPart = result.year ? copy.yearPart(result.year) : "";
    const volumePart = result.part_name ? copy.volumePartLong(result.part_name) : "";
    const pagePart = result.page_number ? copy.pagePartLong(result.page_number) : copy.pagePartUndefined();
    const formatted = copy.tahqiqCitation(result.book_title, authors, publisherPart, yearPart, volumePart, pagePart);
    void navigator.clipboard.writeText(formatted);
    showToast(copy.copiedTahqiq);
    setActiveCitationDropdown(null);
  };

  const copyFootnote = (result: SearchResult) => {
    const authors = formatAuthors(result.authors, copy.authorSeparator, copy.unknownAuthor);
    const publisherPart = result.publisher ? copy.footnotePublisherPart(result.publisher) : "";
    const volumePart = result.part_name ? copy.footnoteVolumePart(result.part_name) : "";
    const pagePart = result.page_number ? copy.footnotePagePart(result.page_number) : "";
    const formatted = copy.footnoteCitation(authors, result.book_title, publisherPart, volumePart, pagePart);
    void navigator.clipboard.writeText(formatted);
    showToast(copy.copiedFootnote);
    setActiveCitationDropdown(null);
  };

  const copyMarkdown = (result: SearchResult) => {
    const breadcrumb = result.breadcrumb.join(" / ") || copy.generalTopic;
    const formatted = copy.markdownCitation(result.text, result.citation, breadcrumb, result.id);
    void navigator.clipboard.writeText(formatted);
    showToast(copy.copiedMarkdown);
    setActiveCitationDropdown(null);
  };

  const copyPlain = (result: SearchResult) => {
    const formatted = copy.plainCitation(result.text, result.citation);
    void navigator.clipboard.writeText(formatted);
    showToast(copy.copiedPlain);
    setActiveCitationDropdown(null);
  };

  const renderResultPassage = (result: SearchResult, extraClass = "") => (
    <p
      className={`result-passage-text ${extraClass}`.trim()}
      dir="auto"
      dangerouslySetInnerHTML={{ __html: formatPassageHtml(result.text_highlighted || result.text) }}
    />
  );

  const renderSettingsPopover = () => (
    <div className="settings-popover">
      <div className="settings-section">
        <span className="settings-label">{copy.appearance}</span>
        <div className="settings-option-grid">
          {themes.map((t) => {
            const isSelected = theme === t.id;
            const labelText = t.label[locale];
            return (
              <button
                key={t.id}
                className={`settings-option ${isSelected ? "selected" : ""}`}
                onClick={() => changeTheme(t.id)}
                type="button"
              >
                <span className={`theme-swatch ${t.id}`} />
                <span>{labelText}</span>
                {isSelected && <CheckIcon />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="settings-section">
        <span className="settings-label">{copy.readingFontLabel}</span>
        <div className="settings-segmented">
          <button
            className={fontFamily === "amiri" ? "active" : ""}
            onClick={() => changeReadingFont("amiri")}
            type="button"
          >
            {copy.amiriFont}
          </button>
          <button
            className={fontFamily === "noto" ? "active" : ""}
            onClick={() => changeReadingFont("noto")}
            type="button"
          >
            {copy.naskhFont}
          </button>
        </div>
      </div>

      <div className="settings-section">
        <span className="settings-label">{copy.languageLabel}</span>
        <div className="settings-segmented">
          <button
            className={locale === "ar" ? "active" : ""}
            onClick={() => changeLocale("ar")}
            type="button"
          >
            {copy.arabic}
          </button>
          <button
            className={locale === "en" ? "active" : ""}
            onClick={() => changeLocale("en")}
            type="button"
          >
            {copy.english}
          </button>
        </div>
      </div>
    </div>
  );

  // Widgets state
  const [history, setHistory] = useState<string[]>([]);

  // Context Reader Modal State
  const [activeContextChunkId, setActiveContextChunkId] = useState<number | null>(null);
  const [contextResults, setContextResults] = useState<SearchResult[]>([]);
  const [isContextLoading, setIsContextLoading] = useState(false);

  // New scholarly search states
  const [hasSearched, setHasSearched] = useState(false);
  const preferFooterSettings = view === "search" && !hasSearched;
  const [activeBookId, setActiveBookId] = useState<number | null>(null);

  // Derived state: active book info
  const activeBook = books.find((b) => b.id === activeBookId);

  // Pagination & Grouping states
  const [visibleCount, setVisibleCount] = useState(8);
  const [groupByBook, setGroupByBook] = useState(false);
  const [matchReasonFilters, setMatchReasonFilters] = useState<MatchReasonType[]>([...MATCH_REASON_TYPES]);
  const [expandedBooks, setExpandedBooks] = useState<number[]>([]);

  const displayResults = useMemo(() => {
    if (matchReasonFilters.length === MATCH_REASON_TYPES.length) {
      return results;
    }
    return results.filter((result) =>
      matchReasonFilters.includes(resolveMatchReason(result, query).type),
    );
  }, [results, query, matchReasonFilters]);

  const toggleMatchReasonFilter = useCallback((type: MatchReasonType) => {
    setMatchReasonFilters((prev) => {
      if (prev.includes(type)) {
        const next = prev.filter((item) => item !== type);
        return next.length === 0 ? prev : next;
      }
      return [...prev, type];
    });
  }, []);

  const toggleBookExpand = (bookId: number) => {
    setExpandedBooks((prev) =>
      prev.includes(bookId) ? prev.filter((id) => id !== bookId) : [...prev, bookId]
    );
  };

  // Toast state
  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(message: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMessage(message);
    setToastVisible(true);
    toastTimer.current = setTimeout(() => {
      setToastVisible(false);
    }, 2500);
  }

  // URL parameters synchronization helper
  function updateUrlParams(newParams: { q?: string; mode?: string; theme?: string; locale?: Locale; bookIds?: number[] }) {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (newParams.q !== undefined) {
      if (newParams.q) url.searchParams.set("q", newParams.q);
      else url.searchParams.delete("q");
    }
    if (newParams.mode !== undefined) {
      url.searchParams.set("mode", newParams.mode);
    }
    if (newParams.theme !== undefined) {
      url.searchParams.set("theme", newParams.theme);
    }
    if (newParams.locale !== undefined) {
      url.searchParams.set("lang", newParams.locale);
    }
    if (newParams.bookIds !== undefined) {
      if (newParams.bookIds.length > 0) url.searchParams.set("books", newParams.bookIds.join(","));
      else url.searchParams.delete("books");
    }
    window.history.replaceState(null, "", url.pathname + url.search);
  }

  // Synchronize theme with HTML document element data attribute
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.title = uiCopy[locale].pageTitle;
  }, [locale]);

  useEffect(() => {
    setSettingsAnchor((current) => {
      if (preferFooterSettings && current === "header") return null;
      if (!preferFooterSettings && current === "footer") return null;
      return current;
    });
  }, [preferFooterSettings]);

  useEffect(() => {
    setStatus((prev) => translateStatusMessage(prev, copy, resultCount, hasSearched));
    setError((prev) => translateErrorMessage(prev, copy));
    setToastMessage((prev) => translateToastMessage(prev, copy));
  }, [locale, copy, resultCount, hasSearched]);

  // Theme changer
  function changeTheme(nextTheme: ThemeId) {
    setTheme(nextTheme);
    window.localStorage.setItem("fiqh-ai-theme", nextTheme);
    updateUrlParams({ theme: nextTheme });
  }

  function changeLocale(nextLocale: Locale) {
    setLocale(nextLocale);
    window.localStorage.setItem("fiqh-ai-locale", nextLocale);
    updateUrlParams({ locale: nextLocale });
  }

  function changeReadingFont(nextFont: ReadingFontId) {
    setFontFamily(nextFont);
    window.localStorage.setItem("fiqh-ai-reading-font", nextFont);
  }

  // Core Search Engine runner
  const runSearch = useCallback(async (nextQuery = query, nextMode = searchMode, nextBooks = selectedBooks) => {
    const trimmed = nextQuery.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setResultCount(0);
      setStatus(copy.shortQuery);
      return;
    }

    setHasSearched(true);
    setIsLoading(true);
    setError("");
    setStatus(copy.searchingIndex);

    // Sync state to URL params
    updateUrlParams({ q: trimmed, mode: nextMode, bookIds: nextBooks });

    // Update History widget
    setHistory((prev) => {
      const filtered = prev.filter((item) => item !== trimmed);
      const updated = [trimmed, ...filtered].slice(0, 8);
      setTimeout(() => {
        window.localStorage.setItem("fiqh-ai-history", JSON.stringify(updated));
      }, 0);
      return updated;
    });

    try {
      let url = `${apiBaseUrl}/search?q=${encodeURIComponent(trimmed)}&mode=${nextMode}&limit=20`;
      if (nextBooks.length > 0) {
        url += `&book_ids=${nextBooks.join(",")}`;
      }

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Search failed with ${response.status}`);
      }

      const payload = (await response.json()) as SearchResponse;
      setResults(payload.results);
      setResultCount(payload.count);
      setVisibleCount(8);
      setExpandedBooks([]);
      setStatus(
        payload.count > 0
          ? copy.foundResults(payload.count)
          : copy.notFound,
      );
    } catch {
      setResults([]);
      setResultCount(0);
      setError(copy.searchError);
      setStatus("");
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, query, searchMode, selectedBooks, copy]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runSearch();
  }

  function getKeyboardTargetState(target: ArabicKeyboardTarget) {
    if (target === "search") {
      return { value: query, setValue: setQuery, inputRef: searchInputRef };
    }
    return { value: bookSearchQuery, setValue: setBookSearchQuery, inputRef: bookSearchInputRef };
  }

  function insertArabicChar(char: string, target: ArabicKeyboardTarget) {
    const { value, setValue, inputRef } = getKeyboardTargetState(target);
    const input = inputRef.current;
    if (!input) {
      setValue((prev) => prev + char);
      return;
    }

    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? value.length;
    const next = value.slice(0, start) + char + value.slice(end);
    setValue(next);

    requestAnimationFrame(() => {
      const pos = start + char.length;
      input.focus();
      input.setSelectionRange(pos, pos);
    });
  }

  function handleArabicBackspace(target: ArabicKeyboardTarget) {
    const { value, setValue, inputRef } = getKeyboardTargetState(target);
    const input = inputRef.current;
    if (!input) {
      setValue((prev) => prev.slice(0, -1));
      return;
    }

    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? value.length;

    if (start !== end) {
      const next = value.slice(0, start) + value.slice(end);
      setValue(next);
      requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(start, start);
      });
      return;
    }

    if (start === 0) return;

    const next = value.slice(0, start - 1) + value.slice(start);
    setValue(next);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start - 1, start - 1);
    });
  }

  function toggleArabicKeyboard(target: ArabicKeyboardTarget) {
    setOpenArabicKeyboard((prev) => (prev === target ? null : target));
  }

  function renderArabicKeyboardPanel(target: ArabicKeyboardTarget) {
    return (
      <div className="arabic-keyboard-panel" dir="rtl" role="dialog" aria-label={copy.arabicKeyboard}>
        <div className="arabic-keyboard-rows">
          {arabicKeyboardRows.map((row) => (
            <div key={row.join("-")} className="arabic-keyboard-row">
              {row.map((key) => (
                <button
                  key={key}
                  className="arabic-keyboard-key"
                  type="button"
                  onClick={() => insertArabicChar(key, target)}
                >
                  {key}
                </button>
              ))}
            </div>
          ))}
          <div className="arabic-keyboard-row arabic-keyboard-numbers-row">
            {arabicKeyboardNumberRow.map((key) => (
              <button
                key={key}
                className="arabic-keyboard-key arabic-keyboard-number-key"
                type="button"
                onClick={() => insertArabicChar(key, target)}
              >
                {key}
              </button>
            ))}
          </div>
        </div>
        <div className="arabic-keyboard-actions">
          <button className="arabic-keyboard-key arabic-keyboard-space" type="button" onClick={() => insertArabicChar(" ", target)}>
            {copy.arabicKeyboardSpace}
          </button>
          <button className="arabic-keyboard-key arabic-keyboard-backspace" type="button" onClick={() => handleArabicBackspace(target)}>
            {copy.arabicKeyboardBackspace}
          </button>
          <button className="arabic-keyboard-key arabic-keyboard-close" type="button" onClick={() => setOpenArabicKeyboard(null)}>
            {copy.close}
          </button>
        </div>
      </div>
    );
  }

  function handleExample(nextQuery: string) {
    setQuery(nextQuery);
    void runSearch(nextQuery);
  }

  function handleHistoryClick(historyQuery: string) {
    setQuery(historyQuery);
    void runSearch(historyQuery);
  }

  function handleSearchModeChange(mode: SearchMode) {
    setSearchMode(mode);
    updateUrlParams({ mode });
    if (query.trim().length >= 2) {
      void runSearch(query, mode);
    }
  }

  // Toggle book filters
  function handleBookToggle(bookId: number) {
    const updated = selectedBooks.includes(bookId)
      ? selectedBooks.filter((id) => id !== bookId)
      : [...selectedBooks, bookId];

    setSelectedBooks(updated);
    updateUrlParams({ bookIds: updated });
    if (query.trim().length >= 2) {
      void runSearch(query, searchMode, updated);
    }
  }

  function clearBookFilters() {
    setSelectedBooks([]);
    updateUrlParams({ bookIds: [] });
    if (query.trim().length >= 2) {
      void runSearch(query, searchMode, []);
    }
  }

  function clearHistory() {
    setHistory([]);
    window.localStorage.removeItem("fiqh-ai-history");
    showToast(copy.historyCleared);
  }

  // Context loading helper
  async function openContextReader(chunkId: number) {
    setActiveContextChunkId(chunkId);
    setIsContextLoading(true);
    setContextResults([]);

    try {
      const response = await fetch(
        `${apiBaseUrl}/chunks/${chunkId}/context?window=2&q=${encodeURIComponent(query)}`
      );
      if (!response.ok) {
        throw new Error();
      }
      const data = await response.json() as { results: SearchResult[] };
      setContextResults(data.results);
    } catch {
      setError(copy.contextError);
    } finally {
      setIsContextLoading(false);
    }
  }



  // Initialize and Sync state on mount
  useEffect(() => {
    // 1. Theme loading
    const savedTheme = window.localStorage.getItem("fiqh-ai-theme");
    const nextTheme = normalizeThemeId(savedTheme);
    const savedLocale = window.localStorage.getItem("fiqh-ai-locale");
    const nextLocale: Locale = savedLocale === "en" ? "en" : DEFAULT_LOCALE;
    const nextReadingFont = normalizeReadingFontId(window.localStorage.getItem("fiqh-ai-reading-font"));

    // 2. History loading
    let initialHistory: string[] = [];
    try {
      const savedHistory = window.localStorage.getItem("fiqh-ai-history");
      if (savedHistory) {
        initialHistory = JSON.parse(savedHistory) as string[];
      }
    } catch {
      window.localStorage.removeItem("fiqh-ai-history");
    }

    // 4. URL parameters synchronization
    const params = new URLSearchParams(window.location.search);
    const qParam = params.get("q");
    const modeParam = params.get("mode") as SearchMode;
    const themeParam = params.get("theme") as ThemeId;
    const booksParam = params.get("books");
    const langParam = params.get("lang");

    const finalTheme = themeParam ? normalizeThemeId(themeParam) : nextTheme;
    const finalLocale: Locale =
      langParam === "en" || langParam === "ar" ? langParam : nextLocale;
    const finalMode = (modeParam && ["all", "any", "exact"].includes(modeParam)) ? modeParam : "all";
    const finalBooks = booksParam ? booksParam.split(",").map(Number).filter((id) => !isNaN(id)) : [];
    const finalQuery = qParam && qParam.trim().length >= 2 ? qParam : "";

    if (!savedLocale) {
      window.localStorage.setItem("fiqh-ai-locale", finalLocale);
    }
    if (!langParam) {
      updateUrlParams({ locale: finalLocale });
    }

    // Set states asynchronously
    setTimeout(() => {
      setTheme(finalTheme);
      setLocale(finalLocale);
      setFontFamily(nextReadingFont);
      setHistory(initialHistory);
      setSearchMode(finalMode);
      setSelectedBooks(finalBooks);

      if (finalQuery) {
        setQuery(finalQuery);
        setHasSearched(true);
        void runSearch(finalQuery, finalMode, finalBooks);
      } else {
        setStatus(uiCopy[finalLocale].emptyPrompt);
      }
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard Shortcuts handler
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Focus search input on "/" key
      if (event.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        event.preventDefault();
        const inputEl = document.getElementById("search-input") as HTMLInputElement | null;
        inputEl?.focus();
        inputEl?.select();
      }

      // Close modal on Escape
      if (event.key === "Escape") {
        setActiveContextChunkId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Scroll to top button visibility handler
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close citation dropdown on clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".citation-dropdown-wrapper")) {
        setActiveCitationDropdown(null);
      }
      if (!target.closest(".settings-menu-wrapper")) {
        setSettingsAnchor(null);
      }
      if (!target.closest(".search-examples-panel") && !target.closest(".search-input-wrapper")) {
        setShowSearchExamples(false);
      }
      if (!target.closest(".arabic-keyboard-wrapper")) {
        setOpenArabicKeyboard(null);
      }
    };
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, []);

  return (
    <div
      className="workspace-wrapper"
      dir={locale === "ar" ? "rtl" : "ltr"}
      data-theme={theme}
      data-reading-font={fontFamily}
    >
      {/* Top Navigation Header */}
      <header className="workbench-top-nav">
        <div className="nav-container">
          {view !== "search" && (
            <Link className="page-back-btn" href={buildLocaleHref("/", locale, theme)}>
              <ChevronLeftIcon />
              <span>{copy.backHome}</span>
            </Link>
          )}
          <Link className="top-nav-brand" href={buildLocaleHref("/", locale, theme)}>
            <DoodleLogoIcon />
            <span className="brand-text" dir="ltr">fiqh.ai</span>
          </Link>

          <div
            className={`settings-menu-wrapper header-settings${preferFooterSettings ? " header-settings-deferred" : ""}`}
          >
            <button
              className="header-icon-btn"
              onClick={() => setSettingsAnchor((prev) => (prev === "header" ? null : "header"))}
              type="button"
              aria-expanded={settingsAnchor === "header"}
              aria-label={copy.settings}
              title={copy.settings}
            >
              <DoodleSettingsIcon />
            </button>
            {settingsAnchor === "header" && renderSettingsPopover()}
          </div>
        </div>
      </header>

      {view === "search" && (
        <main className="search-main-content">
          {/* Large Center Logo (visible only on home/landing screen) */}
          {!hasSearched && (
            <div className="landing-hero">
              <h1 className="landing-logo-large">
                <span className="brand-text" dir="ltr">fiqh.ai</span>
              </h1>
              <p className="landing-tagline">{copy.landingTagline}</p>
            </div>
          )}

          {/* Centered Search Panel Container */}
          <div className={`search-panel-container ${hasSearched ? "has-results" : "landing"}`}>
            {/* Pill Search Input Bar */}
            <form className="search-form-pill" onSubmit={handleSubmit}>
              <div className={`search-input-wrapper arabic-keyboard-wrapper ${query ? "has-clear-btn" : ""}`}>
                <span className="search-icon-left"><SearchIcon /></span>
                <input
                  ref={searchInputRef}
                  className="search-input-field"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setShowSearchExamples(true)}
                  placeholder={copy.searchPlaceholder}
                  aria-label={copy.searchAria}
                  dir="auto"
                  id="search-input"
                />
                <span className="arabic-keyboard-tooltip-wrap">
                  <button
                    className={`arabic-keyboard-btn ${openArabicKeyboard === "search" ? "active" : ""}`}
                    type="button"
                    onClick={() => toggleArabicKeyboard("search")}
                    aria-expanded={openArabicKeyboard === "search"}
                    aria-label={copy.arabicKeyboard}
                    title={copy.arabicKeyboardHint}
                  >
                    <KeyboardIcon />
                  </button>
                  <span className="arabic-keyboard-hint" role="tooltip">
                    {copy.arabicKeyboardHint}
                  </span>
                </span>
                {query && (
                  <button className="clear-search-btn" type="button" onClick={() => setQuery("")} aria-label={copy.clear}>
                    <CloseIcon />
                  </button>
                )}

                {openArabicKeyboard === "search" && renderArabicKeyboardPanel("search")}
              </div>

              <div className="search-toolbar">
                <div className="search-toolbar-group">
                  <button 
                    className={`options-toggle-btn ${isFiltersVisible ? "active" : ""}`}
                    onClick={() => setIsFiltersVisible(!isFiltersVisible)}
                    type="button"
                    aria-expanded={isFiltersVisible}
                  >
                    <SearchIcon />
                    <span>{searchMode === "all" ? copy.allWords : searchMode === "any" ? copy.anyWord : copy.exactPhrase}</span>
                    <ChevronDownIcon />
                  </button>

                  <button 
                    className="sources-toggle-btn compact"
                    onClick={() => setIsMobileSidebarOpen(true)}
                    type="button"
                  >
                    <BookIcon />
                    <span>{copy.sources}</span>
                  </button>
                </div>

                <div className="search-toolbar-group">
                  <button className="search-submit-btn" type="submit" disabled={isLoading} aria-label={copy.search}>
                    {isLoading ? copy.searching : copy.search}
                  </button>
                </div>
              </div>
            </form>

            {showSearchExamples && (
              <div className="search-examples-panel" role="listbox" aria-label={copy.examplesLabel}>
                <span className="search-examples-label">{copy.examplesLabel}</span>
                <div className="search-examples-row">
                  {copy.exampleQueries.map((ex) => (
                    <button
                      key={ex}
                      className="search-example-pill"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        handleExample(ex);
                        setShowSearchExamples(false);
                      }}
                      type="button"
                    >
                      <SearchIcon />
                      <span>{ex}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isFiltersVisible && (
              <div className="collapsible-options-box">
                <div className="options-section">
                  <span className="options-label">{copy.matching}:</span>
                  <div className="segmented-control">
                    <button
                      className={`seg-btn ${searchMode === "all" ? "active" : ""}`}
                      onClick={() => handleSearchModeChange("all")}
                      type="button"
                    >
                      {copy.allWords}
                    </button>
                    <button
                      className={`seg-btn ${searchMode === "any" ? "active" : ""}`}
                      onClick={() => handleSearchModeChange("any")}
                      type="button"
                    >
                      {copy.anyWord}
                    </button>
                    <button
                      className={`seg-btn ${searchMode === "exact" ? "active" : ""}`}
                      onClick={() => handleSearchModeChange("exact")}
                      type="button"
                    >
                      {copy.exactPhrase}
                    </button>
                  </div>
                </div>

                <div className="options-section">
                  <span className="options-label">{copy.display}:</span>
                  <label className="toggle-switch-label">
                    <input
                      type="checkbox"
                      checked={groupByBook}
                      onChange={(e) => setGroupByBook(e.target.checked)}
                    />
                    <span className="slider-label">{copy.group}</span>
                  </label>
                </div>

                <div className="options-section reason-filter-section">
                  <span className="options-label">{copy.matchReasonFilterLabel}:</span>
                  <div className="reason-filter-row">
                    {MATCH_REASON_TYPES.map((type) => (
                      <button
                        key={type}
                        className={`reason-filter-chip ${matchReasonFilters.includes(type) ? "active" : ""}`}
                        onClick={() => toggleMatchReasonFilter(type)}
                        type="button"
                      >
                        {matchReasonFilterLabel(type, copy)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="options-section">
                  <span className="options-label">{copy.display}:</span>
                  <button 
                    className="sources-toggle-btn"
                    onClick={() => setIsMobileSidebarOpen(true)}
                    type="button"
                  >
                    <BookIcon />
                    <span>{copy.sources}</span>
                  </button>
                </div>

              </div>
            )}
          </div>

          {/* Results Container card */}
          {hasSearched && (
            <div className="search-results-container">
              {/* Skeletons loader */}
              {isLoading && (
                <div className="skeletons-wrapper">
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                </div>
              )}

              {/* Error display */}
              {error && !isLoading && (
                <div className="error-message-card">
                  {error}
                </div>
              )}

              {/* Empty state view */}
              {!isLoading && results.length === 0 && status && !error && (
                <div className="empty-results-card">
                  {status}
                </div>
              )}

              {/* Flat result list cards */}
              {!isLoading && !groupByBook && displayResults.slice(0, visibleCount).map((result, idx) => {
                return (
                  <article key={result.id} className="result-passage-card">
                    <div className="result-card-header" dir={contentDir(result.citation)}>
                      <div className="book-title-meta">
                        <span className="card-number-index">{idx + 1}</span>
                        <span 
                          className="book-title-link"
                          dir={contentDir(result.citation)}
                          onClick={() => setActiveBookId(result.book_id)}
                          title={copy.showBookDetails}
                        >
                          {result.citation}
                        </span>
                      </div>
                      <div className="part-page-badge" dir="auto">
                        {result.part_name ? `${copy.partAbbrev} ${result.part_name}` : ""} {result.page_number ? ` / ${copy.pageAbbrev} ${result.page_number}` : ""}
                      </div>
                    </div>

                    {result.breadcrumb.length > 0 && (
                      <div className="result-breadcrumbs" dir={contentDir(result.breadcrumb.join(" / "))}>
                        {result.breadcrumb.join(" / ")}
                      </div>
                    )}

                    {renderResultPassage(result)}

                    <div className="match-reason-bar">
                      <span className="match-reason-tag">
                        <span className="match-reason-label">{copy.matchReasonLabel}:</span> {formatMatchReason(resolveMatchReason(result, query), copy)}
                      </span>
                    </div>

                    <div className="result-card-actions">
                      <button 
                        className={`action-btn context-btn ${activeContextChunkId === result.id ? "active" : ""}`}
                        onClick={() => void openContextReader(result.id)}
                        type="button"
                        title={copy.readContext}
                      >
                        <BookIcon />
                        <span>{copy.readContextAction}</span>
                      </button>

                      <div className="citation-dropdown-wrapper">
                        <button 
                          className="action-btn copy-btn"
                          onClick={() => setActiveCitationDropdown(activeCitationDropdown === result.id ? null : result.id)}
                          type="button"
                          title={copy.copyCitation}
                        >
                          <BookIcon />
                          <span>{copy.copy}</span>
                          <ChevronDownIcon />
                        </button>
                        {activeCitationDropdown === result.id && (
                          <div className="citation-dropdown-content">
                            <button onClick={() => copyChicago(result)} type="button">{copy.chicago}</button>
                            <button onClick={() => copyClassical(result)} type="button">{copy.classical}</button>
                            <button onClick={() => copyTahqiq(result)} type="button">{copy.tahqiq}</button>
                            <button onClick={() => copyFootnote(result)} type="button">{copy.footnote}</button>
                            <button onClick={() => copyMarkdown(result)} type="button">{copy.markdown}</button>
                            <button onClick={() => copyPlain(result)} type="button">{copy.plain}</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}

              {/* Grouped results view */}
              {!isLoading && groupByBook && (() => {
                const groups: Record<string, { bookId: number; items: SearchResult[] }> = {};
                displayResults.slice(0, visibleCount).forEach((res) => {
                  if (!groups[res.book_title]) {
                    groups[res.book_title] = { bookId: res.book_id, items: [] };
                  }
                  groups[res.book_title].items.push(res);
                });

                return Object.entries(groups).map(([bookTitle, group]) => {
                  const isExpanded = expandedBooks.includes(group.bookId);
                  const items = group.items;
                  return (
                    <div key={group.bookId} className="result-passage-card grouped-result-card">
                      <div className="result-card-header grouped-result-header" dir={contentDir(bookTitle)}>
                        <div className="book-title-meta">
                          <span 
                            className="book-title-link grouped-book-title"
                            dir={contentDir(bookTitle)}
                            onClick={() => setActiveBookId(group.bookId)}
                            title={copy.showBookDetails}
                          >
                            {bookTitle}
                          </span>
                        </div>
                        <span className="part-page-badge match-count-badge" dir="auto">
                          {copy.matches(items.length)}
                        </span>
                      </div>

                      <div className="grouped-passages-list">
                        {/* Main Passage */}
                        <div className={`main-passage-grouped ${isExpanded ? "expanded" : ""}`}>
                          <div className="result-card-header compact-result-header" dir={contentDir(items[0].citation)}>
                            <span className="book-title-link citation-title" dir={contentDir(items[0].citation)}>{items[0].citation}</span>
                            <div className="part-page-badge" dir="auto">
                              {items[0].part_name ? `${copy.partAbbrev} ${items[0].part_name}` : ""} {items[0].page_number ? ` / ${copy.pageAbbrev} ${items[0].page_number}` : ""}
                            </div>
                          </div>

                          {items[0].breadcrumb.length > 0 && (
                            <div className="result-breadcrumbs" dir={contentDir(items[0].breadcrumb.join(" / "))}>
                              {items[0].breadcrumb.join(" / ")}
                            </div>
                          )}

                          {renderResultPassage(items[0])}

                          <div className="match-reason-bar">
                            <span className="match-reason-tag">
                              <span className="match-reason-label">{copy.matchReasonLabel}:</span> {formatMatchReason(resolveMatchReason(items[0], query), copy)}
                            </span>
                          </div>

                          <div className="result-card-actions">
                            <button 
                              className={`action-btn context-btn ${activeContextChunkId === items[0].id ? "active" : ""}`}
                              onClick={() => void openContextReader(items[0].id)}
                              type="button"
                            >
                              <BookIcon />
                              <span>{copy.readContextAction}</span>
                            </button>

                            <div className="citation-dropdown-wrapper">
                              <button 
                                className="action-btn copy-btn"
                                onClick={() => setActiveCitationDropdown(activeCitationDropdown === items[0].id ? null : items[0].id)}
                                type="button"
                              >
                                <BookIcon />
                                <span>{copy.copy}</span>
                                <ChevronDownIcon />
                              </button>
                              {activeCitationDropdown === items[0].id && (
                                <div className="citation-dropdown-content">
                                  <button onClick={() => copyChicago(items[0])} type="button">{copy.chicago}</button>
                                  <button onClick={() => copyClassical(items[0])} type="button">{copy.classical}</button>
                                  <button onClick={() => copyTahqiq(items[0])} type="button">{copy.tahqiq}</button>
                                  <button onClick={() => copyFootnote(items[0])} type="button">{copy.footnote}</button>
                                  <button onClick={() => copyMarkdown(items[0])} type="button">{copy.markdown}</button>
                                  <button onClick={() => copyPlain(items[0])} type="button">{copy.plain}</button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Collapsed/Expanded Extra passages */}
                        {items.length > 1 && (
                          <div className="extra-passages-grouped">
                            {isExpanded ? (
                              <div className="expanded-list">
                                {items.slice(1).map((subItem) => {
                                  return (
                                    <div key={subItem.id} className="sub-passage-entry">
                                      <div className="result-card-header compact-result-header" dir={contentDir(subItem.citation)}>
                                        <span className="book-title-link citation-title" dir={contentDir(subItem.citation)}>{subItem.citation}</span>
                                        <div className="part-page-badge" dir="auto">
                                          {subItem.part_name ? `${copy.partAbbrev} ${subItem.part_name}` : ""} {subItem.page_number ? ` / ${copy.pageAbbrev} ${subItem.page_number}` : ""}
                                        </div>
                                      </div>

                                      {subItem.breadcrumb.length > 0 && (
                                        <div className="result-breadcrumbs" dir={contentDir(subItem.breadcrumb.join(" / "))}>
                                          {subItem.breadcrumb.join(" / ")}
                                        </div>
                                      )}

                                      {renderResultPassage(subItem, "sub-passage-text")}

                                      <div className="match-reason-bar match-reason-bar-compact">
                                        <span className="match-reason-tag">
                                          <span className="match-reason-label">{copy.matchReasonLabel}:</span> {formatMatchReason(resolveMatchReason(subItem, query), copy)}
                                        </span>
                                      </div>

                                      <div className="result-card-actions">
                                        <button 
                                          className={`action-btn context-btn ${activeContextChunkId === subItem.id ? "active" : ""}`}
                                          onClick={() => void openContextReader(subItem.id)}
                                          type="button"
                                        >
                                          <BookIcon />
                                          <span>{copy.readContextAction}</span>
                                        </button>

                                        <div className="citation-dropdown-wrapper">
                                          <button 
                                            className="action-btn copy-btn"
                                            onClick={() => setActiveCitationDropdown(activeCitationDropdown === subItem.id ? null : subItem.id)}
                                            type="button"
                                          >
                                            <BookIcon />
                                            <span>{copy.copy}</span>
                                            <ChevronDownIcon />
                                          </button>
                                          {activeCitationDropdown === subItem.id && (
                                            <div className="citation-dropdown-content">
                                              <button onClick={() => copyChicago(subItem)} type="button">{copy.chicago}</button>
                                              <button onClick={() => copyClassical(subItem)} type="button">{copy.classical}</button>
                                              <button onClick={() => copyTahqiq(subItem)} type="button">{copy.tahqiq}</button>
                                              <button onClick={() => copyFootnote(subItem)} type="button">{copy.footnote}</button>
                                              <button onClick={() => copyMarkdown(subItem)} type="button">{copy.markdown}</button>
                                              <button onClick={() => copyPlain(subItem)} type="button">{copy.plain}</button>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}

                                <button
                                  className="action-btn grouped-toggle-btn"
                                  onClick={() => toggleBookExpand(group.bookId)}
                                  type="button"
                                >
                                  <ChevronDownIcon />
                                  <span>{copy.collapseMore}</span>
                                </button>
                              </div>
                            ) : (
                              <button
                                className="action-btn grouped-show-more-btn"
                                onClick={() => toggleBookExpand(group.bookId)}
                                type="button"
                              >
                                <ChevronDownIcon />
                                <span>{copy.showMore(items.length - 1)}</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}

              {/* Load more button */}
              {displayResults.length > visibleCount && (
                <div className="load-more-row">
                  <button
                    className="load-more-btn"
                    onClick={() => setVisibleCount((prev) => prev + 8)}
                    type="button"
                  >
                    {copy.loadMore(displayResults.length - visibleCount)}
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      )}

      {view === "method" && (
        <div className="static-page-container">
          <header className="static-page-hero">
            <span className="section-number">{copy.navAbout}</span>
            <h1 className="static-page-title">{copy.aboutTitle}</h1>
            <p className="static-page-lead">{copy.aboutLead}</p>
          </header>

          <article className="static-info-card method-callout-card">
            <div className="static-card-icon"><ShieldCheckIcon /></div>
            <h2 className="static-card-title">{copy.sourceVerificationTitle}</h2>
            <p className="static-card-copy">{copy.sourceVerificationCopy}</p>
          </article>

          <div className="static-card-grid method-feature-grid">
            <article className="static-info-card">
              <div className="static-card-icon"><SparkleIcon /></div>
              <span className="static-card-meta">{copy.sectionHeading("02", copy.sectionSemantic)}</span>
              <h2 className="static-card-title">{copy.semanticTitle}</h2>
              <p className="static-card-copy">{copy.semanticCopy}</p>
            </article>
            <article className="static-info-card">
              <div className="static-card-icon"><SearchIcon /></div>
              <span className="static-card-meta">{copy.sectionHeading("03", copy.sectionLexical)}</span>
              <h2 className="static-card-title">{copy.lexicalTitle}</h2>
              <p className="static-card-copy">{copy.lexicalCopy}</p>
            </article>
            <article className="static-info-card">
              <div className="static-card-icon"><ShieldCheckIcon /></div>
              <span className="static-card-meta">{copy.sectionHeading("04", copy.sectionSafety)}</span>
              <h2 className="static-card-title">{copy.safetyTitle}</h2>
              <p className="static-card-copy">{copy.safetyCopy}</p>
            </article>
            <article className="static-info-card">
              <div className="static-card-icon"><BookIcon /></div>
              <span className="static-card-meta">{copy.sectionHeading("05", copy.sectionReader)}</span>
              <h2 className="static-card-title">{copy.readerTitle}</h2>
              <p className="static-card-copy">{copy.readerCopy}</p>
            </article>
          </div>

          <section className="method-library-section">
            <h2 className="method-section-title">
              <span className="static-card-icon"><BookIcon /></span>
              <span>{copy.libraryTitle(books.length)}</span>
            </h2>
            <div className="library-table-container">
              <table className="library-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{copy.tableBook}</th>
                    <th>{copy.tableAuthor}</th>
                    <th>{copy.tableChunks}</th>
                    <th>{copy.tableDeathYear}</th>
                  </tr>
                </thead>
                <tbody>
                  {books.map((book, idx) => (
                    <tr key={book.id} onClick={() => setActiveBookId(book.id)}>
                      <td>{idx + 1}</td>
                      <td>{book.title}</td>
                      <td>{formatAuthors(book.authors, copy.authorSeparator, copy.unknownAuthor)}</td>
                      <td>{book.chunk_count.toLocaleString(locale === "ar" ? "ar-EG" : "en-US")}</td>
                      <td>{book.year || copy.oldEdition}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {view === "developers" && (
        <div className="static-page-container">
          <header className="static-page-hero">
            <span className="section-number">{copy.navDevelopers}</span>
            <h1 className="static-page-title">{copy.developersTitle}</h1>
            <p className="static-page-lead">{copy.developersLead}</p>
          </header>

          <div className="static-card-grid developer-card-grid">
            {developers.map((developer) => (
              <article key={developer.name} className="static-info-card developer-card">
                <div className="developer-card-header">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={developer.name}
                    className="developer-avatar"
                    height={72}
                    src={developer.imageUrl}
                    width={72}
                  />
                  <div className="developer-card-copy">
                    <h2 className="static-card-title">
                      {developer.portfolioUrl ? (
                        <a
                          className="footer-credit-link"
                          href={developer.portfolioUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {developer.name}
                        </a>
                      ) : (
                        developer.name
                      )}
                    </h2>
                    <p className="static-card-meta">{developer.role[locale]}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {view === "policies" && (
        <div className="static-page-container">
          <header className="static-page-hero">
            <span className="section-number">{copy.navPolicies}</span>
            <h1 className="static-page-title">{copy.policiesTitle}</h1>
            <p className="static-page-lead">{copy.policiesLead}</p>
          </header>

          <div className="static-card-grid policies-grid">
            <article className="static-info-card">
              <div className="static-card-icon"><ShieldCheckIcon /></div>
              <h2 className="static-card-title">{copy.policyUsageTitle}</h2>
              <p className="static-card-copy">{copy.policyUsageCopy}</p>
            </article>
            <article className="static-info-card">
              <div className="static-card-icon"><BookIcon /></div>
              <h2 className="static-card-title">{copy.policySourceTitle}</h2>
              <p className="static-card-copy">{copy.policySourceCopy}</p>
            </article>
            <article className="static-info-card">
              <div className="static-card-icon"><SparkleIcon /></div>
              <h2 className="static-card-title">{copy.policyPrivacyTitle}</h2>
              <p className="static-card-copy">{copy.policyPrivacyCopy}</p>
            </article>
          </div>
        </div>
      )}

      {/* Sources Sidebar Drawer (Note, filtration checklist, search history) */}
      {isMobileSidebarOpen && <div className="drawer-overlay" onClick={() => setIsMobileSidebarOpen(false)} />}
      <aside className={`sources-sidebar-drawer ${isMobileSidebarOpen ? "open" : ""}`}>
        <div className="drawer-header">
          <span className="drawer-title">{copy.sources}</span>
          <button className="drawer-close-btn" onClick={() => setIsMobileSidebarOpen(false)} type="button" aria-label={copy.close}>
            <CloseIcon />
          </button>
        </div>

        <div className="drawer-body">
          {/* Card 1: Note card warning */}
          <div className="drawer-card">
            <span className="card-title">{copy.noticeIcon}: {copy.notice}</span>
            <p className="card-desc">{copy.noticeCopy}</p>
          </div>

          {/* Card 2: Book filtration checklist */}
          <div className="drawer-card">
            <div className="card-title">
              <span>{copy.bookFiltersIcon}: {copy.bookFilters}</span>
              {selectedBooks.length > 0 && (
                <button className="history-clear-btn" onClick={clearBookFilters} type="button">
                  {copy.cancelSelected(selectedBooks.length)}
                </button>
              )}
            </div>
            <div className="book-search-keyboard-wrapper arabic-keyboard-wrapper">
              <input
                ref={bookSearchInputRef}
                className="book-search-input-sub"
                placeholder={copy.bookSearchPlaceholder}
                value={bookSearchQuery}
                onChange={(e) => setBookSearchQuery(e.target.value)}
                dir={locale === "ar" ? "rtl" : "ltr"}
              />
              <span className="arabic-keyboard-tooltip-wrap">
                <button
                  className={`arabic-keyboard-btn ${openArabicKeyboard === "book" ? "active" : ""}`}
                  type="button"
                  onClick={() => toggleArabicKeyboard("book")}
                  aria-expanded={openArabicKeyboard === "book"}
                  aria-label={copy.arabicKeyboard}
                  title={copy.arabicKeyboardHint}
                >
                  <KeyboardIcon />
                </button>
                <span className="arabic-keyboard-hint" role="tooltip">
                  {copy.arabicKeyboardHint}
                </span>
              </span>
              {openArabicKeyboard === "book" && renderArabicKeyboardPanel("book")}
            </div>
            <ul className="books-filter-list side-list-scrollbar">
              {filteredBooks.map((book) => (
                <li key={book.id}>
                  <label className="book-filter-item">
                    <input
                      type="checkbox"
                      className="book-filter-checkbox"
                      checked={selectedBooks.includes(book.id)}
                      onChange={() => handleBookToggle(book.id)}
                    />
                    <div className="book-filter-label" style={{ overflow: "hidden", textOverflow: "ellipsis", width: "100%" }}>
                      <span 
                        className="book-title-link-sub"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setActiveBookId(book.id);
                        }}
                      >
                        {book.title}
                      </span>
                      <div className="book-author-sub">{formatAuthors(book.authors, copy.authorSeparator, copy.unknownAuthor)}</div>
                    </div>
                  </label>
                </li>
              ))}
              {filteredBooks.length === 0 && (
                <div className="book-author-sub text-center" style={{ padding: "8px 0" }}>{copy.noMatchingBook}</div>
              )}
            </ul>
          </div>

          {/* Card 3: Search history */}
          <div className="drawer-card">
            <div className="card-title">
              <span>{copy.historyIcon}: {copy.history}</span>
              {history.length > 0 && (
                <button className="history-clear-btn" onClick={clearHistory} type="button">
                  {copy.clear}
                </button>
              )}
            </div>
            {history.length > 0 ? (
              <ul className="history-list">
                {history.map((histQuery) => (
                  <li key={histQuery}>
                    <button className="history-item-btn" onClick={() => {
                      handleHistoryClick(histQuery);
                      setIsMobileSidebarOpen(false);
                    }} type="button">
                      <span className="history-item-text">{copy.searchHistoryIcon}: {histQuery}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="card-desc text-center" style={{ padding: "12px 0", opacity: 0.6 }}>{copy.noHistory}</p>
            )}
          </div>
        </div>
      </aside>

      {/* Book details card popup modal */}
      {activeBookId !== null && activeBook && (
        <div className="modal-overlay" onClick={() => setActiveBookId(null)}>
          <div className="book-details-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <span className="modal-title">{copy.bookCardTitle}</span>
                <span className="modal-subtitle">{copy.bookCardSubtitle}</span>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setActiveBookId(null)}
                type="button"
                aria-label={copy.closeBookCard}
              >
                <CloseIcon />
              </button>
            </div>

            <div className="book-details-body" dir={locale === "ar" ? "rtl" : "ltr"}>
              <div className="book-details-top">
                <div className="book-cover-mockup">
                  <div className="book-cover-frame">
                    <span className="cover-decor-diamond">✦ ✦ ✦</span>
                    <h4 className="book-cover-title">{activeBook.title}</h4>
                    <span className="cover-decor-diamond">✦ ✦ ✦</span>
                  </div>
                </div>

                <div className="book-details-grid">
                  <div className="detail-item">
                    <span className="detail-label">{copy.author}</span>
                    <span className="detail-value">{formatAuthors(activeBook.authors, copy.authorSeparator, copy.unknownAuthor)}</span>
                  </div>

                  <div className="detail-item">
                    <span className="detail-label">{copy.year}</span>
                    <span className="detail-value">{activeBook.year || copy.undated}</span>
                  </div>

                  <div className="detail-item detail-item-wide">
                    <span className="detail-label">{copy.indexedChunksLabel}</span>
                    <span className="detail-value">{copy.chunkCount(activeBook.chunk_count)}</span>
                  </div>
                </div>
              </div>

              <div className="citation-preview-box">
                <span className="detail-label">{copy.citationTemplate}</span>
                <div className="citation-preview-text">
                  {copy.citationSample(
                    activeBook.title,
                    formatAuthors(activeBook.authors, copy.authorSeparator, copy.unknownAuthor),
                    activeBook.publisher || copy.unknownPublisher,
                    activeBook.year || copy.undated,
                  )}
                </div>
                <div className="modal-actions-row">
                  <button
                    className="action-btn"
                    onClick={() => {
                      const sample = copy.citationSample(
                        activeBook.title,
                        formatAuthors(activeBook.authors, copy.authorSeparator, copy.unknownAuthor),
                        activeBook.publisher || copy.unknownPublisher,
                        activeBook.year || copy.undated,
                      );
                      void navigator.clipboard.writeText(sample);
                      showToast(copy.templateCopied);
                    }}
                    type="button"
                  >
                    <BookIcon />
                    <span>{copy.copyTemplate}</span>
                  </button>
                  <button
                    className="action-btn primary-action"
                    onClick={() => setActiveBookId(null)}
                    type="button"
                  >
                    <span>{copy.close}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}






      {/* Floating Context reader bottom drawer for mobile views */}
      <div className={`context-drawer-pane ${activeContextChunkId !== null ? "open" : ""}`}>
        <div className="drawer-backdrop" onClick={() => setActiveContextChunkId(null)} />
        <div className="context-drawer-content">
          <div className="drawer-header" dir={locale === "ar" ? "rtl" : "ltr"}>
            <button className="drawer-close-btn" onClick={() => setActiveContextChunkId(null)} type="button" aria-label={copy.closeReader}>
              <CloseIcon />
            </button>
            <h3 className="drawer-title">{copy.contextReaderTitle}</h3>
          </div>

          <div className="reader-controls-bar" dir={locale === "ar" ? "rtl" : "ltr"}>
            <div className="font-size-controls">
              <button className="control-btn" onClick={() => setFontSize(prev => Math.max(14, prev - 1))} type="button" aria-label={copy.decreaseFont}>A-</button>
              <span className="reader-size-value">{fontSize} {copy.fontSizeUnit}</span>
              <button className="control-btn" onClick={() => setFontSize(prev => Math.min(28, prev + 1))} type="button" aria-label={copy.increaseFont}>A+</button>
            </div>
          </div>

          <div className="context-drawer-body">
            {isContextLoading ? (
              <div className="context-loading-state">
                <div className="loading-spinner" />
                <div>{copy.loadingContext}</div>
              </div>
            ) : (
              contextResults.map((chunk) => {
                const citationLabel = `${chunk.citation}${chunk.page_number ? ` (${copy.pageAbbrev} ${chunk.page_number})` : ""}`;
                const passageText = stripHtml(chunk.text_highlighted || chunk.text);
                return (
                  <div key={chunk.id} className={`context-page-card ${chunk.id === activeContextChunkId ? "highlighted-chunk" : ""}`}>
                    <div className="context-page-header" dir={contentDir(citationLabel)}>
                      <span className="context-page-num" dir={contentDir(citationLabel)}>
                        {citationLabel}
                      </span>
                    </div>
                    <p
                      className="passage"
                      dir={contentDir(passageText)}
                      style={{ fontSize: `${fontSize}px` }}
                      dangerouslySetInnerHTML={{ __html: formatPassageHtml(chunk.text_highlighted || chunk.text) }}
                    />
                  </div>
                );
              })
            )}
          </div>

          <div className="drawer-footer" dir={locale === "ar" ? "rtl" : "ltr"}>
            <button className="action-btn primary-action" onClick={() => setActiveContextChunkId(null)} type="button">{copy.closeReader}</button>
          </div>
        </div>
      </div>

      {/* Goto Top Arrow Button */}
      {showScrollTop && (
        <button
          className="goto-top-btn"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          type="button"
          aria-label={copy.top}
          title={copy.top}
        >
          ▲
        </button>
      )}

      {/* Toast Notification Redesigned Banner overlay (Image 1) */}
      <div className={`toast-redesigned ${toastVisible ? "visible" : ""}`} dir={locale === "ar" ? "rtl" : "ltr"}>
        <div className="toast-success-icon-wrapper">
          <CheckIcon />
        </div>
        <div className="toast-copy">
          <span className="toast-title">{copy.toastCopiedTitle}</span>
          <span className="toast-desc">{toastMessage || copy.toastCopiedDefault}</span>
        </div>
        <button className="toast-close-btn" onClick={() => setToastVisible(false)} type="button" aria-label={copy.close}>
          <CloseIcon />
        </button>
      </div>

      {/* Bottom Navigation Bar for Mobile views */}
      <nav className="mobile-bottom-navbar">
        <Link
          className={`nav-item ${view === "search" && !isMobileSidebarOpen ? "active" : ""}`}
          href={buildLocaleHref("/", locale, theme)}
          onClick={() => setIsMobileSidebarOpen(false)}
        >
          <SearchIcon />
          <span>{copy.search}</span>
        </Link>
        <button 
          className={`nav-item ${view === "search" && isMobileSidebarOpen ? "active" : ""}`}
          onClick={() => {
            setIsMobileSidebarOpen(true);
          }}
          type="button"
        >
          <ClockIcon />
          <span>{copy.sources}</span>
        </button>
        <Link
          className={`nav-item footer-method-mobile ${view === "method" ? "active" : ""}`}
          href={buildLocaleHref("/method", locale, theme)}
          onClick={() => setIsMobileSidebarOpen(false)}
        >
          <BookIcon />
          <span>{copy.mobileMethodology}</span>
        </Link>
      </nav>

      <footer className="app-footer">
        <div className="footer-bar">
          <Link className="footer-brand" href={buildLocaleHref("/", locale, theme)}>
            <DoodleLogoIcon />
            <span className="brand-text" dir="ltr">fiqh.ai</span>
          </Link>

          <nav className="footer-inline" aria-label={copy.footerNavigation}>
            <Link
              className={`footer-link footer-method-desktop ${view === "method" ? "active" : ""}`}
              href={buildLocaleHref("/method", locale, theme)}
            >
              {copy.navAbout}
            </Link>
            <span className="footer-sep" aria-hidden="true">·</span>
            <Link
              className={`footer-link ${view === "developers" ? "active" : ""}`}
              href={buildLocaleHref("/developers", locale, theme)}
            >
              {copy.navDevelopers}
            </Link>
            <span className="footer-sep" aria-hidden="true">·</span>
            <Link
              className={`footer-link ${view === "policies" ? "active" : ""}`}
              href={buildLocaleHref("/policies", locale, theme)}
            >
              {copy.navPolicies}
            </Link>
          </nav>

          {preferFooterSettings && (
            <div className="settings-menu-wrapper footer-settings">
              <button
                className="footer-icon-btn"
                onClick={() => setSettingsAnchor((prev) => (prev === "footer" ? null : "footer"))}
                type="button"
                aria-expanded={settingsAnchor === "footer"}
                aria-label={copy.settings}
                title={copy.settings}
              >
                <DoodleSettingsIcon />
              </button>

              {settingsAnchor === "footer" && renderSettingsPopover()}
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
