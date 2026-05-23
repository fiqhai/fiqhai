# fiqh.ai Usage

## 1. Add Books

Put JSONL books anywhere under:

```text
data/books/
```

Supported current format: one JSON object per line:

```json
{
  "text": "Arabic page or passage text",
  "metadata": {
    "book_id": 1186,
    "book_title": "نور الإيضاح ونجاة الأرواح في الفقه الحنفي",
    "authors": ["الشرنبلالي"],
    "categories": ["فقه حنفي"],
    "publisher": "المكتبة العصرية",
    "year": "1246 هـ - 2005 م",
    "part_name": "1",
    "page_number": 15,
    "page_id": 4,
    "breadcrumb": ["كتاب الطهارة", "فصل [في بيان أحكام السؤر]"]
  }
}
```

Required fields:

- `text`
- `metadata.book_id`
- `metadata.book_title`

Strongly recommended fields:

- `authors`
- `categories`
- `part_name`
- `page_number`
- `breadcrumb`

## 2. Rebuild The Index

Run this every time you add or change books:

```bash
python3 apps/api/scripts/ingest_books.py
```

The generated local index is:

```text
data/index/fiqh.db
```

## 3. Search From Terminal

```bash
python3 apps/api/scripts/search_books.py "سؤر الهرة"
python3 apps/api/scripts/search_books.py "الماء المستعمل"
python3 apps/api/scripts/search_books.py "تطهير الآبار"
```

## 4. Run The API

First-time setup:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r apps/api/requirements.txt
```

Start API:

```bash
.venv/bin/uvicorn app.main:app --app-dir apps/api --host 127.0.0.1 --port 8000
```

Useful API endpoints:

```text
GET  http://127.0.0.1:8000/health
GET  http://127.0.0.1:8000/books
GET  http://127.0.0.1:8000/search?q=سؤر الهرة&limit=10
POST http://127.0.0.1:8000/admin/reindex
```

## 5. Run The Web UI

First-time setup:

```bash
npm install
```

Start UI:

```bash
npm run dev:web
```

Open:

```text
http://127.0.0.1:3000
```

## 6. Themes

The UI has three themes:

- `رق`
- `ليلي`
- `زمردي`

The selected theme is saved in browser local storage.

## 7. Current Rule

This app is a reference lookup tool for students of knowledge. It is not a fatwa system. Search results should show only citations and passages that exist in the indexed books.

