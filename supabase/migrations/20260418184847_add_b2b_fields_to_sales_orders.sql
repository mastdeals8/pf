/*
  # Add B2B fields to sales_orders

  1. Changes to `sales_orders`
    - `is_b2b` (boolean, default false) — marks the order as a B2B sale
    - `ship_to_customer_id` (uuid, nullable, FK → customers.id) — the end customer the supplier ships to

  2. Validation constraint
    - If is_b2b = true, ship_to_customer_id must not be null
    - If is_b2b = false, ship_to_customer_id must be null

  3. Notes
    - No new tables created
    - No invoice table modified
    - No stock logic touched
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales_orders' AND column_name = 'is_b2b'
  ) THEN
    ALTER TABLE sales_orders ADD COLUMN is_b2b boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales_orders' AND column_name = 'ship_to_customer_id'
  ) THEN
    ALTER TABLE sales_orders ADD COLUMN ship_to_customer_id uuid NULL REFERENCES customers(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'sales_orders' AND constraint_name = 'chk_b2b_ship_to_customer'
  ) THEN
    ALTER TABLE sales_orders ADD CONSTRAINT chk_b2b_ship_to_customer
      CHECK (
        (is_b2b = true AND ship_to_customer_id IS NOT NULL)
        OR
        (is_b2b = false AND ship_to_customer_id IS NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_orders_ship_to_customer_id
  ON sales_orders(ship_to_customer_id)
  WHERE ship_to_customer_id IS NOT NULL;
