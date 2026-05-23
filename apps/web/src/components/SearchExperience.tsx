"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

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

type SearchExperienceProps = {
  apiBaseUrl: string;
  books: Book[];
};

const exampleQueries = ["سؤر الهرة", "الماء المستعمل", "تطهير الآبار", "صلاة المسافر", "زكاة الفطر"];
const themes = [
  { id: "parchment", label: "رق (تراثي)", icon: "📜" },
  { id: "night", label: "ليلي", icon: "🌙" },
  { id: "emerald", label: "زمردي", icon: "💎" },
] as const;

type ThemeId = (typeof themes)[number]["id"];
type SearchMode = "all" | "any" | "exact";

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

export function SearchExperience({ apiBaseUrl, books }: SearchExperienceProps) {
  const [query, setQuery] = useState("سؤر الهرة");
  const [searchMode, setSearchMode] = useState<SearchMode>("all");
  const [selectedBooks, setSelectedBooks] = useState<number[]>([]);
  const [bookSearchQuery, setBookSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState("أدخل عبارة للبحث في النصوص المفهرسة.");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [theme, setTheme] = useState<ThemeId>("parchment");
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Widgets state
  const [bookmarks, setBookmarks] = useState<SearchResult[]>([]);
  const [history, setHistory] = useState<string[]>([]);

  // Context Reader Modal State
  const [activeContextChunkId, setActiveContextChunkId] = useState<number | null>(null);
  const [contextResults, setContextResults] = useState<SearchResult[]>([]);
  const [isContextLoading, setIsContextLoading] = useState(false);

  // New scholarly search states
  const [hasSearched, setHasSearched] = useState(false);
  const [activeBookId, setActiveBookId] = useState<number | null>(null);

  // Derived state: active book info
  const activeBook = books.find((b) => b.id === activeBookId);

  // Pagination & Grouping states
  const [visibleCount, setVisibleCount] = useState(8);
  const [groupByBook, setGroupByBook] = useState(false);
  const [expandedBooks, setExpandedBooks] = useState<number[]>([]);

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
  function updateUrlParams(newParams: { q?: string; mode?: string; theme?: string; bookIds?: number[] }) {
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

  // Theme changer
  function changeTheme(nextTheme: ThemeId) {
    setTheme(nextTheme);
    window.localStorage.setItem("fiqh-ai-theme", nextTheme);
    updateUrlParams({ theme: nextTheme });
  }

  // Core Search Engine runner
  const runSearch = useCallback(async (nextQuery = query, nextMode = searchMode, nextBooks = selectedBooks) => {
    const trimmed = nextQuery.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setStatus("اكتب كلمتين أو أكثر للبحث.");
      return;
    }

    setHasSearched(true);
    setIsLoading(true);
    setError("");
    setStatus("جاري البحث في الفهرس الموحد للكتب...");

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
      setVisibleCount(8);
      setExpandedBooks([]);
      setStatus(
        payload.count > 0
          ? `تم العثور على ${payload.count} نتيجة.`
          : "لم يتم العثور على مرجع موثوق في الكتب المفهرسة. جرب تغيير عبارة البحث.",
      );
    } catch {
      setResults([]);
      setError("تعذر الاتصال بواجهة البحث. تأكد أن الخادم يعمل على المنفذ 8000.");
      setStatus("");
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, query, searchMode, selectedBooks]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runSearch();
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

  // Bookmarking toggles
  function toggleBookmark(result: SearchResult) {
    const isBookmarked = bookmarks.some((b) => b.id === result.id);
    const updated = isBookmarked
      ? bookmarks.filter((b) => b.id !== result.id)
      : [result, ...bookmarks];
    
    setBookmarks(updated);
    if (isBookmarked) {
      showToast("تم إزالة الإشارة المرجعية");
    } else {
      showToast("تم حفظ الإشارة المرجعية ✓");
    }
    window.localStorage.setItem("fiqh-ai-bookmarks", JSON.stringify(updated));
  }

  function clearHistory() {
    setHistory([]);
    window.localStorage.removeItem("fiqh-ai-history");
    showToast("تم مسح سجل البحث");
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
      setError("تعذر تحميل الصفحات المحيطة.");
    } finally {
      setIsContextLoading(false);
    }
  }

  // Reference copy utility
  function copyCitation(result: SearchResult) {
    const formatted = `${result.citation}، باب/موضوع: ${result.breadcrumb.join(" / ") || "عام"} (مقطع #${result.id})`;
    void navigator.clipboard.writeText(formatted);
    showToast("تم نسخ الاقتباس المرجعي ✓");
  }

  // Initialize and Sync state on mount
  useEffect(() => {
    // 1. Theme loading
    const savedTheme = window.localStorage.getItem("fiqh-ai-theme");
    const nextTheme = themes.some((item) => item.id === savedTheme)
      ? (savedTheme as ThemeId)
      : "parchment";

    // 2. Bookmarks loading
    let initialBookmarks: SearchResult[] = [];
    try {
      const savedBookmarks = window.localStorage.getItem("fiqh-ai-bookmarks");
      if (savedBookmarks) {
        initialBookmarks = JSON.parse(savedBookmarks) as SearchResult[];
      }
    } catch {
      window.localStorage.removeItem("fiqh-ai-bookmarks");
    }

    // 3. History loading
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

    const finalTheme = (themeParam && themes.some((t) => t.id === themeParam)) ? themeParam : nextTheme;
    const finalMode = (modeParam && ["all", "any", "exact"].includes(modeParam)) ? modeParam : "all";
    const finalBooks = booksParam ? booksParam.split(",").map(Number).filter((id) => !isNaN(id)) : [];
    const finalQuery = qParam && qParam.trim().length >= 2 ? qParam : "";

    // Set states asynchronously
    setTimeout(() => {
      setTheme(finalTheme);
      setBookmarks(initialBookmarks);
      setHistory(initialHistory);
      setSearchMode(finalMode);
      setSelectedBooks(finalBooks);

      if (finalQuery) {
        setQuery(finalQuery);
        setHasSearched(true);
        void runSearch(finalQuery, finalMode, finalBooks);
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
        const inputEl = document.querySelector(".search-input") as HTMLInputElement | null;
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

  // Filter book list based on user search in sidebar
  const filteredBooks = books.filter((book) =>
    book.title.includes(bookSearchQuery) ||
    book.authors.some((auth) => auth.includes(bookSearchQuery))
  );

  return (
    <div className={`workspace-wrapper ${hasSearched ? "search-active" : "search-landing"}`}>
      {/* usul.ai Landing Page Hero */}
      {!hasSearched && (
        <div className="landing-hero">
          <h1 className="landing-logo">fiqh.ai</h1>
          <p className="landing-tagline">منصة البحث المعرفي الموثق في نصوص الفقه الحنفي المعتمدة</p>
        </div>
      )}

      <section className="search-panel" aria-label="لوحة التحكم في البحث">
        {hasSearched && (
          <div className="active-brand-header">
            <div className="active-brand-logo" onClick={() => {
              setHasSearched(false);
              setQuery("");
              setResults([]);
              updateUrlParams({ q: "" });
            }} title="العودة للصفحة الرئيسية">
              fiqh.ai
            </div>
            <div className="active-brand-badge">{books.length} كتاب مفهرس</div>
          </div>
        )}

        <div className="toolbar-row">
          <div className="search-options-group">
            <span className="toolbar-label">طريقة مطابقة الكلمات:</span>
            <div className="search-mode-select">
              <button
                className={`mode-btn ${searchMode === "all" ? "active" : ""}`}
                onClick={() => handleSearchModeChange("all")}
                type="button"
                title="البحث عن الصفحات التي تحتوي على جميع الكلمات المكتوبة"
              >
                كل الكلمات
              </button>
              <button
                className={`mode-btn ${searchMode === "any" ? "active" : ""}`}
                onClick={() => handleSearchModeChange("any")}
                type="button"
                title="البحث عن الصفحات التي تحتوي على أي كلمة مكتوبة"
              >
                أي كلمة
              </button>
              <button
                className={`mode-btn ${searchMode === "exact" ? "active" : ""}`}
                onClick={() => handleSearchModeChange("exact")}
                type="button"
                title="البحث عن الكلمات المكتوبة بنفس الترتيب تماماً كجملة واحدة"
              >
                مطابقة تامة
              </button>
            </div>
          </div>

          <div className="search-options-group">
            <span className="toolbar-label">تنسيق عرض النتائج:</span>
            <div className="group-toggle-container">
              <label className="toggle-label" title="تجميع مواضع البحث المتكررة تحت اسم كل كتاب فقهي لتسهيل التصفح">
                <input
                  type="checkbox"
                  className="toggle-checkbox"
                  checked={groupByBook}
                  onChange={(e) => setGroupByBook(e.target.checked)}
                />
                <span className="toggle-text">تجميع حسب الكتاب 📚</span>
              </label>
            </div>
          </div>

          <div className="theme-switcher" aria-label="اختيار مظهر الواجهة">
            {themes.map((item) => (
              <button
                className={item.id === theme ? "theme-button active" : "theme-button"}
                key={item.id}
                type="button"
                onClick={() => changeTheme(item.id)}
                aria-pressed={item.id === theme}
                title={item.label}
              >
                {item.icon} {item.label}
              </button>
            ))}
          </div>
        </div>

        <form className="search-form" onSubmit={handleSubmit}>
          <div className="search-input-container">
            <input
              className="search-input"
              dir="rtl"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="اكتب اللفظ الفقهي (مثال: تطهير الآبار، سؤر الهرة) [اضغط / للتركيز]"
              aria-label="عبارة البحث الفقهي"
              id="search-input"
            />
          </div>
          <button className="search-button" type="submit" disabled={isLoading} id="search-submit">
            {isLoading ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="loading-spinner" />
                جاري البحث...
              </span>
            ) : (
              "ابحث في المصادر"
            )}
          </button>
        </form>
        <div className="quick-row" aria-label="أمثلة بحث سريعة">
          <span className="toolbar-label">مسائل شائعة:</span>
          {exampleQueries.map((example) => (
            <button
              className="quick-button"
              key={example}
              type="button"
              onClick={() => handleExample(example)}
            >
              {example}
            </button>
          ))}
        </div>
      </section>

      {/* Main Workspace Layout (split results pane and slide-out reader panel) */}
      {hasSearched && (
        <section className={`workspace-split-layout ${activeContextChunkId !== null ? "drawer-open" : ""}`}>
          {/* Results List Pane */}
          <div className="results-pane" aria-live="polite">
            {/* Results count badge */}
            {results.length > 0 && !isLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <span className="results-count-badge">
                  📚 {status}
                </span>
              </div>
            )}

            {/* Loading skeletons */}
            {isLoading && (
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            )}

            {/* Empty state */}
            {!isLoading && results.length === 0 && status && !error && (
              <div className="empty-state">
                <span className="empty-state-icon">📖</span>
                <div className="side-copy">{status}</div>
              </div>
            )}

            {/* Error state */}
            {error && !isLoading && (
              <div className="empty-state error-copy">{error}</div>
            )}

            {/* Flat or Grouped Result cards */}
            {!isLoading && !groupByBook && results.slice(0, visibleCount).map((result) => {
              const isBookmarked = bookmarks.some((b) => b.id === result.id);
              return (
                <article className={`result-card ${activeContextChunkId === result.id ? "active-card" : ""}`} key={result.id}>
                  <div className="result-meta">
                    <div>
                      <div
                        className="citation clickable-book-title"
                        onClick={() => setActiveBookId(result.book_id)}
                        title="اضغط لعرض بطاقة تفاصيل الكتاب كاملة"
                      >
                        {result.citation}
                      </div>
                      {result.breadcrumb.length > 0 ? (
                        <div className="breadcrumb">{result.breadcrumb.join(" / ")}</div>
                      ) : null}
                    </div>
                    <div className="chunk-id">#{result.id}</div>
                  </div>

                  <p
                    className="passage"
                    dangerouslySetInnerHTML={{ __html: result.text_highlighted || result.text }}
                  />

                  <div className="card-actions">
                    <button
                      className={`action-btn ${activeContextChunkId === result.id ? "active" : ""}`}
                      onClick={() => void openContextReader(result.id)}
                      type="button"
                      title="قراءة الصفحات السابقة واللاحقة لمعرفة السياق الفقهي الكامل"
                    >
                      🔍 قراءة السياق
                    </button>
                    <button
                      className="action-btn"
                      onClick={() => copyCitation(result)}
                      type="button"
                      title="نسخ تخريج النص والاقتباس"
                    >
                      📋 نسخ التخريج
                    </button>
                    <button
                      className={`action-btn ${isBookmarked ? "active" : ""}`}
                      onClick={() => toggleBookmark(result)}
                      type="button"
                      title={isBookmarked ? "حذف من العلامات المرجعية" : "حفظ في العلامات المرجعية"}
                    >
                      {isBookmarked ? "★ محفوظ" : "☆ حفظ"}
                    </button>
                  </div>
                </article>
              );
            })}

            {/* Grouped results view */}
            {!isLoading && groupByBook && (() => {
              const groups: Record<string, { bookId: number; items: SearchResult[] }> = {};
              results.slice(0, visibleCount).forEach((res) => {
                if (!groups[res.book_title]) {
                  groups[res.book_title] = {
                    bookId: res.book_id,
                    items: [],
                  };
                }
                groups[res.book_title].items.push(res);
              });

              return Object.entries(groups).map(([bookTitle, group]) => {
                const isExpanded = expandedBooks.includes(group.bookId);
                const items = group.items;
                return (
                  <div className="book-group-card" key={group.bookId}>
                    <div className="book-group-header">
                      <div
                        className="book-group-title clickable-book-title"
                        onClick={() => setActiveBookId(group.bookId)}
                        title="اضغط لعرض تفاصيل الكتاب كاملة"
                      >
                        📚 {bookTitle}
                      </div>
                      <span className="book-group-badge">{items.length} مواضع مطابقة</span>
                    </div>

                    {/* Top passage of the book (always visible) */}
                    <div className="book-group-main-passage">
                      <div className="result-meta">
                        <div>
                          <div className="citation">{items[0].citation}</div>
                          {items[0].breadcrumb.length > 0 ? (
                            <div className="breadcrumb">{items[0].breadcrumb.join(" / ")}</div>
                          ) : null}
                        </div>
                        <div className="chunk-id">#{items[0].id}</div>
                      </div>
                      <p
                        className="passage"
                        dangerouslySetInnerHTML={{ __html: items[0].text_highlighted || items[0].text }}
                      />
                      <div className="card-actions">
                        <button
                          className={`action-btn ${activeContextChunkId === items[0].id ? "active" : ""}`}
                          onClick={() => void openContextReader(items[0].id)}
                          type="button"
                          title="قراءة الصفحات السابقة واللاحقة لمعرفة السياق الفقهي الكامل"
                        >
                          🔍 قراءة السياق
                        </button>
                        <button
                          className="action-btn"
                          onClick={() => copyCitation(items[0])}
                          type="button"
                          title="نسخ تخريج النص والاقتباس"
                        >
                          📋 نسخ التخريج
                        </button>
                        <button
                          className={`action-btn ${bookmarks.some((b) => b.id === items[0].id) ? "active" : ""}`}
                          onClick={() => toggleBookmark(items[0])}
                          type="button"
                          title={bookmarks.some((b) => b.id === items[0].id) ? "حذف من العلامات المرجعية" : "حفظ في العلامات المرجعية"}
                        >
                          {bookmarks.some((b) => b.id === items[0].id) ? "★ محفوظ" : "☆ حفظ"}
                        </button>
                      </div>
                    </div>

                    {/* Secondary matching passages in this book */}
                    {items.length > 1 && (
                      <div className="book-group-collapsible-section">
                        {isExpanded ? (
                          <div className="expanded-passages-list">
                            {items.slice(1).map((subItem) => {
                              const isSubBookmarked = bookmarks.some((b) => b.id === subItem.id);
                              return (
                                <div className="sub-passage-card" key={subItem.id}>
                                  <div className="sub-passage-meta">
                                    <div>
                                      <span className="sub-citation">{subItem.citation}</span>
                                      {subItem.breadcrumb.length > 0 ? (
                                        <div className="breadcrumb" style={{ fontSize: '11px', marginTop: 2 }}>
                                          {subItem.breadcrumb.join(" / ")}
                                        </div>
                                      ) : null}
                                    </div>
                                    <span className="chunk-id">#{subItem.id}</span>
                                  </div>
                                  <p
                                    className="passage sub-passage-text"
                                    dangerouslySetInnerHTML={{ __html: subItem.text_highlighted || subItem.text }}
                                  />
                                  <div className="card-actions sub-actions">
                                    <button
                                      className={`action-btn ${activeContextChunkId === subItem.id ? "active" : ""}`}
                                      onClick={() => void openContextReader(subItem.id)}
                                      type="button"
                                    >
                                      🔍 قراءة السياق
                                    </button>
                                    <button className="action-btn" onClick={() => copyCitation(subItem)} type="button">
                                      📋 نسخ التخريج
                                    </button>
                                    <button
                                      className={`action-btn ${isSubBookmarked ? "active" : ""}`}
                                      onClick={() => toggleBookmark(subItem)}
                                      type="button"
                                    >
                                      {isSubBookmarked ? "★ محفوظ" : "☆ حفظ"}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                            <button
                              className="toggle-group-btn"
                              onClick={() => toggleBookExpand(group.bookId)}
                              type="button"
                            >
                              ▲ طي المواضع الإضافية للكتاب
                            </button>
                          </div>
                        ) : (
                          <button
                            className="toggle-group-btn"
                            onClick={() => toggleBookExpand(group.bookId)}
                            type="button"
                          >
                            ▼ عرض {items.length - 1} مواضع مطابقة أخرى في هذا الكتاب
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              });
            })()}

            {/* Load more button */}
            {results.length > visibleCount && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
                <button
                  className="search-button load-more-btn"
                  onClick={() => setVisibleCount((prev) => prev + 8)}
                  type="button"
                >
                  🔄 تحميل المزيد من النتائج الفقهية ({results.length - visibleCount} متبقية)
                </button>
              </div>
            )}
          </div>

          {/* Sidebar Column */}
          <aside className="side-stack">
            {/* Methodology Card */}
            <div className="side-panel">
              <div className="side-title">تنبيه فقهي ومنهجي</div>
              <p className="side-copy">
                هذه منصة علمية للبحث والمراجعة وتخريج المسائل من كتب الفقه الحنفي المعتمدة.
                <strong> لا تعتبر فتاوى جاهزة</strong> وإنما مساعدة للباحثين للوصول لنصوص الفقهاء ومظانها الموثقة.
              </p>
            </div>

            {/* Book Filters Checklist */}
            <div className="side-panel">
              <div className="side-title">
                <span>تصفية بالكتب المحددة</span>
                {selectedBooks.length > 0 && (
                  <button className="clear-widget-btn" onClick={clearBookFilters} type="button">
                    إلغاء التصفية ({selectedBooks.length})
                  </button>
                )}
              </div>
              <input
                className="book-search-input"
                placeholder="ابحث عن كتاب لتصفيته..."
                value={bookSearchQuery}
                onChange={(e) => setBookSearchQuery(e.target.value)}
                dir="rtl"
                id="book-filter-search"
              />
              {books.length > 0 ? (
                <ul className="book-filter-list side-list-scrollbar">
                  {filteredBooks.map((book) => (
                    <li key={book.id}>
                      <label className="book-filter-item">
                        <input
                          type="checkbox"
                          className="book-filter-checkbox"
                          checked={selectedBooks.includes(book.id)}
                          onChange={() => handleBookToggle(book.id)}
                        />
                        <div className="book-filter-label" title={book.title}>
                          <span
                            className="clickable-book-title"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setActiveBookId(book.id);
                            }}
                            title="عرض تفاصيل هذا الكتاب"
                          >
                            {book.title}
                          </span>
                          <div style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 500 }}>
                            {book.authors.join("، ") || "مؤلف غير محدد"}
                          </div>
                        </div>
                        <span className="book-filter-count">{book.chunk_count}</span>
                      </label>
                    </li>
                  ))}
                  {filteredBooks.length === 0 && (
                    <div className="empty-widget">لا يوجد كتاب مطابق للمدخل.</div>
                  )}
                </ul>
              ) : (
                <p className="side-copy">جاري جلب الفهرس...</p>
              )}
            </div>

            {/* Bookmarked items */}
            <div className="side-panel">
              <div className="side-title">
                <span>الإشارات المحفوظة</span>
                <span className="side-title-count">{bookmarks.length}</span>
              </div>
              {bookmarks.length > 0 ? (
                <ul className="widgets-list side-list-scrollbar">
                  {bookmarks.map((bookmark) => (
                    <li key={bookmark.id} className="widget-item">
                      <div
                        className="bookmark-link"
                        onClick={() => void openContextReader(bookmark.id)}
                        title="قراءة في السياق"
                      >
                        <span className="bookmark-title">{bookmark.citation}</span>
                        <span className="bookmark-snippet" dir="rtl">{bookmark.text}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty-widget">لا توجد نصوص محفوظة بعد. اضغط &quot;حفظ&quot; في الكروت لحفظها.</div>
              )}
            </div>

            {/* Search History */}
            <div className="side-panel">
              <div className="side-title">
                <span>آخر عمليات البحث</span>
                {history.length > 0 && (
                  <button className="clear-widget-btn" onClick={clearHistory} type="button">
                    مسح
                  </button>
                )}
              </div>
              {history.length > 0 ? (
                <ul className="widgets-list">
                  {history.map((histQuery) => (
                    <li key={histQuery} className="widget-item">
                      <span
                        className="history-link"
                        onClick={() => handleHistoryClick(histQuery)}
                      >
                        🔍 {histQuery}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty-widget">سجل البحث فارغ.</div>
              )}
            </div>
          </aside>

          {/* Context Reader Panel/Drawer */}
          <div className={`context-drawer-pane ${activeContextChunkId !== null ? "open" : ""}`}>
            <div className="drawer-header">
              <div className="drawer-title-group">
                <span className="drawer-title">قارئ السياق الفقهي</span>
                <span className="drawer-subtitle">عرض الصفحات المتتالية للتحقق من الموضع</span>
              </div>
              <button
                className="drawer-close-btn"
                onClick={() => setActiveContextChunkId(null)}
                type="button"
                aria-label="إغلاق"
              >
                ✕
              </button>
            </div>

            <div className="drawer-body side-list-scrollbar">
              {isContextLoading ? (
                <div style={{ textAlign: 'center', padding: '48px', color: 'var(--muted)' }}>
                  <div className="loading-spinner" style={{ width: 32, height: 32, margin: '0 auto 16px' }} />
                  <div>جاري جلب سياق المسألة الفقهية...</div>
                </div>
              ) : (
                contextResults.map((chunk) => (
                  <div
                    key={chunk.id}
                    className={`context-page-card ${chunk.id === activeContextChunkId ? "highlighted-chunk" : ""}`}
                  >
                    <div className="context-page-header">
                      <span
                        className="context-page-num clickable-book-title"
                        onClick={() => setActiveBookId(chunk.book_id)}
                        title="عرض تفاصيل هذا الكتاب"
                      >
                        {chunk.citation} {chunk.part_name ? `(ج ${chunk.part_name})` : ""} {chunk.page_number ? `(ص ${chunk.page_number})` : ""}
                      </span>
                      {chunk.id === activeContextChunkId ? (
                        <span className="context-page-indicator">موضع البحث</span>
                      ) : (
                        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>صفحة مجاورة</span>
                      )}
                    </div>
                    <p
                      className="passage"
                      dangerouslySetInnerHTML={{ __html: chunk.text_highlighted || chunk.text }}
                    />
                  </div>
                ))
              )}
            </div>

            <div className="drawer-footer">
              <button
                className="search-button"
                style={{ minHeight: '40px', padding: '0 20px', fontSize: '13px', width: '100%' }}
                onClick={() => setActiveContextChunkId(null)}
                type="button"
              >
                إغلاق القارئ
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Book Details Modal */}
      {activeBookId !== null && activeBook && (
        <div className="modal-overlay" onClick={() => setActiveBookId(null)}>
          <div className="modal-content book-details-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <span className="modal-title">بطاقة تعريف الكتاب الفقهي</span>
                <span className="modal-subtitle">البيانات البيبلوغرافية المعتمدة للمصدر</span>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setActiveBookId(null)}
                type="button"
                aria-label="إغلاق"
              >
                ✕
              </button>
            </div>

            <div className="modal-body book-details-body">
              <h2 className="book-details-title">📖 {activeBook.title}</h2>
              
              <div className="book-details-grid">
                <div className="detail-item">
                  <span className="detail-label">المؤلف والفقيه</span>
                  <span className="detail-value">{activeBook.authors.join("، ") || "مؤلف غير محدد"}</span>
                </div>
                
                <div className="detail-item">
                  <span className="detail-label">التصنيف الفقهي</span>
                  <span className="detail-value">
                    {activeBook.categories.map((c) => (
                      <span key={c} className="category-badge">{c}</span>
                    ))}
                  </span>
                </div>

                <div className="detail-item">
                  <span className="detail-label">دار النشر والتخريج</span>
                  <span className="detail-value">{activeBook.publisher || "غير محدد في بيانات المخطوط"}</span>
                </div>

                <div className="detail-item">
                  <span className="detail-label">تاريخ الإصدار / سنة النشر</span>
                  <span className="detail-value">{activeBook.year || "طبعة غير مؤرخة"}</span>
                </div>

                <div className="detail-item">
                  <span className="detail-label">حجم الصفحات المفهرسة</span>
                  <span className="detail-value">{activeBook.chunk_count} مقطع نصي معتمد في قاعدة البيانات</span>
                </div>

                <div className="detail-item">
                  <span className="detail-label">معرف الكتاب الفريد (ID)</span>
                  <span className="detail-value font-outfit">#{activeBook.id}</span>
                </div>
              </div>

              <div className="citation-preview-box">
                <span className="detail-label">صيغة التخريج المعتمدة للتوثيق العلمي</span>
                <div className="citation-preview-text">
                  {`${activeBook.title}، ${activeBook.authors.join("، ") || "مؤلف غير محدد"}${activeBook.publisher ? `، ${activeBook.publisher}` : ""}${activeBook.year ? `، ${activeBook.year}` : ""}`}
                </div>
                <button
                  className="action-btn"
                  style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}
                  onClick={() => {
                    void navigator.clipboard.writeText(`${activeBook.title}، ${activeBook.authors.join("، ") || "مؤلف غير محدد"}${activeBook.publisher ? `، ${activeBook.publisher}` : ""}${activeBook.year ? `† ${activeBook.year}` : ""}`);
                    showToast("تم نسخ التخريج المعتمد للكتاب ✓");
                  }}
                  type="button"
                >
                  📋 نسخ صيغة التوثيق العلمي
                </button>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="search-button"
                style={{ minHeight: '42px', padding: '0 24px', fontSize: '14px' }}
                onClick={() => setActiveBookId(null)}
                type="button"
              >
                إغلاق بطاقة الكتاب
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Goto Top Arrow */}
      {showScrollTop && (
        <button
          className="goto-top-btn"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          type="button"
          aria-label="العودة لأعلى الصفحة"
          title="العودة لأعلى الصفحة"
        >
          ▲
        </button>
      )}

      {/* Toast Notification */}
      <div className={`toast ${toastVisible ? "visible" : ""}`}>
        {toastMessage}
      </div>

      <footer className="app-footer">
        <div>fiqh.ai · منصة البحث المرجعي الفقهي الذكي · تم التطوير بواسطة عثمان</div>
        <div style={{ marginTop: 6, fontSize: '11px', opacity: 0.85 }}>
          تطوير البرمجيات والواجهة:{" "}
          <a
            href="https://portfolio-mohammad.web.app/yameen"
            target="_blank"
            rel="noopener noreferrer"
            className="dev-credit-link"
          >
            محمد يامين
          </a>
        </div>
      </footer>
    </div>
  );
}
