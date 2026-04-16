/*
  # Relink NULL company_id records to Heer

  ## Summary
  All existing records (products, invoices, sales orders, delivery challans)
  that have no company assigned (company_id IS NULL) are updated to point to
  the "Heer" company (sort_order = 2).

  ## Tables Updated
  - `products` — 10 records without company
  - `invoices` — 3 records without company
  - `sales_orders` — 2 records without company
  - `delivery_challans` — 1 record without company

  ## Notes
  - Only NULL company_id rows are affected; existing Prachi Fulfagar assignments untouched
  - Uses sort_order = 2 to reliably identify the Heer entity
*/

DO $$
DECLARE
  heer_id uuid;
BEGIN
  SELECT id INTO heer_id FROM companies WHERE sort_order = 2 LIMIT 1;

  IF heer_id IS NOT NULL THEN
    UPDATE products SET company_id = heer_id WHERE company_id IS NULL;
    UPDATE invoices SET company_id = heer_id WHERE company_id IS NULL;
    UPDATE sales_orders SET company_id = heer_id WHERE company_id IS NULL;
    UPDATE delivery_challans SET company_id = heer_id WHERE company_id IS NULL;
  END IF;
END $$;
