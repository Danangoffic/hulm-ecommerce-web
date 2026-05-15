-- HULM MVP initial PostgreSQL migration
-- Target: PostgreSQL 14+

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'customer',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_role_check CHECK (role IN ('customer', 'admin', 'super_admin'))
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users (is_active);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT categories_slug_unique UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_categories_name ON categories (name);

DROP TRIGGER IF EXISTS trg_categories_updated_at ON categories;
CREATE TRIGGER trg_categories_updated_at
BEFORE UPDATE ON categories
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NULL REFERENCES categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text NULL,
  base_price numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'published',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT products_slug_unique UNIQUE (slug),
  CONSTRAINT products_base_price_check CHECK (base_price >= 0),
  CONSTRAINT products_status_check CHECK (status IN ('draft', 'published', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_products_category_id ON products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products (status);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products (is_active);

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  alt_text text NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT product_images_sort_order_check CHECK (sort_order >= 0)
);

CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images (product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_product_sort ON product_images (product_id, sort_order);

DROP TRIGGER IF EXISTS trg_product_images_updated_at ON product_images;
CREATE TRIGGER trg_product_images_updated_at
BEFORE UPDATE ON product_images
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku text NULL,
  color text NOT NULL,
  size text NOT NULL,
  price numeric(12,2) NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT product_variants_sku_unique UNIQUE (sku),
  CONSTRAINT product_variants_product_color_size_unique UNIQUE (product_id, color, size),
  CONSTRAINT product_variants_price_check CHECK (price IS NULL OR price >= 0),
  CONSTRAINT product_variants_color_check CHECK (length(trim(color)) > 0),
  CONSTRAINT product_variants_size_check CHECK (length(trim(size)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants (product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_is_active ON product_variants (is_active);
CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants (sku);

DROP TRIGGER IF EXISTS trg_product_variants_updated_at ON product_variants;
CREATE TRIGGER trg_product_variants_updated_at
BEFORE UPDATE ON product_variants
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL UNIQUE REFERENCES product_variants(id) ON DELETE CASCADE,
  stock_on_hand integer NOT NULL DEFAULT 0,
  stock_reserved integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_stock_on_hand_check CHECK (stock_on_hand >= 0),
  CONSTRAINT inventory_stock_reserved_check CHECK (stock_reserved >= 0),
  CONSTRAINT inventory_stock_balance_check CHECK (stock_reserved <= stock_on_hand)
);

CREATE INDEX IF NOT EXISTS idx_inventory_variant_id ON inventory (variant_id);

DROP TRIGGER IF EXISTS trg_inventory_updated_at ON inventory;
CREATE TRIGGER trg_inventory_updated_at
BEFORE UPDATE ON inventory
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS user_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label text NULL,
  recipient_name text NOT NULL,
  phone text NOT NULL,
  address_line1 text NOT NULL,
  address_line2 text NULL,
  city text NOT NULL,
  province text NOT NULL,
  postal_code text NOT NULL,
  country text NOT NULL DEFAULT 'ID',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT user_addresses_phone_check CHECK (length(trim(phone)) > 0),
  CONSTRAINT user_addresses_postal_code_check CHECK (length(trim(postal_code)) > 0),
  CONSTRAINT user_addresses_country_check CHECK (length(trim(country)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON user_addresses (user_id);
CREATE INDEX IF NOT EXISTS idx_user_addresses_is_default ON user_addresses (user_id, is_default);

DROP TRIGGER IF EXISTS trg_user_addresses_updated_at ON user_addresses;
CREATE TRIGGER trg_user_addresses_updated_at
BEFORE UPDATE ON user_addresses
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending_payment',
  currency text NOT NULL DEFAULT 'IDR',
  subtotal_amount numeric(12,2) NOT NULL,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  shipping_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL,
  shipping_address_snapshot jsonb NOT NULL,
  shipping_courier text NULL,
  shipping_service text NULL,
  tracking_number text NULL,
  paid_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT orders_order_number_unique UNIQUE (order_number),
  CONSTRAINT orders_status_check CHECK (
    status IN (
      'pending_payment',
      'paid',
      'processing',
      'packed',
      'shipped',
      'completed',
      'cancelled',
      'expired'
    )
  ),
  CONSTRAINT orders_currency_check CHECK (length(trim(currency)) > 0),
  CONSTRAINT orders_subtotal_amount_check CHECK (subtotal_amount >= 0),
  CONSTRAINT orders_discount_amount_check CHECK (discount_amount >= 0),
  CONSTRAINT orders_shipping_amount_check CHECK (shipping_amount >= 0),
  CONSTRAINT orders_total_amount_check CHECK (total_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_created_at ON orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  product_name_snapshot text NOT NULL,
  variant_snapshot jsonb NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  quantity integer NOT NULL,
  line_total numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT order_items_quantity_check CHECK (quantity > 0),
  CONSTRAINT order_items_unit_price_check CHECK (unit_price >= 0),
  CONSTRAINT order_items_line_total_check CHECK (line_total >= 0)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_variant_id ON order_items (variant_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items (product_id);

DROP TRIGGER IF EXISTS trg_order_items_updated_at ON order_items;
CREATE TRIGGER trg_order_items_updated_at
BEFORE UPDATE ON order_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'midtrans',
  status text NOT NULL DEFAULT 'initiated',
  provider_transaction_id text NULL,
  payment_method text NULL,
  amount numeric(12,2) NOT NULL,
  raw_request jsonb NULL,
  raw_callback jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT payments_provider_check CHECK (length(trim(provider)) > 0),
  CONSTRAINT payments_status_check CHECK (status IN ('initiated', 'pending', 'paid', 'failed', 'expired')),
  CONSTRAINT payments_amount_check CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_transaction_id ON payments (provider_transaction_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);

DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  type text NOT NULL,
  value numeric(12,2) NOT NULL,
  min_order_amount numeric(12,2) NOT NULL DEFAULT 0,
  max_discount_amount numeric(12,2) NULL,
  start_at timestamptz NULL,
  end_at timestamptz NULL,
  usage_limit integer NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT vouchers_code_unique UNIQUE (code),
  CONSTRAINT vouchers_type_check CHECK (type IN ('percent', 'fixed')),
  CONSTRAINT vouchers_value_check CHECK (value >= 0),
  CONSTRAINT vouchers_min_order_amount_check CHECK (min_order_amount >= 0),
  CONSTRAINT vouchers_max_discount_amount_check CHECK (max_discount_amount IS NULL OR max_discount_amount >= 0),
  CONSTRAINT vouchers_usage_limit_check CHECK (usage_limit IS NULL OR usage_limit > 0),
  CONSTRAINT vouchers_valid_period_check CHECK (end_at IS NULL OR start_at IS NULL OR end_at >= start_at)
);

CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers (code);
CREATE INDEX IF NOT EXISTS idx_vouchers_is_active ON vouchers (is_active);
CREATE INDEX IF NOT EXISTS idx_vouchers_period ON vouchers (start_at, end_at);

DROP TRIGGER IF EXISTS trg_vouchers_updated_at ON vouchers;
CREATE TRIGGER trg_vouchers_updated_at
BEFORE UPDATE ON vouchers
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS order_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  voucher_id uuid NOT NULL REFERENCES vouchers(id) ON DELETE RESTRICT,
  code_snapshot text NOT NULL,
  discount_amount numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT order_vouchers_order_unique UNIQUE (order_id),
  CONSTRAINT order_vouchers_discount_amount_check CHECK (discount_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_order_vouchers_order_id ON order_vouchers (order_id);
CREATE INDEX IF NOT EXISTS idx_order_vouchers_voucher_id ON order_vouchers (voucher_id);

DROP TRIGGER IF EXISTS trg_order_vouchers_updated_at ON order_vouchers;
CREATE TRIGGER trg_order_vouchers_updated_at
BEFORE UPDATE ON order_vouchers
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NULL,
  image_url text NOT NULL,
  link_url text NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  start_at timestamptz NULL,
  end_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT banners_sort_order_check CHECK (sort_order >= 0),
  CONSTRAINT banners_valid_period_check CHECK (end_at IS NULL OR start_at IS NULL OR end_at >= start_at)
);

CREATE INDEX IF NOT EXISTS idx_banners_is_active ON banners (is_active);
CREATE INDEX IF NOT EXISTS idx_banners_sort_order ON banners (sort_order);
CREATE INDEX IF NOT EXISTS idx_banners_period ON banners (start_at, end_at);

DROP TRIGGER IF EXISTS trg_banners_updated_at ON banners;
CREATE TRIGGER trg_banners_updated_at
BEFORE UPDATE ON banners
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  rating integer NOT NULL,
  comment text NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT reviews_rating_check CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT reviews_user_product_unique UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews (user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews (product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews (rating);

DROP TRIGGER IF EXISTS trg_reviews_updated_at ON reviews;
CREATE TRIGGER trg_reviews_updated_at
BEFORE UPDATE ON reviews
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
