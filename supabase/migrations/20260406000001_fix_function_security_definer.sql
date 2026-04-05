-- Fix all public functions: add SECURITY DEFINER + SET search_path = 'public'
-- This prevents search_path injection attacks

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, display_name, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)), 'user')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.sync_godown_stock_on_product_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NEW.stock_quantity <> OLD.stock_quantity THEN
    UPDATE godown_stock SET quantity = NEW.stock_quantity, updated_at = now() WHERE product_id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.update_customer_balance_on_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL THEN
    UPDATE customers SET balance = balance + NEW.outstanding_amount, total_revenue = total_revenue + NEW.total_amount, updated_at = now() WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.update_customer_balance_on_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NEW.payment_type = 'receipt' AND NEW.customer_id IS NOT NULL THEN
    UPDATE customers SET balance = balance - NEW.amount, updated_at = now() WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.update_supplier_balance_on_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NEW.payment_type = 'payment' AND NEW.supplier_id IS NOT NULL THEN
    UPDATE suppliers SET balance = balance - NEW.amount, updated_at = now() WHERE id = NEW.supplier_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.update_supplier_balance_on_purchase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NEW.supplier_id IS NOT NULL THEN
    UPDATE suppliers SET balance = balance + NEW.outstanding_amount, updated_at = now() WHERE id = NEW.supplier_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.update_godown_stock_on_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NEW.godown_id IS NOT NULL THEN
    IF NEW.movement_type IN ('in', 'return', 'purchase') THEN
      INSERT INTO godown_stock (godown_id, product_id, quantity) VALUES (NEW.godown_id, NEW.product_id, NEW.quantity)
      ON CONFLICT (godown_id, product_id) DO UPDATE SET quantity = godown_stock.quantity + NEW.quantity, updated_at = now();
    ELSIF NEW.movement_type IN ('out', 'sale', 'adjustment') THEN
      INSERT INTO godown_stock (godown_id, product_id, quantity) VALUES (NEW.godown_id, NEW.product_id, -NEW.quantity)
      ON CONFLICT (godown_id, product_id) DO UPDATE SET quantity = GREATEST(0, godown_stock.quantity - NEW.quantity), updated_at = now();
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.create_ledger_on_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NEW.payment_type = 'receipt' THEN
    INSERT INTO ledger_entries (entry_date, entry_type, account_type, party_id, party_name, reference_type, reference_id, description, amount)
    VALUES (NEW.payment_date, 'debit', 'cash', NULL, 'Cash/Bank', NEW.reference_type, NEW.reference_id, 'Payment received from ' || NEW.party_name || ' - ' || NEW.payment_mode, NEW.amount);
    INSERT INTO ledger_entries (entry_date, entry_type, account_type, party_id, party_name, reference_type, reference_id, description, amount)
    VALUES (NEW.payment_date, 'credit', 'customer', NEW.customer_id, NEW.party_name, NEW.reference_type, NEW.reference_id, 'Payment received - ' || NEW.payment_mode, NEW.amount);
  ELSIF NEW.payment_type = 'payment' THEN
    INSERT INTO ledger_entries (entry_date, entry_type, account_type, party_id, party_name, reference_type, reference_id, description, amount)
    VALUES (NEW.payment_date, 'credit', 'cash', NULL, 'Cash/Bank', NEW.reference_type, NEW.reference_id, 'Payment made to ' || NEW.party_name || ' - ' || NEW.payment_mode, NEW.amount);
    INSERT INTO ledger_entries (entry_date, entry_type, account_type, party_id, party_name, reference_type, reference_id, description, amount)
    VALUES (NEW.payment_date, 'debit', 'supplier', NEW.supplier_id, NEW.party_name, NEW.reference_type, NEW.reference_id, 'Payment made - ' || NEW.payment_mode, NEW.amount);
  END IF;
  RETURN NEW;
END; $$;
