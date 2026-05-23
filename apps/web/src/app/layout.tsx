import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "fiqh.ai — بحث مرجعي في كتب الفقه الحنفي",
  description:
    "منصة بحث مرجعي ذكية في كتب الفقه الحنفي المعتمدة. ابحث بالعربية واحصل على النصوص مع أرقام الصفحات والتخريج الكامل.",
  keywords: "فقه حنفي, بحث فقهي, كتب الفقه, مراجع فقهية, تخريج المسائل",
  authors: [{ name: "عثمان" }],
  openGraph: {
    title: "fiqh.ai — بحث مرجعي في كتب الفقه الحنفي",
    description: "منصة بحث مرجعي ذكية في كتب الفقه الحنفي المعتمدة.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
