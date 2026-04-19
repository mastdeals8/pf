import { useState, useEffect, useRef } from 'react';
import { Plus, Search, CreditCard, FileText, Download, Printer, Pencil, Eye, CheckCircle, XCircle, X, ChevronDown, Truck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatDate, formatDateInput, generateId, nextDocNumber, exportToCSV } from '../../lib/utils';
import Modal from '../../components/ui/Modal';
import StatusBadge from '../../components/ui/StatusBadge';
import EmptyState from '../../components/ui/EmptyState';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import InvoicePrint from './InvoicePrint';
import { useDateRange } from '../../contexts/DateRangeContext';
import { getSmartRate } from '../../lib/rateCardService';
import { getCompanyById } from '../../lib/companiesService';
import type { Company } from '../../lib/companiesService';
import { fetchGodowns } from '../../services/godownService';
import { createInvoice, cancelInvoice } from '../../services/documentFlowService';
import type { Invoice, Product, Customer, SalesOrder, DeliveryChallan, Godown } from '../../types';
import type { ActivePage } from '../../types';
import type { PageState } from '../../App';

interface LineItem {
  id?: string; // delivery_challan_items.id when prefilled from DC — used to key item_tax
  product_id: string;
  product_name: string;
  description: string;
  unit: string;
  quantity: string;
  unit_price: string;
  discount_pct: string;
  tax_pct: string;
  total_price: number;
  godown_id?: string;
}

interface InvoicesProps {
  onNavigate?: (page: ActivePage, state?: PageState) => void;
  prefillFromDC?: DeliveryChallan;
}

export default function Invoices({ onNavigate: _onNavigate, prefillFromDC }: InvoicesProps) {
  const { dateRange } = useDateRange();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [cancelTarget, setCancelTarget] = useState<Invoice | null>(null);
  const [cancellingInvoiceId, setCancellingInvoiceId] = useState<string | null>(null);
  const [invDropdownOpen, setInvDropdownOpen] = useState<string | null>(null);
  const invDropdownRef = useRef<HTMLDivElement>(null);
  const [viewRelated, setViewRelated] = useState<{dispatches: {dispatch_number: string; status: string}[]; payments: {amount: number; payment_date: string; payment_mode: string}[]}>({ dispatches: [], payments: [] });
  const [showSOSelectModal, setShowSOSelectModal] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [viewItems, setViewItems] = useState<LineItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [godownStockMap, setGodownStockMap] = useState<Record<string, number>>({});
  const [availableDCs, setAvailableDCs] = useState<DeliveryChallan[]>([]);
  const [soSearch, setSoSearch] = useState('');
  const [selectedSO, setSelectedSO] = useState<SalesOrder | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const [printCompany, setPrintCompany] = useState<Company | undefined>(undefined);
  const [printMode, setPrintMode] = useState<'normal' | 'b2b'>('normal');
  const [shipToCustomer, setShipToCustomer] = useState<Customer | undefined>(undefined);
  const [b2bShipTo, setB2bShipTo] = useState<{ name: string; phone?: string; address?: string } | undefined>(undefined);
  const [b2bPriceMap, setB2bPriceMap] = useState<Record<string, number>>({});

  const [form, setForm] = useState({
    customer_id: '', customer_name: '', customer_phone: '',
    customer_address: '', customer_address2: '',
    customer_city: '', customer_state: '', customer_pincode: '',
    invoice_date: new Date().toISOString().split('T')[0], due_date: '',
    courier_charges: '0', discount_amount: '0',
    payment_terms: 'Due on receipt', notes: '',
    bank_name: '', account_number: '', ifsc_code: '',
    sales_order_id: '',
    godown_id: '',
    delivery_challan_id: '',
  });
  const [items, setItems] = useState<LineItem[]>([{
    product_id: '', product_name: '', description: '', unit: 'pcs',
    quantity: '1', unit_price: '', discount_pct: '0', tax_pct: '0', total_price: 0,
  }]);
  const [editForm, setEditForm] = useState({
    invoice_date: '', due_date: '', courier_charges: '0', discount_amount: '0',
    payment_terms: '', notes: '', bank_name: '', account_number: '', ifsc_code: '',
  });
  const [editItems, setEditItems] = useState<LineItem[]>([]);
  const [payForm, setPayForm] = useState({ amount: '', payment_mode: 'Cash', reference_number: '', payment_date: new Date().toISOString().split('T')[0] });

  useEffect(() => { loadData(); }, [dateRange]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (invDropdownRef.current && !invDropdownRef.current.contains(e.target as Node)) {
        setInvDropdownOpen(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (!prefillFromDC) return;
    const loadAndPrefill = async () => {
      let soItems: SalesOrder['items'] = [];
      let so: SalesOrder | null = null;
      if (prefillFromDC.sales_order_id) {
        const { data: soData } = await supabase
          .from('sales_orders')
          .select('*, items:sales_order_items(*)')
          .eq('id', prefillFromDC.sales_order_id)
          .maybeSingle();
        so = soData;
        if (soData?.items && soData.items.length > 0) {
          soItems = soData.items;
        } else {
          const { data: itemsData } = await supabase
            .from('sales_order_items')
            .select('*')
            .eq('sales_order_id', prefillFromDC.sales_order_id);
          soItems = itemsData || [];
        }
      } else {
        const { data: challanItems } = await supabase
          .from('delivery_challan_items')
          .select('*')
          .eq('delivery_challan_id', prefillFromDC.id);
        soItems = (challanItems || []).map(i => ({
          id: i.id,
          sales_order_id: '',
          product_id: i.product_id,
          product_name: i.product_name,
          unit: i.unit,
          quantity: i.quantity,
          unit_price: i.unit_price || 0,
          discount_pct: i.discount_pct || 0,
          total_price: i.total_price || 0,
        }));
      }

      setForm({
        customer_id: prefillFromDC.customer_id || '',
        customer_name: prefillFromDC.customer_name,
        customer_phone: prefillFromDC.customer_phone || '',
        customer_address: prefillFromDC.customer_address || '',
        customer_address2: prefillFromDC.customer_address2 || '',
        customer_city: prefillFromDC.customer_city || '',
        customer_state: prefillFromDC.customer_state || '',
        customer_pincode: prefillFromDC.customer_pincode || '',
        invoice_date: new Date().toISOString().split('T')[0],
        due_date: '',
        courier_charges: String(so?.courier_charges || 0),
        discount_amount: String(so?.discount_amount || 0),
        payment_terms: 'Due on receipt',
        notes: prefillFromDC.notes || '',
        bank_name: '', account_number: '', ifsc_code: '',
        sales_order_id: prefillFromDC.sales_order_id || '',
        godown_id: godowns[0]?.id || '',
        delivery_challan_id: prefillFromDC.id || '',
      });

      if (so) setSelectedSO(so);

      setItems(soItems.map(item => ({
        id: (item as { id?: string }).id,
        product_id: item.product_id || '',
        product_name: item.product_name,
        description: '',
        unit: item.unit,
        quantity: String(item.quantity),
        unit_price: String(item.unit_price || 0),
        discount_pct: String(item.discount_pct || 0),
        tax_pct: '0',
        total_price: item.total_price || 0,
      })));

      setShowModal(true);
    };
    loadAndPrefill();
  }, [prefillFromDC, godowns]);

  const [soMap, setSoMap] = useState<Record<string, string>>({});
  const [dcMap, setDcMap] = useState<Record<string, string>>({});
  const [dcIsB2bMap, setDcIsB2bMap] = useState<Record<string, boolean>>({});

  const loadData = async () => {
    const [invRes, productsRes, customersRes, godownsData, soRes, dcRes] = await Promise.all([
      supabase.from('invoices')
        .select('id, invoice_number, invoice_date, due_date, customer_id, customer_name, customer_phone, customer_address, customer_address2, customer_city, customer_state, customer_pincode, subtotal, tax_amount, total_amount, paid_amount, outstanding_amount, courier_charges, discount_amount, status, payment_terms, notes, bank_name, account_number, ifsc_code, sales_order_id, delivery_challan_id, created_at')
        .gte('invoice_date', dateRange.from)
        .lte('invoice_date', dateRange.to)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('products').select('id, name, unit, selling_price').eq('is_active', true),
      supabase.from('customers').select('id, name, phone, alt_phone, address, address2, city, state, pincode').eq('is_active', true).order('name'),
      fetchGodowns(),
      supabase.from('sales_orders').select('id, so_number').order('created_at', { ascending: false }).limit(500),
      supabase.from('delivery_challans').select('id, challan_number, is_b2b').order('created_at', { ascending: false }).limit(500),
    ]);
    const invoiceList = invRes.data || [];
    setInvoices(invoiceList);
    setProducts(productsRes.data || []);
    setCustomers(customersRes.data || []);
    setGodowns(godownsData);
    if (godownsData.length > 0) {
      setForm(f => ({ ...f, godown_id: f.godown_id || godownsData[0].id }));
    }
    const sm: Record<string, string> = {};
    (soRes.data || []).forEach((s: { id: string; so_number: string }) => { sm[s.id] = s.so_number; });
    setSoMap(sm);
    const dm: Record<string, string> = {};
    const b2b: Record<string, boolean> = {};
    (dcRes.data || []).forEach((d: { id: string; challan_number: string; is_b2b?: boolean }) => {
      dm[d.id] = d.challan_number;
      if (d.is_b2b) b2b[d.id] = true;
    });
    setDcMap(dm);
    setDcIsB2bMap(b2b);
  };

  const loadGodownStock = async (godownId: string, productIds: string[]) => {
    if (!godownId || productIds.length === 0) return;
    const uniqueIds = [...new Set(productIds.filter(Boolean))];
    const { data } = await supabase
      .from('godown_stock')
      .select('product_id, quantity')
      .eq('godown_id', godownId)
      .in('product_id', uniqueIds);
    const map: Record<string, number> = {};
    (data || []).forEach(r => { map[r.product_id] = r.quantity || 0; });
    setGodownStockMap(map);
  };

  const loadAvailableDCs = async () => {
    const { data: invoicedDCRes } = await supabase
      .from('invoices').select('delivery_challan_id')
      .not('delivery_challan_id', 'is', null).neq('status', 'cancelled');

    const usedDCIds = (invoicedDCRes || [])
      .map((r: { delivery_challan_id: string }) => r.delivery_challan_id).filter(Boolean);

    let dcQuery = supabase
      .from('delivery_challans')
      .select('*')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });

    if (usedDCIds.length > 0) {
      dcQuery = dcQuery.not('id', 'in', `(${usedDCIds.join(',')})`);
    }

    const { data: dcRes } = await dcQuery;
    setAvailableDCs((dcRes || []) as DeliveryChallan[]);
  };

  const openSOSelectModal = async () => {
    await loadAvailableDCs();
    setSoSearch('');
    setSelectedSO(null);
    setShowSOSelectModal(true);
  };

  const handleDCSelect = async (dc: DeliveryChallan) => {
    const { data: dcItems } = await supabase.from('delivery_challan_items').select('*').eq('delivery_challan_id', dc.id);
    const soCustomer = customers.find(c => c.id === dc.customer_id);
    let soData: SalesOrder | null = null;
    if (dc.sales_order_id) {
      const { data } = await supabase.from('sales_orders').select('*').eq('id', dc.sales_order_id).maybeSingle();
      soData = data;
    }
    setForm({
      customer_id: dc.customer_id || '',
      customer_name: dc.customer_name,
      customer_phone: dc.customer_phone || soCustomer?.phone || '',
      customer_address: dc.customer_address || soCustomer?.address || '',
      customer_address2: dc.customer_address2 || soCustomer?.address2 || '',
      customer_city: dc.customer_city || soCustomer?.city || '',
      customer_state: dc.customer_state || soCustomer?.state || '',
      customer_pincode: dc.customer_pincode || soCustomer?.pincode || '',
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: '',
      courier_charges: String(soData?.courier_charges || 0),
      discount_amount: String(soData?.discount_amount || 0),
      payment_terms: 'Due on receipt',
      notes: dc.notes || '',
      bank_name: '', account_number: '', ifsc_code: '',
      sales_order_id: dc.sales_order_id || '',
      godown_id: godowns[0]?.id || '',
      delivery_challan_id: dc.id,
    });
    setItems(
      (dcItems || []).map(i => ({
        id: i.id,
        product_id: i.product_id || '',
        product_name: i.product_name,
        description: '',
        unit: i.unit,
        quantity: String(i.quantity),
        unit_price: String(i.unit_price || 0),
        discount_pct: String(i.discount_pct || 0),
        tax_pct: '0',
        total_price: i.total_price || 0,
      }))
    );
    setShowSOSelectModal(false);
    setShowModal(true);
  };

  const addItem = () => setItems(prev => [...prev, { product_id: '', product_name: '', description: '', unit: 'pcs', quantity: '1', unit_price: '', discount_pct: '0', tax_pct: '0', total_price: 0 }]);
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));

  const updateItem = async (i: number, field: string, value: string) => {
    setItems(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === 'product_id') {
        const p = products.find(p => p.id === value);
        if (p) { next[i].product_name = p.name; next[i].unit = p.unit; next[i].unit_price = String(p.selling_price); }
      }
      const qty = parseFloat(next[i].quantity) || 0;
      const price = parseFloat(next[i].unit_price) || 0;
      const disc = parseFloat(next[i].discount_pct) || 0;
      const tax = parseFloat(next[i].tax_pct) || 0;
      const afterDisc = qty * price * (1 - disc / 100);
      next[i].total_price = afterDisc * (1 + tax / 100);
      return next;
    });

    // Auto-select best godown per item
    if (field === 'product_id' && value) {
      const { data: stockRows } = await supabase
        .from('godown_stock').select('godown_id, quantity')
        .eq('product_id', value).gt('quantity', 0)
        .order('quantity', { ascending: false }).limit(1);
      const bestGodown = stockRows?.[0]?.godown_id || godowns[0]?.id || '';
      setItems(prev => { const next=[...prev]; next[i]={...next[i], godown_id: bestGodown}; return next; });
      if (bestGodown) loadGodownStock(bestGodown, [value]);
    }

    if (field === 'product_id' && value && form.customer_id) {
      const product = products.find(p => p.id === value);
      if (product) {
        const smartRate = await getSmartRate(form.customer_id, value, product.selling_price);
        if (smartRate !== product.selling_price) {
          setItems(prev => {
            const next = [...prev];
            next[i] = { ...next[i], unit_price: String(smartRate) };
            const qty = parseFloat(next[i].quantity) || 0;
            const disc = parseFloat(next[i].discount_pct) || 0;
            const tax = parseFloat(next[i].tax_pct) || 0;
            const afterDisc = qty * smartRate * (1 - disc / 100);
            next[i].total_price = afterDisc * (1 + tax / 100);
            return next;
          });
        }
      }
    }
  };

  const addEditItem = () => setEditItems(prev => [...prev, { product_id: '', product_name: '', description: '', unit: 'pcs', quantity: '1', unit_price: '', discount_pct: '0', tax_pct: '0', total_price: 0 }]); // godown handled per item
  const removeEditItem = (i: number) => setEditItems(prev => prev.filter((_, idx) => idx !== i));

  const updateEditItem = (i: number, field: string, value: string) => {
    setEditItems(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === 'product_id') {
        const p = products.find(p => p.id === value);
        if (p) { next[i].product_name = p.name; next[i].unit = p.unit; next[i].unit_price = String(p.selling_price); }
      }
      const qty = parseFloat(next[i].quantity) || 0;
      const price = parseFloat(next[i].unit_price) || 0;
      const disc = parseFloat(next[i].discount_pct) || 0;
      const tax = parseFloat(next[i].tax_pct) || 0;
      const afterDisc = qty * price * (1 - disc / 100);
      next[i].total_price = afterDisc * (1 + tax / 100);
      return next;
    });
  };

  const subtotal = items.reduce((s, i) => s + i.total_price, 0);
  const taxAmount = items.reduce((s, i) => {
    const base = (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0) * (1 - (parseFloat(i.discount_pct) || 0) / 100);
    return s + base * ((parseFloat(i.tax_pct) || 0) / 100);
  }, 0);
  const total = subtotal + (parseFloat(form.courier_charges) || 0) - (parseFloat(form.discount_amount) || 0);

  const editSubtotal = editItems.reduce((s, i) => s + i.total_price, 0);
  const editTaxAmount = editItems.reduce((s, i) => {
    const base = (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0) * (1 - (parseFloat(i.discount_pct) || 0) / 100);
    return s + base * ((parseFloat(i.tax_pct) || 0) / 100);
  }, 0);
  const editTotal = editSubtotal + (parseFloat(editForm.courier_charges) || 0) - (parseFloat(editForm.discount_amount) || 0);

  const handleSave = async () => {
    if (!form.delivery_challan_id) {
      alert('An invoice must be created from a Delivery Challan. Please pick a DC.');
      return;
    }

    // Build item_tax map keyed by DC item id. `items[i].id` was populated
    // when the DC items were loaded in the prefill/select flow.
    const itemTax: Record<string, number> = {};
    for (const it of items as (LineItem & { id?: string })[]) {
      if (it.id) {
        const t = parseFloat(it.tax_pct) || 0;
        if (t > 0) itemTax[it.id] = t;
      }
    }

    try {
      const invoiceNumber = await nextDocNumber('INV', supabase);
      await createInvoice(form.delivery_challan_id, {
        invoice_number: invoiceNumber,
        invoice_date: form.invoice_date,
        due_date: form.due_date || null,
        payment_terms: form.payment_terms,
        notes: form.notes,
        bank_name: form.bank_name,
        account_number: form.account_number,
        ifsc_code: form.ifsc_code,
        courier_charges: parseFloat(form.courier_charges) || 0,
        discount_amount: parseFloat(form.discount_amount) || 0,
        item_tax: itemTax,
      });
      setShowModal(false);
      loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create invoice.';
      alert(`Invoice creation failed: ${msg}`);
    }
  };

  const openView = async (inv: Invoice) => {
    setPrintCompany(undefined);
    const [itemsRes, dispatchRes, paymentsRes] = await Promise.all([
      supabase.from('invoice_items').select('*').eq('invoice_id', inv.id),
      supabase.from('dispatch_entries').select('dispatch_number, status').eq('invoice_id', inv.id),
      supabase.from('invoice_payments').select('amount, payment_date, payment_mode').eq('invoice_id', inv.id).order('payment_date'),
    ]);
    setViewItems((itemsRes.data || []).map(i => ({
      product_id: i.product_id || '',
      product_name: i.product_name,
      description: i.description || '',
      unit: i.unit,
      quantity: String(i.quantity),
      unit_price: String(i.unit_price),
      discount_pct: String(i.discount_pct),
      tax_pct: String(i.tax_pct),
      total_price: i.total_price,
    })));
    setViewRelated({
      dispatches: dispatchRes.data || [],
      payments: paymentsRes.data || [],
    });
    setSelectedInvoice(inv);
    setShowViewModal(true);
  };

  const openEdit = async (inv: Invoice) => {
    const { data: itemsData } = await supabase.from('invoice_items').select('*').eq('invoice_id', inv.id);
    setEditForm({
      invoice_date: formatDateInput(inv.invoice_date),
      due_date: inv.due_date ? formatDateInput(inv.due_date) : '',
      courier_charges: String(inv.courier_charges || 0),
      discount_amount: String(inv.discount_amount || 0),
      payment_terms: inv.payment_terms || '',
      notes: inv.notes || '',
      bank_name: inv.bank_name || '',
      account_number: inv.account_number || '',
      ifsc_code: inv.ifsc_code || '',
    });
    setEditItems((itemsData || []).map(i => ({
      product_id: i.product_id || '',
      product_name: i.product_name,
      description: i.description || '',
      unit: i.unit,
      quantity: String(i.quantity),
      unit_price: String(i.unit_price),
      discount_pct: String(i.discount_pct),
      tax_pct: String(i.tax_pct),
      total_price: i.total_price,
    })));
    setSelectedInvoice(inv);
    setShowEditModal(true);
  };

  const handleEditSave = async () => {
    if (!selectedInvoice) return;

    // Invoices no longer own stock — the Delivery Challan does.
    // Editing an invoice only updates header fields and item pricing/tax.
    // Quantity/godown changes here do NOT move stock.
    await supabase.from('invoices').update({
      invoice_date: editForm.invoice_date,
      due_date: editForm.due_date || null,
      courier_charges: parseFloat(editForm.courier_charges) || 0,
      discount_amount: parseFloat(editForm.discount_amount) || 0,
      subtotal: editSubtotal,
      tax_amount: editTaxAmount,
      total_amount: editTotal,
      outstanding_amount: Math.max(0, editTotal - selectedInvoice.paid_amount),
      payment_terms: editForm.payment_terms,
      notes: editForm.notes,
      bank_name: editForm.bank_name,
      account_number: editForm.account_number,
      ifsc_code: editForm.ifsc_code,
    }).eq('id', selectedInvoice.id);

    await supabase.from('invoice_items').delete().eq('invoice_id', selectedInvoice.id);
    await supabase.from('invoice_items').insert(
      editItems.filter(i => i.product_name).map(i => ({
        invoice_id: selectedInvoice.id,
        product_id: i.product_id || null,
        product_name: i.product_name,
        description: i.description,
        unit: i.unit,
        quantity: parseFloat(i.quantity) || 0,
        unit_price: parseFloat(i.unit_price) || 0,
        discount_pct: parseFloat(i.discount_pct) || 0,
        tax_pct: parseFloat(i.tax_pct) || 0,
        total_price: i.total_price,
      }))
    );

    setShowEditModal(false);
    loadData();
  };

  const openDelete = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setShowDeleteConfirm(true);
  };

  const handleDelete = async () => {
    if (!selectedInvoice) return;
    try {
      // Soft-cancel via RPC: writes reversing ledger entry and re-opens the
      // parent DC. Stock is NOT touched (DC owns stock).
      await cancelInvoice(selectedInvoice.id);
      loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to cancel invoice';
      alert(msg);
    }
  };

  const openPrint = async (inv: Invoice, mode: 'normal' | 'b2b' = 'normal') => {
    const { data: itemsData } = await supabase.from('invoice_items').select('*').eq('invoice_id', inv.id);
    setSelectedInvoice({ ...inv, items: itemsData || [] });
    setPrintMode(mode);
    setShipToCustomer(undefined);

    const invWithCompany = inv as Invoice & { company_id?: string };
    if (invWithCompany.company_id) {
      const co = await getCompanyById(invWithCompany.company_id);
      setPrintCompany(co || undefined);
    } else {
      setPrintCompany(undefined);
    }

    setB2bShipTo(undefined);
    setB2bPriceMap({});

    if (mode === 'b2b') {
      let soId = inv.sales_order_id;

      if (inv.delivery_challan_id) {
        // Prefer DC's ship_to fields (copied from SO at DC creation time)
        const { data: dc } = await supabase
          .from('delivery_challans')
          .select('ship_to_name, ship_to_phone, ship_to_address1, ship_to_address2, ship_to_city, ship_to_state, ship_to_pin, ship_to_customer_id, sales_order_id')
          .eq('id', inv.delivery_challan_id)
          .maybeSingle();

        if (dc?.ship_to_name) {
          const addrParts = [dc.ship_to_address1, dc.ship_to_address2, dc.ship_to_city, dc.ship_to_state, dc.ship_to_pin].filter(Boolean);
          setB2bShipTo({ name: dc.ship_to_name, phone: dc.ship_to_phone || '', address: addrParts.join(', ') });
        } else if (dc?.ship_to_customer_id) {
          const { data: shipCust } = await supabase
            .from('customers')
            .select('id, name, phone, address, address2, city, state, pincode')
            .eq('id', dc.ship_to_customer_id)
            .maybeSingle();
          setShipToCustomer(shipCust || undefined);
        }

        if (dc?.sales_order_id) soId = dc.sales_order_id;
      } else if (inv.sales_order_id) {
        // Legacy path: no DC link, read ship_to from SO directly
        const { data: so } = await supabase
          .from('sales_orders')
          .select('ship_to_name, ship_to_phone, ship_to_address1, ship_to_address2, ship_to_city, ship_to_state, ship_to_pin, ship_to_customer_id')
          .eq('id', inv.sales_order_id)
          .maybeSingle();

        if (so?.ship_to_name) {
          const addrParts = [so.ship_to_address1, so.ship_to_address2, so.ship_to_city, so.ship_to_state, so.ship_to_pin].filter(Boolean);
          setB2bShipTo({ name: so.ship_to_name, phone: so.ship_to_phone || '', address: addrParts.join(', ') });
        } else if (so?.ship_to_customer_id) {
          const { data: shipCust } = await supabase
            .from('customers')
            .select('id, name, phone, address, address2, city, state, pincode')
            .eq('id', so.ship_to_customer_id)
            .maybeSingle();
          setShipToCustomer(shipCust || undefined);
        }
      }

      if (soId) {
        const { data: soItems } = await supabase
          .from('sales_order_items')
          .select('product_id, b2b_price')
          .eq('sales_order_id', soId);
        if (soItems) {
          const map: Record<string, number> = {};
          soItems.forEach(si => { if (si.product_id && si.b2b_price != null) map[si.product_id] = si.b2b_price; });
          setB2bPriceMap(map);
        }
      }
    }

    setShowPrint(true);
  };

  const handlePrint = () => {
    window.print();
  };

  const openPayment = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setPayForm({ amount: String(inv.outstanding_amount), payment_mode: 'Cash', reference_number: '', payment_date: new Date().toISOString().split('T')[0] });
    setShowPayModal(true);
  };

  const handlePayment = async () => {
    if (!selectedInvoice) return;
    const amount = parseFloat(payForm.amount) || 0;
    const newPaid = selectedInvoice.paid_amount + amount;
    const newOutstanding = Math.max(0, selectedInvoice.total_amount - newPaid);
    const newStatus = newOutstanding <= 0 ? 'paid' : 'partial';

    await supabase.from('invoices').update({
      paid_amount: newPaid, outstanding_amount: newOutstanding, status: newStatus,
    }).eq('id', selectedInvoice.id);

    const { data: payment } = await supabase.from('payments').insert({
      payment_number: generateId('PAY'),
      payment_type: 'receipt',
      reference_type: 'invoice',
      reference_id: selectedInvoice.id,
      customer_id: selectedInvoice.customer_id || null,
      party_name: selectedInvoice.customer_name,
      payment_date: payForm.payment_date,
      amount,
      payment_mode: payForm.payment_mode,
      reference_number: payForm.reference_number,
    }).select().single();

    if (payment) {
      await supabase.from('ledger_entries').insert({
        entry_date: payForm.payment_date,
        entry_type: 'credit',
        account_type: 'customer',
        party_id: selectedInvoice.customer_id || null,
        party_name: selectedInvoice.customer_name,
        reference_type: 'payment',
        reference_id: payment.id,
        description: 'Payment against ' + selectedInvoice.invoice_number,
        amount,
      });
    }

    if (selectedInvoice.customer_id) {
      const { data: cust } = await supabase.from('customers').select('balance').eq('id', selectedInvoice.customer_id).maybeSingle();
      if (cust) {
        await supabase.from('customers').update({
          balance: Math.max(0, (cust.balance || 0) - amount),
        }).eq('id', selectedInvoice.customer_id);
      }
    }

    setShowPayModal(false);
    loadData();
  };

  const handleExportCSV = () => {
    const statusLabel = (s: string) => {
      if (s === 'sent') return 'Pending';
      return s.charAt(0).toUpperCase() + s.slice(1);
    };
    exportToCSV(
      filtered.map(inv => ({
        'Invoice No': inv.invoice_number,
        'Customer Name': inv.customer_name,
        'Customer Phone': inv.customer_phone || '',
        'Invoice Date': inv.invoice_date,
        'Due Date': inv.due_date || '',
        'Status': statusLabel(inv.status),
        'Subtotal (₹)': inv.subtotal,
        'Tax (₹)': inv.tax_amount,
        'Courier (₹)': inv.courier_charges || 0,
        'Discount (₹)': inv.discount_amount || 0,
        'Total (₹)': inv.total_amount,
        'Paid (₹)': inv.paid_amount,
        'Outstanding (₹)': inv.outstanding_amount,
        'Payment Terms': inv.payment_terms || '',
        'Notes': inv.notes || '',
      })),
      'invoices'
    );
  };

  const filtered = invoices.filter(i => {
    const matchSearch = i.customer_name.toLowerCase().includes(search.toLowerCase()) || i.invoice_number.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'All'
      ? i.status !== 'cancelled'
      : statusFilter === 'Pending'
        ? i.status === 'issued' || i.status === 'sent'
        : i.status === statusFilter.toLowerCase();
    const matchDate = i.invoice_date >= dateRange.from && i.invoice_date <= dateRange.to;
    const matchCustomer = !filterCustomer || i.customer_name === filterCustomer;
    const matchFrom = !filterFrom || i.invoice_date >= filterFrom;
    const matchTo = !filterTo || i.invoice_date <= filterTo;
    return matchSearch && matchStatus && matchDate && matchCustomer && matchFrom && matchTo;
  });

  const uniqueCustomers = [...new Set(invoices.map(i => i.customer_name))].sort();
  const hasActiveFilters = filterCustomer || filterFrom || filterTo;

  const totalOutstanding = invoices.filter(i => i.status !== 'cancelled').reduce((s, i) => s + (i.outstanding_amount || 0), 0);
  const paidThisMonth = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total_amount, 0);

  const STATUSES = ['All', 'Draft', 'Pending', 'Overdue', 'Partial', 'Paid'];

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="bg-white border-b border-neutral-100 px-6 py-4 flex items-center justify-between no-print">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Invoices</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Create and manage customer invoices</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoices..." className="input pl-8 w-52 text-xs" />
          </div>
          <button onClick={handleExportCSV} className="btn-secondary">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={openSOSelectModal} className="btn-primary">
            <Plus className="w-4 h-4" /> New Invoice
          </button>
        </div>
      </div>

      <div className="px-6 pt-4 no-print">
        <div className="bg-white border border-neutral-100 rounded-xl px-4 py-3 mb-4">
          <p className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Sales Flow</p>
          <div className="flex items-center gap-2 flex-wrap">
            {([
              { label: 'Sales Order', color: 'bg-neutral-50 text-neutral-500 border-neutral-200' },
              { label: 'Delivery Note', color: 'bg-neutral-50 text-neutral-500 border-neutral-200' },
              { label: 'Invoice', color: 'bg-green-600 text-white border-green-600' },
              { label: 'Dispatch (optional)', color: 'bg-neutral-50 text-neutral-400 border-neutral-200' },
            ] as { label: string; color: string }[]).map((step, i, arr) => (
              <span key={i} className="flex items-center gap-2">
                <span className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium ${step.color}`}>
                  {step.label}
                </span>
                {i < arr.length - 1 && <span className="text-neutral-300 text-xs">→</span>}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="px-6 pb-6 space-y-4 no-print">
        <div className="grid grid-cols-4 gap-4">
          <div className="card">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Total Invoices</p>
            <p className="text-2xl font-bold text-neutral-900 mt-1">{invoices.filter(i => i.status !== 'cancelled').length}</p>
            <p className="text-[10px] text-neutral-400 mt-1">{invoices.filter(i => i.status === 'paid').length} paid · {invoices.filter(i => i.status === 'partial').length} partial</p>
          </div>
          <div className="card border-l-4 border-l-error-400">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Pending Amount</p>
            <p className="text-2xl font-bold text-error-600 mt-1">{formatCurrency(totalOutstanding)}</p>
            <p className="text-[10px] text-neutral-400 mt-1">{invoices.filter(i => ['sent','partial','overdue'].includes(i.status)).length} unpaid invoices</p>
          </div>
          <div className="card border-l-4 border-l-success-400">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Total Collected</p>
            <p className="text-2xl font-bold text-success-600 mt-1">{formatCurrency(paidThisMonth)}</p>
            <p className="text-[10px] text-neutral-400 mt-1">All time paid invoices</p>
          </div>
          <div className="card border-l-4 border-l-warning-400">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Overdue</p>
            <p className="text-2xl font-bold text-warning-600 mt-1">{invoices.filter(i => i.status === 'overdue').length}</p>
            <p className="text-[10px] text-neutral-400 mt-1">Require immediate follow-up</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {STATUSES.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${statusFilter === s ? 'bg-primary-600 text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>
              {s}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap bg-white border border-neutral-100 rounded-xl px-3 py-2">
          <select value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)} className="input text-xs w-44 py-1">
            <option value="">All Customers</option>
            {uniqueCustomers.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex items-center gap-1 text-xs text-neutral-400">
            <span>From</span>
            <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="input text-xs py-1 w-32" />
            <span>To</span>
            <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="input text-xs py-1 w-32" />
          </div>
          {hasActiveFilters && (
            <button onClick={() => { setFilterCustomer(''); setFilterFrom(''); setFilterTo(''); }} className="flex items-center gap-1 text-xs text-neutral-400 hover:text-error-600 transition-colors">
              <X className="w-3 h-3" /> Clear
            </button>
          )}
          <span className="text-[10px] text-neutral-400 ml-auto">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-neutral-50 border-b border-neutral-100">
              <tr>
                <th className="table-header text-left">Invoice #</th>
                <th className="table-header text-left">Customer</th>
                <th className="table-header text-left">SO / DC</th>
                <th className="table-header text-left">Date</th>
                <th className="table-header text-right">Amount</th>
                <th className="table-header text-right">Outstanding</th>
                <th className="table-header text-left">Status</th>
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => {
                const isPaid = inv.status === 'paid' || inv.outstanding_amount <= 0;
                const isOverdue = inv.status === 'overdue';
                const isCancelled = inv.status === 'cancelled';
                return (
                  <tr key={inv.id} className={`border-b border-neutral-50 hover:bg-neutral-50 transition-colors ${isCancelled ? 'opacity-50 bg-neutral-50' : isOverdue ? 'bg-error-50/30' : ''}`}>
                    <td className="table-cell font-medium text-primary-700">{inv.invoice_number}</td>
                    <td className="table-cell">
                      <p className="font-medium">{inv.customer_name}</p>
                      <p className="text-xs text-neutral-400">{inv.customer_phone}</p>
                    </td>
                    <td className="table-cell">
                      <div className="flex flex-col gap-0.5">
                        {inv.sales_order_id && soMap[inv.sales_order_id] && (
                          <span className="text-[10px] font-medium bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded w-fit">SO: {soMap[inv.sales_order_id]}</span>
                        )}
                        {(inv as Record<string, unknown>).delivery_challan_id && dcMap[(inv as Record<string, unknown>).delivery_challan_id as string] && (() => {
                          const dcNum = dcMap[(inv as Record<string, unknown>).delivery_challan_id as string];
                          const isLegacy = dcNum.startsWith('LEGACY-DC-');
                          return (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded w-fit ${isLegacy ? 'bg-neutral-100 text-neutral-500' : 'bg-orange-50 text-orange-700'}`}>
                              {isLegacy ? 'Legacy' : `DC: ${dcNum}`}
                            </span>
                          );
                        })()}
                        {!inv.sales_order_id && !(inv as Record<string, unknown>).delivery_challan_id && (
                          <span className="text-neutral-300 text-xs">—</span>
                        )}
                      </div>
                    </td>
                    <td className="table-cell text-neutral-500">{formatDate(inv.invoice_date)}</td>
                    <td className="table-cell text-right">
                      <p className="font-semibold text-neutral-900">{formatCurrency(inv.total_amount)}</p>
                      {inv.paid_amount > 0 && !isPaid && (
                        <p className="text-[10px] text-success-600 mt-0.5">Paid: {formatCurrency(inv.paid_amount)}</p>
                      )}
                    </td>
                    <td className="table-cell text-right">
                      {isPaid ? (
                        <span className="inline-flex items-center gap-1 text-success-600 font-medium text-xs">
                          <CheckCircle className="w-3 h-3" /> Fully Paid
                        </span>
                      ) : (
                        <span className={`font-semibold text-sm ${isOverdue ? 'text-error-700' : 'text-error-600'}`}>
                          {formatCurrency(inv.outstanding_amount)}
                        </span>
                      )}
                    </td>
                    <td className="table-cell"><StatusBadge status={inv.status} /></td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-1" ref={invDropdownRef}>
                        {!isPaid && inv.status !== 'cancelled' && (
                          <button onClick={() => openPayment(inv)} title="Record Payment"
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors text-[10px] font-medium">
                            <CreditCard className="w-3 h-3" /> Pay
                          </button>
                        )}
                        <button onClick={() => openView(inv)} title="View"
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition-colors text-[10px] font-medium">
                          <Eye className="w-3 h-3" /> View
                        </button>
                        <div className="relative">
                          <button
                            onClick={() => setInvDropdownOpen(invDropdownOpen === inv.id ? null : inv.id)}
                            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-neutral-100 text-neutral-500 transition-colors"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                          {invDropdownOpen === inv.id && (
                            <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-neutral-200 rounded-lg shadow-lg z-10 overflow-hidden">
                              <button
                                onClick={() => { setInvDropdownOpen(null); openPrint(inv, 'normal'); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-50 transition-colors"
                              >
                                <Printer className="w-3.5 h-3.5" /> Print Invoice
                              </button>
                              {inv.delivery_challan_id && dcIsB2bMap[inv.delivery_challan_id] && (
                                <button
                                  onClick={() => { setInvDropdownOpen(null); openPrint(inv, 'b2b'); }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-blue-700 hover:bg-blue-50 transition-colors"
                                >
                                  <Printer className="w-3.5 h-3.5" /> Print B2B Invoice
                                </button>
                              )}
                              {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                                <button
                                  onClick={() => { setInvDropdownOpen(null); openEdit(inv); }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-50 transition-colors"
                                >
                                  <Pencil className="w-3.5 h-3.5" /> Edit
                                </button>
                              )}
                              {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                                <button
                                  onClick={() => { setInvDropdownOpen(null); setCancelTarget(inv); }}
                                  disabled={cancellingInvoiceId === inv.id}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-error-600 hover:bg-error-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  {cancellingInvoiceId === inv.id ? 'Cancelling...' : 'Cancel'}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <EmptyState icon={FileText} title="No invoices found" description="Select a Sales Order to create an invoice." />}
        </div>
      </div>

      <Modal isOpen={showSOSelectModal} onClose={() => setShowSOSelectModal(false)} title="New Invoice" size="lg"
        footer={
          <button onClick={() => setShowSOSelectModal(false)} className="btn-secondary">Cancel</button>
        }>
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 border border-orange-100 rounded-lg">
            <Truck className="w-3.5 h-3.5 text-orange-600 shrink-0" />
            <p className="text-xs text-orange-700 font-medium">Invoices must be created from a Delivery Note.</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
            <input
              value={soSearch}
              onChange={e => setSoSearch(e.target.value)}
              placeholder="Search delivery note or customer..."
              className="input pl-8 w-full text-xs"
            />
          </div>
          {availableDCs.filter(dc => !soSearch || dc.challan_number.toLowerCase().includes(soSearch.toLowerCase()) || dc.customer_name.toLowerCase().includes(soSearch.toLowerCase())).length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <Truck className="w-8 h-8 text-neutral-200 mx-auto" />
              <p className="text-sm font-medium text-neutral-500">No uninvoiced delivery notes found.</p>
              <p className="text-xs text-neutral-400">Go to <span className="font-semibold text-orange-600">Delivery Notes</span> and create one first, then invoice from it.</p>
            </div>
          ) : (
            <div className="border border-neutral-200 rounded-lg overflow-hidden max-h-80 overflow-y-auto">
              {availableDCs
                .filter(dc => !soSearch || dc.challan_number.toLowerCase().includes(soSearch.toLowerCase()) || dc.customer_name.toLowerCase().includes(soSearch.toLowerCase()))
                .map(dc => (
                  <div key={dc.id} onClick={() => handleDCSelect(dc)}
                    className="flex items-center justify-between px-4 py-3 cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-primary-50 transition-colors group">
                    <div>
                      <p className="text-sm font-semibold text-primary-700">{dc.challan_number}</p>
                      <p className="text-xs text-neutral-500">{dc.customer_name}</p>
                      {dc.sales_order_id && soMap[dc.sales_order_id] && (
                        <p className="text-[10px] text-blue-600 mt-0.5">SO: {soMap[dc.sales_order_id]}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <StatusBadge status={dc.status} />
                      <p className="text-xs text-neutral-400 mt-1">{formatDate(dc.challan_date)}</p>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </Modal>

      <Modal isOpen={showViewModal} onClose={() => setShowViewModal(false)} title="Invoice Details" size="2xl"
        footer={
          <div className="flex gap-2">
            {selectedInvoice?.delivery_challan_id && dcIsB2bMap[selectedInvoice.delivery_challan_id] && (
              <button onClick={() => { setShowViewModal(false); if (selectedInvoice) openPrint(selectedInvoice, 'b2b'); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors">
                <Printer className="w-3.5 h-3.5" /> Print B2B
              </button>
            )}
            <button onClick={() => { setShowViewModal(false); if (selectedInvoice) openPrint(selectedInvoice, 'normal'); }}
              className="flex items-center gap-1.5 btn-secondary text-xs">
              <Printer className="w-3.5 h-3.5" /> Print Invoice
            </button>
            <button onClick={() => setShowViewModal(false)} className="btn-primary">Close</button>
          </div>
        }>
        {selectedInvoice && (
          <div>
            <div className="flex items-center gap-3 mb-3 pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-primary-700">{selectedInvoice.invoice_number}</span>
                <StatusBadge status={selectedInvoice.status} />
              </div>
              {selectedInvoice.sales_order_id && soMap[selectedInvoice.sales_order_id] && (
                <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-medium">SO: {soMap[selectedInvoice.sales_order_id]}</span>
              )}
              {(selectedInvoice as Record<string, unknown>).delivery_challan_id && dcMap[(selectedInvoice as Record<string, unknown>).delivery_challan_id as string] && (() => {
                const dcNum = dcMap[(selectedInvoice as Record<string, unknown>).delivery_challan_id as string];
                return dcNum.startsWith('LEGACY-DC-') ? null : (
                  <span className="text-[10px] bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded font-medium">DC: {dcNum}</span>
                );
              })()}
              {viewRelated.payments.length > 0 && (
                <span className="ml-auto text-[10px] text-success-600 font-medium">
                  {viewRelated.payments.length} payment{viewRelated.payments.length > 1 ? 's' : ''} recorded
                </span>
              )}
            </div>
            <InvoicePrint
              invoice={{ ...selectedInvoice, items: viewItems.map(i => ({ ...i, id: '', invoice_id: selectedInvoice.id, quantity: parseFloat(i.quantity) || 0, unit_price: parseFloat(i.unit_price) || 0, discount_pct: parseFloat(i.discount_pct) || 0, tax_pct: parseFloat(i.tax_pct) || 0 })) }}
              companyOverride={printCompany}
              printMode="normal"
            />
          </div>
        )}
      </Modal>

      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Invoice" size="2xl"
        footer={
          <>
            <button onClick={() => setShowEditModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleEditSave} className="btn-primary">Save Changes</button>
          </>
        }>
        <div className="space-y-3">
          {selectedInvoice && (
            <div className="flex items-center gap-4 px-3 py-2 bg-neutral-50 rounded-lg">
              <div>
                <p className="text-[10px] text-neutral-400 uppercase tracking-wider">Invoice #</p>
                <p className="text-sm font-bold text-primary-700">{selectedInvoice.invoice_number}</p>
              </div>
              <div>
                <p className="text-[10px] text-neutral-400 uppercase tracking-wider">Customer</p>
                <p className="text-sm font-medium text-neutral-800">{selectedInvoice.customer_name}</p>
              </div>
              <div className="ml-auto">
                <StatusBadge status={selectedInvoice.status} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="label">Invoice Date</label>
              <input type="date" value={editForm.invoice_date} onChange={e => setEditForm(f => ({ ...f, invoice_date: e.target.value }))} className="input text-xs" />
            </div>
            <div>
              <label className="label">Due Date <span className="text-neutral-400 font-normal">(optional)</span></label>
              <input type="date" value={editForm.due_date} onChange={e => setEditForm(f => ({ ...f, due_date: e.target.value }))} className="input text-xs" />
            </div>
            <div>
              <label className="label">Payment Terms</label>
              <select value={editForm.payment_terms} onChange={e => setEditForm(f => ({ ...f, payment_terms: e.target.value }))} className="input text-xs">
                <option value="Due on receipt">Due on receipt</option>
                <option value="Net 7">Net 7 days</option>
                <option value="Net 15">Net 15 days</option>
                <option value="Net 30">Net 30 days</option>
                <option value="Net 45">Net 45 days</option>
                <option value="Net 60">Net 60 days</option>
                <option value="Advance">Advance</option>
                <option value="Custom">{editForm.payment_terms && !['Due on receipt','Net 7','Net 15','Net 30','Net 45','Net 60','Advance'].includes(editForm.payment_terms) ? editForm.payment_terms : 'Custom...'}</option>
              </select>
            </div>
            <div>
              <label className="label">Notes</label>
              <input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} className="input text-xs" placeholder="Optional notes..." />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-neutral-700">Line Items</p>
              <button onClick={addEditItem} className="btn-ghost text-xs py-1"><Plus className="w-3.5 h-3.5" /> Add Item</button>
            </div>
            <div className="border border-neutral-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="table-header text-left">Product</th>
                    <th className="table-header text-left">Description</th>
                    <th className="table-header text-right" style={{width:'60px'}}>Qty</th>
                    <th className="table-header text-right" style={{width:'80px'}}>Rate</th>
                    <th className="table-header text-right" style={{width:'56px'}}>Disc%</th>
                    <th className="table-header text-right" style={{width:'52px'}}>Tax%</th>
                    <th className="table-header text-right" style={{width:'80px'}}>Total</th>
                    <th className="table-header" style={{width:'24px'}} />
                  </tr>
                </thead>
                <tbody>
                  {editItems.map((item, i) => (
                    <tr key={i} className="border-t border-neutral-100">
                      <td className="px-2 py-1.5" style={{minWidth:'140px'}}>
                        <select value={item.product_id} onChange={e => updateEditItem(i, 'product_id', e.target.value)} className="input text-xs py-1">
                          <option value="">-- Product --</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        {!item.product_id && <input value={item.product_name} onChange={e => updateEditItem(i, 'product_name', e.target.value)} className="input text-xs py-1 mt-0.5" placeholder="Type item name..." />}
                      </td>
                      <td className="px-2 py-1.5">
                        <input value={item.description} onChange={e => updateEditItem(i, 'description', e.target.value)} className="input text-xs py-1 w-full" placeholder="Description (optional)" />
                      </td>
                      <td className="px-1 py-1.5"><input type="number" value={item.quantity} onChange={e => updateEditItem(i, 'quantity', e.target.value)} className="input text-xs text-right py-1 w-full" /></td>
                      <td className="px-1 py-1.5"><input type="number" value={item.unit_price} onChange={e => updateEditItem(i, 'unit_price', e.target.value)} className="input text-xs text-right py-1 w-full" /></td>
                      <td className="px-1 py-1.5"><input type="number" value={item.discount_pct} onChange={e => updateEditItem(i, 'discount_pct', e.target.value)} className="input text-xs text-right py-1 w-full" /></td>
                      <td className="px-1 py-1.5"><input type="number" value={item.tax_pct} onChange={e => updateEditItem(i, 'tax_pct', e.target.value)} className="input text-xs text-right py-1 w-full" /></td>
                      <td className="px-2 py-1.5 text-right text-xs font-semibold text-neutral-800">{formatCurrency(item.total_price)}</td>
                      <td className="px-1 py-1.5 text-center"><button onClick={() => removeEditItem(i)} className="text-neutral-300 hover:text-error-500 text-base leading-none">&times;</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end mt-2 gap-2 items-center">
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-neutral-500">Courier</label>
                <input type="number" value={editForm.courier_charges} onChange={e => setEditForm(f => ({ ...f, courier_charges: e.target.value }))} className="input w-20 text-right text-xs py-1" />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-neutral-500">Discount</label>
                <input type="number" value={editForm.discount_amount} onChange={e => setEditForm(f => ({ ...f, discount_amount: e.target.value }))} className="input w-20 text-right text-xs py-1" />
              </div>
              <div className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold">
                {formatCurrency(editTotal)}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="New Invoice" size="2xl"
        footer={
          <>
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} className="btn-primary">Create Invoice</button>
          </>
        }>
        <div className="space-y-3">
          {form.sales_order_id && selectedSO && (
            <div className="px-3 py-2 bg-primary-50 border border-primary-100 rounded-lg flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-primary-600 uppercase tracking-wider">Creating from Sales Order</p>
                <p className="text-sm text-primary-800 font-medium">{selectedSO.so_number} &mdash; {selectedSO.customer_name}</p>
              </div>
              <StatusBadge status={selectedSO.status} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Invoice Details</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Invoice Date</label>
                  <input type="date" value={form.invoice_date} onChange={e => setForm(f => ({ ...f, invoice_date: e.target.value }))} className="input text-xs" />
                </div>
                <div>
                  <label className="label">Due Date <span className="text-neutral-400 font-normal">(optional)</span></label>
                  <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="input text-xs" />
                </div>
                <div>
                  <label className="label">Payment Terms</label>
                  <select value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))} className="input text-xs">
                    <option value="Due on receipt">Due on receipt</option>
                    <option value="Net 7">Net 7 days</option>
                    <option value="Net 15">Net 15 days</option>
                    <option value="Net 30">Net 30 days</option>
                    <option value="Net 45">Net 45 days</option>
                    <option value="Net 60">Net 60 days</option>
                    <option value="Advance">Advance</option>
                    <option value="Custom">{form.payment_terms && !['Due on receipt','Net 7','Net 15','Net 30','Net 45','Net 60','Advance'].includes(form.payment_terms) ? form.payment_terms : 'Custom...'}</option>
                  </select>
                </div>
                <div>
                  <p className="text-[10px] text-neutral-400 pt-1">Godown selected per line item below</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Bill To</p>
              <input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} className="input text-xs" placeholder="Customer Name *" />
              <input value={form.customer_address} onChange={e => setForm(f => ({ ...f, customer_address: e.target.value }))} className="input text-xs" placeholder="Address Line 1" />
              <input value={form.customer_address2} onChange={e => setForm(f => ({ ...f, customer_address2: e.target.value }))} className="input text-xs" placeholder="Address Line 2" />
              <div className="flex gap-1.5">
                <input value={form.customer_city} onChange={e => setForm(f => ({ ...f, customer_city: e.target.value }))} className="input text-xs flex-1" placeholder="City" />
                <input value={form.customer_state} onChange={e => setForm(f => ({ ...f, customer_state: e.target.value }))} className="input text-xs w-24" placeholder="State" />
                <input value={form.customer_pincode} onChange={e => setForm(f => ({ ...f, customer_pincode: e.target.value }))} className="input text-xs w-20" placeholder="PIN" maxLength={6} />
              </div>
              <input value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} className="input text-xs" placeholder="Phone" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-neutral-700">Line Items</p>
              <button onClick={addItem} className="btn-ghost text-xs py-1"><Plus className="w-3.5 h-3.5" /> Add Item</button>
            </div>
            <div className="border border-neutral-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="table-header text-left">Product</th>
                    <th className="table-header text-left w-24">Godown</th>
                    <th className="table-header text-left">Description</th>
                    <th className="table-header text-right" style={{width:'60px'}}>Qty</th>
                    <th className="table-header text-right" style={{width:'80px'}}>Rate</th>
                    <th className="table-header text-right" style={{width:'56px'}}>Disc%</th>
                    <th className="table-header text-right" style={{width:'52px'}}>Tax%</th>
                    <th className="table-header text-right" style={{width:'80px'}}>Total</th>
                    <th className="table-header" style={{width:'24px'}} />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const availStock = item.product_id ? (godownStockMap[item.product_id] ?? null) : null;
                    const orderQty = parseFloat(item.quantity) || 0;
                    const stockWarning = availStock !== null && orderQty > availStock;
                    return (
                      <tr key={i} className={`border-t border-neutral-100 ${stockWarning ? 'bg-warning-50' : ''}`}>
                        <td className="px-2 py-1.5" style={{minWidth:'140px'}}>
                          <select value={item.product_id} onChange={e => updateItem(i, 'product_id', e.target.value)} className="input text-xs py-1">
                            <option value="">-- Product --</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                          {!item.product_id && <input value={item.product_name} onChange={e => updateItem(i, 'product_name', e.target.value)} className="input text-xs py-1 mt-0.5" placeholder="Type item name..." />}
                        </td>
                        <td className="px-1 py-1.5 w-24">
                          <select value={item.godown_id} onChange={e => { const gid=e.target.value; setItems(prev=>{const next=[...prev];next[i]={...next[i],godown_id:gid};return next;}); if (gid && item.product_id) loadGodownStock(gid,[item.product_id]); }} className="input text-xs py-1">
                            {godowns.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                          {item.product_id && availStock !== null && (
                            <p className={`text-[9px] mt-0.5 font-medium ${availStock===0?'text-error-600':stockWarning?'text-warning-600':'text-success-600'}`}>{availStock} left</p>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <input value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} className="input text-xs py-1 w-full" placeholder="Description (optional)" />
                        </td>
                        <td className="px-1 py-1.5"><input type="number" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} className={`input text-xs text-right py-1 w-full ${stockWarning ? 'border-warning-400' : ''}`} /></td>
                        <td className="px-1 py-1.5"><input type="number" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)} className="input text-xs text-right py-1 w-full" /></td>
                        <td className="px-1 py-1.5"><input type="number" value={item.discount_pct} onChange={e => updateItem(i, 'discount_pct', e.target.value)} className="input text-xs text-right py-1 w-full" /></td>
                        <td className="px-1 py-1.5"><input type="number" value={item.tax_pct} onChange={e => updateItem(i, 'tax_pct', e.target.value)} className="input text-xs text-right py-1 w-full" /></td>
                        <td className="px-2 py-1.5 text-right text-xs font-semibold text-neutral-800">{formatCurrency(item.total_price)}</td>
                        <td className="px-1 py-1.5 text-center"><button onClick={() => removeItem(i)} className="text-neutral-300 hover:text-error-500 text-base leading-none">&times;</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end mt-2 gap-2 items-center">
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-neutral-500">Courier</label>
                <input type="number" value={form.courier_charges} onChange={e => setForm(f => ({ ...f, courier_charges: e.target.value }))} className="input w-20 text-right text-xs py-1" />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-neutral-500">Discount</label>
                <input type="number" value={form.discount_amount} onChange={e => setForm(f => ({ ...f, discount_amount: e.target.value }))} className="input w-20 text-right text-xs py-1" />
              </div>
              <div className="bg-primary-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold">
                {formatCurrency(total)}
              </div>
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input text-xs" placeholder="Optional notes for the invoice..." />
          </div>
        </div>
      </Modal>

      {showPrint && selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-neutral-100 overflow-auto">
          <div className="no-print flex items-center justify-between bg-white border-b border-neutral-200 px-6 py-3">
            <div className="flex items-center gap-3">
              <p className="text-sm font-semibold text-neutral-800">
                {printMode === 'b2b' ? 'B2B Invoice Preview' : 'Invoice Preview'} — {selectedInvoice.invoice_number}
              </p>
              {printMode === 'b2b' && (
                <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700 rounded-full uppercase tracking-wider">B2B</span>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={handlePrint} className="btn-primary">Print / Save PDF</button>
              <button onClick={() => setShowPrint(false)} className="btn-secondary">Close</button>
            </div>
          </div>
          <div ref={printRef} className="py-6 print-content">
            <InvoicePrint
              invoice={selectedInvoice}
              companyOverride={printCompany}
              printMode={printMode}
              shipToCustomer={shipToCustomer}
              b2bShipTo={b2bShipTo}
              b2bPriceMap={b2bPriceMap}
            />
          </div>
        </div>
      )}

      <Modal isOpen={showPayModal} onClose={() => setShowPayModal(false)} title="Record Payment"
        subtitle={selectedInvoice ? `Invoice ${selectedInvoice.invoice_number} · ${selectedInvoice.customer_name}` : ''}
        size="sm"
        footer={
          <>
            <button onClick={() => setShowPayModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handlePayment} disabled={!payForm.amount || parseFloat(payForm.amount) <= 0} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">Record Payment</button>
          </>
        }>
        <div className="space-y-3">
          {selectedInvoice && (
            <div className="rounded-xl overflow-hidden border border-neutral-100">
              <div className="bg-neutral-50 px-4 py-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">Total</p>
                  <p className="text-sm font-bold text-neutral-800">{formatCurrency(selectedInvoice.total_amount)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">Paid</p>
                  <p className="text-sm font-bold text-success-600">{formatCurrency(selectedInvoice.paid_amount)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">Pending</p>
                  <p className="text-sm font-bold text-error-600">{formatCurrency(selectedInvoice.outstanding_amount)}</p>
                </div>
              </div>
              {selectedInvoice.total_amount > 0 && (
                <div className="h-1.5 bg-neutral-100">
                  <div className="h-full bg-success-500 transition-all"
                    style={{ width: `${Math.min(100, (selectedInvoice.paid_amount / selectedInvoice.total_amount) * 100)}%` }} />
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Payment Date</label>
              <input type="date" value={payForm.payment_date} onChange={e => setPayForm(f => ({ ...f, payment_date: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Payment Mode</label>
              <select value={payForm.payment_mode} onChange={e => setPayForm(f => ({ ...f, payment_mode: e.target.value }))} className="input">
                {['Cash', 'Bank Transfer', 'UPI', 'Cheque', 'Card'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">Amount Received</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 font-medium">₹</span>
              <input type="number" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} className="input pl-7 text-base font-semibold" placeholder="0" />
            </div>
            {selectedInvoice && parseFloat(payForm.amount) > selectedInvoice.outstanding_amount && (
              <p className="text-[10px] text-warning-600 mt-1">Amount exceeds outstanding balance</p>
            )}
          </div>
          <div>
            <label className="label">Reference Number <span className="text-neutral-400 font-normal">(UTR / Cheque no.)</span></label>
            <input value={payForm.reference_number} onChange={e => setPayForm(f => ({ ...f, reference_number: e.target.value }))} className="input" placeholder="Optional" />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Cancel Invoice"
        message={selectedInvoice ? `Are you sure you want to cancel invoice ${selectedInvoice.invoice_number}?` : ''}
        warning="This will reverse stock and cannot be undone."
        confirmLabel="Cancel Invoice"
        isDanger
      />

      <ConfirmDialog
        isOpen={!!cancelTarget}
        onClose={() => { if (!cancellingInvoiceId) setCancelTarget(null); }}
        onConfirm={async () => {
          if (!cancelTarget) return;
          setCancellingInvoiceId(cancelTarget.id);
          try {
            await cancelInvoice(cancelTarget.id);
            setCancelTarget(null);
            loadData();
          } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to cancel invoice');
          } finally {
            setCancellingInvoiceId(null);
          }
        }}
        title="Cancel Invoice"
        message={cancelTarget ? `Cancel invoice ${cancelTarget.invoice_number} for ${cancelTarget.customer_name}?` : ''}
        warning="This will reverse the ledger and re-open the parent delivery note. Cannot be undone."
        confirmLabel={cancellingInvoiceId ? 'Cancelling...' : 'Yes, Cancel'}
        isDanger
        suppressAutoClose
      />

    </div>
  );
}