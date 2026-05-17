# Products API

Base path: `/api/products`

Auth is passed via headers set by the middleware after JWT verification:
- `x-user-role` — `customer` | `admin` | `super_admin`
- `x-user-id` — UUID of the authenticated user

---

## GET /api/products

Public. Returns a paginated list of published, active products.

### Query Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `q` | string | — | Search by product name (case-insensitive, partial match) |
| `category_id` | UUID | — | Filter by category |
| `min_price` | number | — | Filter products with `base_price >= min_price` |
| `max_price` | number | — | Filter products with `base_price <= max_price` |
| `sort` | enum | `newest` | Sort order — see values below |
| `page` | integer | `1` | Page number (min 1) |
| `limit` | integer | `20` | Items per page (min 1, max 100) |

#### Sort Values

| Value | Description |
|---|---|
| `newest` | Most recently created first (default) |
| `oldest` | Oldest first |
| `price_asc` | Lowest price first |
| `price_desc` | Highest price first |
| `trending` | Most ordered in the last 30 days first |

### Example Requests

```
# Search by name
GET /api/products?q=jaket

# Filter by category + price range
GET /api/products?category_id=550e8400-e29b-41d4-a716-446655440010&min_price=100000&max_price=500000

# Sort by price ascending with pagination
GET /api/products?sort=price_asc&page=2&limit=12

# Trending products in a category
GET /api/products?sort=trending&category_id=550e8400-e29b-41d4-a716-446655440010

# Combined: search + price filter + sort
GET /api/products?q=parka&min_price=200000&sort=newest
```

### Response

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "name": "Jaket Parka",
        "slug": "jaket-parka",
        "description": "Jaket parka premium",
        "base_price": "350000",
        "status": "published",
        "is_active": true,
        "category_id": "550e8400-e29b-41d4-a716-446655440010",
        "category": { "id": "...", "name": "Jaket", "slug": "jaket" },
        "cover_image": {
          "id": "img-1",
          "image_url": "https://storage.supabase.co/...",
          "alt_text": null,
          "sort_order": 0
        },
        "colors": ["coklat", "olive", "putih"],
        "sizes": ["S", "M", "XL"],
        "review_count": 24,
        "order_count": 150,
        "created_at": "2026-01-01T00:00:00.000Z",
        "updated_at": "2026-01-01T00:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "pages": 3
    },
    "filters": {
      "q": "jaket",
      "category_id": null,
      "min_price": null,
      "max_price": null,
      "sort": "newest"
    }
  }
}
```

---

## GET /api/products/:id

Public. Returns full product detail. The `:id` parameter accepts either a UUID or a slug.

### Query Parameters

| Parameter | Type | Description |
|---|---|---|
| `preview` | `1` | Admin only — allows viewing `draft` / `archived` products |

### Example Requests

```
# By UUID
GET /api/products/550e8400-e29b-41d4-a716-446655440001

# By slug
GET /api/products/jaket-parka

# Admin preview of a draft product
GET /api/products/jaket-parka-draft?preview=1
# Requires x-user-role: admin or super_admin header
```

### Response

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "name": "Jaket Parka",
    "slug": "jaket-parka",
    "description": "Jaket parka premium bahan waterproof",
    "base_price": "350000",
    "status": "published",
    "is_active": true,
    "category_id": "550e8400-e29b-41d4-a716-446655440010",
    "category": {
      "id": "550e8400-e29b-41d4-a716-446655440010",
      "name": "Jaket",
      "slug": "jaket",
      "image_url": "https://storage.supabase.co/..."
    },
    "images": [
      { "id": "img-1", "image_url": "https://...", "alt_text": null, "sort_order": 0 },
      { "id": "img-2", "image_url": "https://...", "alt_text": "Side view", "sort_order": 1 }
    ],
    "colors": ["coklat", "olive", "putih"],
    "sizes": ["S", "M", "XL"],
    "variants": [
      {
        "id": "var-1",
        "sku": "JKT-COKLAT-M",
        "color": "coklat",
        "size": "M",
        "price": "350000",
        "is_active": true,
        "stock_on_hand": 10,
        "stock_reserved": 2,
        "available_stock": 8
      }
    ],
    "rating": {
      "average": 4.7,
      "count": 24
    },
    "reviews": [
      {
        "id": "rev-1",
        "rating": 5,
        "comment": "Bagus banget, sesuai ekspektasi",
        "created_at": "2026-02-01T00:00:00.000Z",
        "user": { "id": "user-1", "name": "Budi" }
      }
    ],
    "order_count": 150,
    "created_at": "2026-01-01T00:00:00.000Z",
    "updated_at": "2026-01-01T00:00:00.000Z"
  }
}
```

### Notes

- `variants[].price` falls back to `base_price` when the variant has no price override.
- `available_stock = stock_on_hand - stock_reserved` (minimum 0).
- `rating.average` is computed from all reviews (not just the 10 shown). Returns `null` when no reviews.
- `reviews` returns the 10 most recent reviews only.

---

## POST /api/products

**Admin only** (`admin` or `super_admin`).

Creates a new product with variants. Images are uploaded as files.

### Content Types

Accepts **either**:

**`multipart/form-data`** — use when uploading images:
- `data` (required) — JSON string with product fields
- `images` (optional, multiple) — image files (jpeg/png/webp/gif, max 2 MB each)

**`application/json`** — use when no images:
- Body contains product fields directly

### Body Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string (2–200) | ✅ | Product name |
| `slug` | string | — | URL slug — auto-generated from name if omitted |
| `description` | string (max 5000) | — | Product description |
| `category_id` | UUID | — | Category reference |
| `base_price` | number (positive) | ✅ | Base price in IDR |
| `status` | `draft` \| `published` \| `archived` | — | Default: `published` |
| `is_active` | boolean | — | Default: `true` |
| `variants` | array | ✅ | At least one variant required |
| `variants[].color` | string | ✅ | e.g. `"coklat"`, `"olive"`, `"putih"` |
| `variants[].size` | string | ✅ | e.g. `"S"`, `"M"`, `"XL"` |
| `variants[].sku` | string | — | Stock keeping unit |
| `variants[].price` | number | — | Override price (uses base_price if null) |
| `variants[].is_active` | boolean | — | Default: `true` |

### Example — JSON

```json
POST /api/products
Content-Type: application/json

{
  "name": "Jaket Parka",
  "description": "Jaket parka premium bahan waterproof",
  "category_id": "550e8400-e29b-41d4-a716-446655440010",
  "base_price": 350000,
  "status": "published",
  "variants": [
    { "color": "coklat", "size": "S", "sku": "JKT-COKLAT-S" },
    { "color": "coklat", "size": "M", "sku": "JKT-COKLAT-M" },
    { "color": "olive",  "size": "M", "sku": "JKT-OLIVE-M", "price": 380000 },
    { "color": "putih",  "size": "XL", "sku": "JKT-PUTIH-XL" }
  ]
}
```

### Example — multipart/form-data

```
POST /api/products
Content-Type: multipart/form-data

data: {"name":"Jaket Parka","base_price":350000,"variants":[{"color":"coklat","size":"M"}]}
images: <file: front.jpg>
images: <file: side.jpg>
```

### Response — 201 Created

```json
{
  "success": true,
  "data": {
    "id": "new-uuid",
    "name": "Jaket Parka",
    "slug": "jaket-parka",
    "product_images": [...],
    "product_variants": [...]
  }
}
```

### Error Responses

| Status | Reason |
|---|---|
| 403 | Not admin |
| 400 | Malformed JSON or missing `data` field in multipart |
| 409 | Slug already exists |
| 422 | Validation failed or image upload error |

---

## PUT /api/products/:id

**Admin only**. Updates a product. All fields are optional — only provided fields are changed.

### Content Types

Same as POST — accepts `multipart/form-data` (with `data` JSON field + `images` files) or `application/json`.

### Body Fields

All fields from POST are optional, plus:

| Field | Type | Description |
|---|---|---|
| `variants` | array | Upserts variants by `(color, size)` — existing variants not in the list are unchanged |
| `remove_image_ids` | UUID[] | IDs of `product_images` rows to soft-delete and remove from storage |

### Example — update name and add a variant

```json
PUT /api/products/550e8400-e29b-41d4-a716-446655440001
Content-Type: application/json

{
  "name": "Jaket Parka Premium",
  "variants": [
    { "color": "hitam", "size": "M", "sku": "JKT-HITAM-M" }
  ]
}
```

### Example — remove images and upload new ones

```
PUT /api/products/550e8400-e29b-41d4-a716-446655440001
Content-Type: multipart/form-data

data: {"remove_image_ids":["img-uuid-1","img-uuid-2"]}
images: <file: new-front.jpg>
```

### Error Responses

| Status | Reason |
|---|---|
| 400 | Empty body (no changes) or malformed JSON |
| 403 | Not admin |
| 404 | Product not found or already deleted |
| 409 | New slug conflicts with another product |
| 422 | Validation failed or image upload error |

---

## DELETE /api/products/:id

**Admin only**. Soft-deletes a product — sets `deleted_at`, `deleted_by`, and `is_active: false`. The record remains in the database and is excluded from all public queries.

Storage files are **not** deleted on soft delete.

### Response — 200

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "deleted": true
  }
}
```

### Error Responses

| Status | Reason |
|---|---|
| 403 | Not admin |
| 404 | Product not found or already deleted |

---

## Common Error Shape

```json
{
  "success": false,
  "error": {
    "message": "Human-readable error message.",
    "details": { "field": ["error description"] }
  }
}
```

`details` is only present on 422 validation errors.
