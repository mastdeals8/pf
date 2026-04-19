export interface Product {
  company_id?: string;
  company_name?: string; // joined when needed
  id: string;
  sku: string;
  name: string;
  category: 'Astro Products' | 'Vastu Items' | 'Healing Items';
  unit: string;
  purchase_price: number;
  selling_price: number;
  stock_quantity: number;
  low_stock_alert: number;
  description?: string;
  image_url?: string;
  direction?: string;
  is_gemstone?: boolean;
  weight_grams?: number;
  total_weight?: number;
  remaining_weight?: number;
  weight_unit?: 'grams' | 'carats';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductRecommendation {
  id: string;
  customer_id: string;
  product_id?: string;
  product_name: string;
  direction?: string;
  recommended_quantity: number;
  notes?: string;
  recommended_by?: string;
  recommended_date: string;
  status: 'pending' | 'ordered' | 'delivered';
  created_at: string;
}

export interface StockMovement {
  id: string;
  product_id: string;
  movement_type: 'purchase' | 'sale' | 'return' | 'adjustment' | 'in' | 'out';
  quantity: number;
  reference_type?: string;
  reference_id?: string;
  reference_number?: string;
  godown_id?: string;
  notes?: string;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_person?: string;
  phone?: string;
  alt_phone?: string;
  email?: string;
  address?: string;
  address2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
  opening_balance: number;
  balance: number;
  is_active: boolean;
  created_at: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id?: string;
  supplier_name: string;
  po_date: string;
  expected_date?: string;
  status: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled';
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes?: string;
  items?: PurchaseOrderItem[];
  created_at: string;
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  product_id?: string;
  product_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface PurchaseEntry {
  id: string;
  entry_number: string;
  purchase_order_id?: string;
  supplier_id?: string;
  supplier_name: string;
  entry_date: string;
  invoice_number?: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  status: 'unpaid' | 'partial' | 'paid' | 'cancelled';
  expected_delivery_date?: string;
  delivery_status: 'Pending' | 'In Transit' | 'Delivered' | 'Delayed';
  received_qty: number;
  notes?: string;
  items?: PurchaseEntryItem[];
  created_at: string;
}

export interface DropShipment {
  id: string;
  ds_number: string;
  supplier_id?: string;
  supplier_name: string;
  customer_id?: string;
  customer_name: string;
  customer_phone?: string;
  customer_address?: string;
  customer_city?: string;
  customer_state?: string;
  customer_pincode?: string;
  ds_date: string;
  expected_delivery_date?: string;
  status: 'draft' | 'confirmed' | 'supplier_dispatched' | 'delivered' | 'invoiced' | 'cancelled';
  supplier_invoice_number?: string;
  tracking_number?: string;
  courier_company?: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  notes?: string;
  company_id?: string;
  items?: DropShipmentItem[];
  created_at: string;
}

export interface DropShipmentItem {
  id: string;
  drop_shipment_id: string;
  product_id?: string;
  product_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface PurchaseEntryItem {
  id: string;
  purchase_entry_id: string;
  product_id?: string;
  product_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  alt_phone?: string;
  email?: string;
  address?: string;
  address2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
  category: 'B2B' | 'B2C';
  tags: string[];
  notes?: string;
  opening_balance: number;
  balance: number;
  total_revenue: number;
  last_interaction?: string;
  project_status?: string;
  conversion_stage?: 'Lead' | 'Interested' | 'Site Visit Done' | 'Proposal Given' | 'Converted' | 'Lost';
  project_value?: number;
  next_followup_date?: string;
  customer_score?: number;
  last_interaction_date?: string;
  is_active: boolean;
  created_at: string;
}

export interface VastuPlan {
  id: string;
  customer_id: string;
  direction: string;
  product_id?: string;
  product_name: string;
  quantity: number;
  notes?: string;
  status: 'pending' | 'ordered' | 'installed';
  created_at: string;
  updated_at: string;
}

export interface SalesOrder {
  id: string;
  so_number: string;
  customer_id?: string;
  customer_name: string;
  customer_phone?: string;
  customer_address?: string;
  customer_address2?: string;
  customer_city?: string;
  customer_state?: string;
  customer_pincode?: string;
  so_date: string;
  delivery_date?: string;
  status: 'draft' | 'confirmed' | 'dispatched' | 'delivered' | 'cancelled';
  subtotal: number;
  tax_amount: number;
  courier_charges: number;
  discount_amount: number;
  total_amount: number;
  notes?: string;
  is_b2b?: boolean;
  ship_to_customer_id?: string | null;
  ship_to_name?: string;
  ship_to_address1?: string;
  ship_to_address2?: string;
  ship_to_city?: string;
  ship_to_state?: string;
  ship_to_pin?: string;
  ship_to_phone?: string;
  items?: SalesOrderItem[];
  created_at: string;
}

export interface SalesOrderItem {  // godown_id added per DB migration
  id: string;
  sales_order_id: string;
  product_id?: string;
  product_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  total_price: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  sales_order_id?: string;
  delivery_challan_id?: string;
  customer_id?: string;
  customer_name: string;
  customer_phone?: string;
  customer_address?: string;
  customer_address2?: string;
  customer_city?: string;
  customer_state?: string;
  customer_pincode?: string;
  invoice_date: string;
  due_date?: string;
  status: 'draft' | 'issued' | 'sent' | 'partial' | 'paid' | 'overdue' | 'cancelled';
  subtotal: number;
  tax_amount: number;
  courier_charges: number;
  discount_amount: number;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  payment_terms?: string;
  notes?: string;
  bank_name?: string;
  account_number?: string;
  ifsc_code?: string;
  items?: InvoiceItem[];
  created_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  product_id?: string;
  product_name: string;
  description?: string;
  unit: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  tax_pct: number;
  total_price: number;
}

export interface DeliveryChallan {
  id: string;
  challan_number: string;
  invoice_id?: string;
  sales_order_id?: string;
  customer_id?: string;
  customer_name: string;
  customer_phone?: string;
  customer_address?: string;
  customer_address2?: string;
  customer_city?: string;
  customer_state?: string;
  customer_pincode?: string;
  is_b2b?: boolean;
  ship_to_name?: string;
  ship_to_phone?: string;
  ship_to_address1?: string;
  ship_to_address2?: string;
  ship_to_city?: string;
  ship_to_state?: string;
  ship_to_pin?: string;
  challan_date: string;
  dispatch_mode?: string;
  courier_company?: string;
  tracking_number?: string;
  status: 'draft' | 'created' | 'dispatched' | 'invoiced' | 'delivered' | 'cancelled';
  notes?: string;
  items?: DeliveryChallanItem[];
  created_at: string;
}

export interface DeliveryChallanItem {
  id: string;
  delivery_challan_id: string;
  product_id?: string;
  product_name: string;
  unit: string;
  quantity: number;
}

export interface Payment {
  id: string;
  payment_number: string;
  payment_type: 'receipt' | 'payment';
  reference_type: 'invoice' | 'purchase_entry' | 'advance';
  reference_id?: string;
  customer_id?: string;
  supplier_id?: string;
  party_name: string;
  payment_date: string;
  amount: number;
  payment_mode: 'Cash' | 'Bank Transfer' | 'UPI' | 'Cheque' | 'Card';
  reference_number?: string;
  notes?: string;
  created_at: string;
}

export interface CourierEntry {
  id: string;
  courier_date: string;
  invoice_id?: string;
  customer_id?: string;
  customer_name: string;
  courier_company: string;
  tracking_id?: string;
  weight_kg?: number;
  charges: number;
  sales_order_id?: string;
  status: 'booked' | 'in_transit' | 'delivered' | 'returned';
  notes?: string;
  created_at: string;
}

export interface CrmNote {
  id: string;
  customer_id: string;
  note_type: 'Note' | 'Call' | 'Meeting' | 'Vastu Visit' | 'Astro Reading' | 'Follow Up';
  title: string;
  content?: string;
  note_date: string;
  created_at: string;
}

export interface CrmFile {
  id: string;
  customer_id: string;
  file_name: string;
  file_url: string;
  file_type: 'Palm Image' | 'Floor Plan' | 'Report' | 'Document' | 'Photo';
  file_size_kb?: number;
  created_at: string;
}

export interface Appointment {
  id: string;
  title: string;
  customer_id?: string;
  customer_name?: string;
  appointment_type: 'Astro Reading' | 'Vastu Audit' | 'Consultation' | 'Follow Up' | 'Site Visit' | 'Video Call' | 'Phone Call';
  start_time: string;
  end_time: string;
  location?: string;
  city?: string;
  travel_plan_id?: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'rescheduled';
  notes?: string;
  created_at: string;
}

export interface TravelPlan {
  id: string;
  city: string;
  start_date: string;
  end_date: string;
  hotel_name?: string;
  notes?: string;
  appointments?: Appointment[];
  created_at: string;
}

export interface Expense {
  id: string;
  expense_number: string;
  expense_date: string;
  category: 'Rent' | 'Travel' | 'Marketing' | 'Courier' | 'Utilities' | 'Supplies' | 'Salary' | 'Miscellaneous';
  description: string;
  amount: number;
  payment_mode: string;
  reference_number?: string;
  notes?: string;
  receipt_image_url?: string;
  product_image_url?: string;
  payment_screenshot_url?: string;
  created_at: string;
  updated_at?: string;
}

export interface LedgerEntry {
  id: string;
  entry_date: string;
  entry_type: 'debit' | 'credit';
  account_type: 'customer' | 'supplier' | 'cash' | 'bank' | 'income' | 'expense';
  party_id?: string;
  party_name: string;
  reference_type?: string;
  reference_id?: string;
  description: string;
  amount: number;
  running_balance: number;
  created_at: string;
}

export interface JournalEntry {
  id: string;
  journal_number: string;
  journal_date: string;
  description: string;
  debit_account: string;
  credit_account: string;
  amount: number;
  notes?: string;
  created_at: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  trigger_event: string;
  action_type: string;
  action_config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

export interface UserProfile {
  id: string;
  role: 'admin' | 'staff' | 'accountant' | 'user';
  display_name: string;
  email: string;
  created_at: string;
}

export interface Godown {
  id: string;
  code?: string;
  name: string;
  location?: string;
  manager_name?: string;
  phone?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface GodownStockProductRef {
  id: string;
  name: string;
  sku: string;
  unit: string;
  category?: string;
  low_stock_alert: number;
  selling_price: number;
  purchase_price: number;
}

interface GodownStockGodownRef {
  id: string;
  name: string;
  code?: string;
  location?: string;
}

export interface GodownStock {
  id: string;
  godown_id: string;
  product_id: string;
  quantity: number;
  updated_at: string;
  godown?: GodownStockGodownRef;
  godowns?: GodownStockGodownRef;
  product?: GodownStockProductRef;
  products?: GodownStockProductRef;
}

export interface DispatchEntry {
  id: string;
  dispatch_number: string;
  sales_order_id?: string;
  invoice_id?: string;
  reference_type?: string;
  customer_id?: string;
  customer_name?: string;
  mode?: string;
  dispatch_mode?: string;
  transport_name?: string;
  lr_number?: string;
  dispatch_date: string;
  expected_delivery_date?: string;
  actual_delivery?: string;
  notes?: string;
  status: 'pending' | 'dispatched' | 'in_transit' | 'delivered' | 'returned';
  godown_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Dispatch {
  id: string;
  dispatch_number: string;
  sales_order_id?: string;
  invoice_id?: string;
  customer_id?: string;
  customer_name: string;
  dispatch_date: string;
  mode: 'Bus' | 'Tempo' | 'Courier' | 'Hand Delivery' | 'Train' | 'Air';
  transport_name?: string;
  tracking_number?: string;
  notes?: string;
  status: 'dispatched' | 'delivered' | 'returned';
  created_at: string;
  sales_order?: { so_number: string };
  invoice?: { invoice_number: string };
}

export interface CustomerRate {
  id: string;
  customer_id: string;
  product_id: string;
  rate: number;
  updated_at: string;
}

export interface CustomerLastRate {
  id?: string;
  customer_id: string;
  product_id: string;
  rate: number;
  last_rate?: number;
  last_used_at: string;
  reference_type?: string;
  reference_id?: string;
}

export interface CustomerRateCard {
  id: string;
  customer_id: string;
  product_id: string;
  rate: number;
  effective_from?: string;
  effective_to?: string;
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
  products?: { name: string; sku: string; selling_price: number };
}

// Alias for customer_product_last_rates table (used by rateCardService)
export interface CustomerProductLastRate {
  id: string;
  customer_id: string;
  product_id: string;
  last_rate: number;
  last_used_at: string;
  reference_type?: string;
  reference_id?: string;
}

export interface SalesReturn {
  id: string;
  return_number: string;
  invoice_id?: string;
  customer_id?: string;
  customer_name: string;
  return_date: string;
  reason?: string;
  status: 'pending' | 'approved' | 'processed' | 'cancelled';
  total_amount: number;
  credit_note_issued: boolean;
  notes?: string;
  items?: SalesReturnItem[];
  created_at: string;
}

export interface SalesReturnItem {
  id: string;
  sales_return_id: string;
  product_id?: string;
  product_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  return_to_stock: boolean;
}

export type ActivePage =
  | 'dashboard'
  | 'inventory'
  | 'godown-stock'
  | 'godown-transfer'
  | 'purchase'
  | 'sales'
  | 'sales-orders'
  | 'invoices'
  | 'challans'
  | 'sales-returns'
  | 'crm'
  | 'calendar'
  | 'finance'
  | 'ledger'
  | 'expenses'
  | 'journal'
  | 'reports'
  | 'courier'
  | 'automation'
  | 'settings'
  | 'drop-shipments';
