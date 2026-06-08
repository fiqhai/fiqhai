import { API_BASE_URL } from "@/lib/api";

export type Book = {
  id: number;
  title: string;
  authors: string[];
  categories: string[];
  publisher: string | null;
  year: string | null;
  chunk_count: number;
};

export async function getBooks(): Promise<Book[]> {
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
