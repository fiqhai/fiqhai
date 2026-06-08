import { SearchExperience } from "@/components/SearchExperience";
import { CLIENT_API_BASE_URL } from "@/lib/api";
import { getBooks } from "@/lib/books";

export default async function MethodPage() {
  const books = await getBooks();

  return (
    <main className="page-shell">
      <SearchExperience apiBaseUrl={CLIENT_API_BASE_URL} books={books} view="method" />
    </main>
  );
}
