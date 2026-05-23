import { SearchExperience } from "@/components/SearchExperience";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

type Book = {
  id: number;
  title: string;
  authors: string[];
  categories: string[];
  publisher: string | null;
  year: string | null;
  chunk_count: number;
};

async function getBooks(): Promise<Book[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/books`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as { books?: Book[] };
    return payload.books ?? [];
  } catch {
    return [];
  }
}

export default async function Home() {
  const books = await getBooks();

  return (
    <main className="page-shell">
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">fiqh.ai</div>
          <div className="brand-subtitle">
            بحث مرجعي في كتب الفقه الحنفي مع نصوص الصفحات والمصادر كما هي في الفهرس.
          </div>
        </div>
        <div className="status-pill" title="Indexed source count">
          <span className="status-dot" />
          {books.length} كتاب مفهرس
        </div>
      </header>

      <SearchExperience apiBaseUrl={API_BASE_URL} books={books} />
    </main>
  );
}

