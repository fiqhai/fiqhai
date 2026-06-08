import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "fiqh.ai — بحث مرجعي في كتب الفقه الحنفي",
    template: "%s | fiqh.ai",
  },
  description:
    "منصة بحث مرجعي ذكية في كتب الفقه الحنفي المعتمدة. ابحث بالعربية أو الإنجليزية واحصل على النصوص مع أرقام الصفحات والتخريج الكامل. · Smart bilingual reference search across verified Hanafi fiqh books with full citations.",
  keywords: "فقه حنفي, بحث فقهي, كتب الفقه, مراجع فقهية, تخريج المسائل, Hanafi fiqh, fiqh search, Islamic law search",
  authors: [{ name: "Hashim Hameem" }, { name: "Mohammad Usman" }],
  openGraph: {
    title: "fiqh.ai — Hanafi fiqh reference search",
    description: "Bilingual reference search across verified Hanafi fiqh books with citations and page numbers.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
