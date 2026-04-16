import { useState, useEffect, useRef } from 'react';
import { Plus, Search, CreditCard, FileText, Download, Printer, Pencil, Eye, CheckCircle, XCircle, X, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatDate, formatDateInput, generateId, nextDocNumber, exportToCSV } from '../../lib/utils';
import Modal from '../../components/ui/Modal';
import StatusBadge from '../../components/ui/StatusBadge';
import EmptyState from '../../components/ui/EmptyState';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import InvoicePrint from './InvoicePrint';
import { useDateRange } from '../../contexts/DateRangeContext';
import { getSmartRate, updateLastRate } from '../../lib/rateCardService';
import { fetchCompanies, getCompanyById } from '../../lib/companiesService';
import type { Company } from '../../lib/companiesService';
import { fetchGodowns, getGodownStockForProduct, reduceGodownStock } from '../../services/godownService';
import type { Invoice, Product, Customer, SalesOrder, DeliveryChallan, Godown } from '../../types';
import type { ActivePage } from '../../types';
import type { PageState } from '../../App';

interface LineItem {
  product_id: string;
  product_name: string;
  description: string;
  unit: string;
  quantity: string;
  unit_price: string;
  discount_pct: string;
  tax_pct: string;
  total_price: number;
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
  const [availableSOs, setAvailableSOs] = useState<SalesOrder[]>([]);
  const [availableDCs, setAvailableDCs] = useState<DeliveryChallan[]>([]);
  const [soSearch, setSoSearch] = useState('');
  const [selectedSO, setSelectedSO] = useState<SalesOrder | null>(null);
  const [selectedSOId, setSelectedSOId] = useState('');
  const [selectMode, setSelectMode] = useState<'so' | 'dc'>('dc');
  const printRef = useRef<HTMLDivElement>(null);
  const [printCompany, setPrintCompany] = useState<Company | undefined>(undefined);
  const [splitSummary, setSplitSummary] = useState<{invoiceNumber: string; companyName: string; total: number}[] | null>(null);

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

  useEffect(() => { loadData(); }, []);

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
          unit_price: 0,
          discount_pct: 0,
          total_price: 0,
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
  }, [prefillFromDC]);

  const [soMap, setSoMap] = useState<Record<string, string>>({});
  const [dcMap, setDcMap] = useState<Record<string, string>>({});

  const loadData = async () => {
    const [invRes, productsRes, customersRes, godownsData, soRes, dcRes] = await Promise.all([
      supabase.from('invoices').select('*').order('created_at', { ascending: false }),
      supabase.from('products').select('id, name, unit, selling_price').eq('is_active', true),
      supabase.from('customers').select('id, name, phone, alt_phone, address, address2, city, state, pincode').eq('is_active', true).order('name'),
      fetchGodowns(),
      supabase.from('sales_orders').select('id, so_number'),
      supabase.from('delivery_challans').select('id, challan_number'),
    ]);
    setInvoices(invRes.data || []);
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
    (dcRes.data || []).forEach((d: { id: string; challan_number: string }) => { dm[d.id] = d.challan_number; });
    setDcMap(dm);
  };

  const loadGodownStock = async (godownId: string, productIds: string[]) => {
    if (!godownId || productIds.length === 0) return;
    const uniqueIds = [...new Set(productIds.filter(Boolean))];
    const stockEntries = await Promise.all(
      uniqueIds.map(async pid => {
        const qty = await getGodownStockForProduct(pid, godownId);
        return [pid, qty] as [string, number];
      })
    );
    setGodownStockMap(Object.fromEntries(stockEntries));
  };

  const loadAvailableSOs = async () => {
    const [invoicedSORes, invoicedDCRes] = await Promise.all([
      supabase.from('invoices').select('sales_order_id').not('sales_order_id', 'is', null).neq('status', 'cancelled'),
      supabase.from('invoices').select('delivery_challan_id').not('delivery_challan_id', 'is', null).neq('status', 'cancelled'),
    ]);

    const usedSOIds = (invoicedSORes.data || []).map((r: { sales_order_id: string }) => r.sales_order_id).filter(Boolean);
    const usedDCIds = (invoicedDCRes.data || []).map((r: { delivery_challan_id: string }) => r.delivery_challan_id).filter(Boolean);

    let soQuery = supabase
      .from('sales_orders')
      .select('*, items:sales_order_items(*)')
      .in('status', ['confirmed', 'dispatched', 'delivered'])
      .order('created_at', { ascending: false });

    if (usedSOIds.length > 0) {
      soQuery = soQuery.not('id', 'in', `(${usedSOIds.join(',')})`);
    }

    let dcQuery = supabase
      .from('delivery_challans')
      .select('*')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false });

    if (usedDCIds.length > 0) {
      dcQuery = dcQuery.not('id', 'in', `(${usedDCIds.join(',')})`);
    }

    const [soRes, dcRes] = await Promise.all([soQuery, dcQuery]);
    setAvailableSOs(soRes.data || []);
    setAvailableDCs((dcRes.data || []) as DeliveryChallan[]);
  };

  const openSOSelectModal = async () => {
    await loadAvailableSOs();
    setSoSearch('');
    setSelectedSOId('');
    setSelectedSO(null);
    setSelectMode('dc');
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

  const handleSOSelect = (soId: string) => {
    setSelectedSOId(soId);
    const so = availableSOs.find(s => s.id === soId) || null;
    setSelectedSO(so);
  };

  const handleProceedWithSO = async () => {
    if (!selectedSO) return;

    let soItems: SalesOrder['items'] = selectedSO.items;
    if (!soItems || soItems.length === 0) {
      const { data: itemsData } = await supabase
        .from('sales_order_items')
        .select('*')
        .eq('sales_order_id', selectedSO.id);
      soItems = itemsData || [];
    }

    const soCustomer = customers.find(c => c.id === selectedSO.customer_id);
    setForm({
      customer_id: selectedSO.customer_id || '',
      customer_name: selectedSO.customer_name,
      customer_phone: selectedSO.customer_phone || soCustomer?.phone || '',
      customer_address: selectedSO.customer_address || soCustomer?.address || '',
      customer_address2: selectedSO.customer_address2 || soCustomer?.address2 || '',
      customer_city: selectedSO.customer_city || soCustomer?.city || '',
      customer_state: selectedSO.customer_state || soCustomer?.state || '',
      customer_pincode: selectedSO.customer_pincode || soCustomer?.pincode || '',
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: '',
      courier_charges: String(selectedSO.courier_charges || 0),
      discount_amount: String(selectedSO.discount_amount || 0),
      payment_terms: 'Due on receipt',
      notes: selectedSO.notes || '',
      bank_name: '',
      account_number: '',
      ifsc_code: '',
      sales_order_id: selectedSO.id,
    });

    setItems(
      (soItems || []).map(item => ({
        product_id: item.product_id || '',
        product_name: item.product_name,
        description: '',
        unit: item.unit,
        quantity: String(item.quantity),
        unit_price: String(item.unit_price),
        discount_pct: String(item.discount_pct || 0),
        tax_pct: '0',
        total_price: item.total_price,
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

  // Helper: create one invoice for a subset of items + a specific company
  const createOneInvoice = async (
    invItems: typeof items,
    companyId: string | null,
    invSubtotal: number,
    invTax: number,
    invCourier: number,
    invDiscount: number,
    invTotal: number,
  ) => {
    const invNumber = await nextDocNumber('INV', supabase);
    const { data: inv } = await supabase.from('invoices').insert({
      invoice_number: invNumber,
      sales_order_id: form.sales_order_id || null,
      delivery_challan_id: form.delivery_challan_id || null,
      customer_id: form.customer_id || null,
      customer_name: form.customer_name,
      customer_phone: form.customer_phone,
      customer_address: form.customer_address,
      customer_address2: form.customer_address2,
      customer_city: form.customer_city,
      customer_state: form.customer_state,
      customer_pincode: form.customer_pincode,
      invoice_date: form.invoice_date,
      due_date: form.due_date || null,
      status: 'sent',
      subtotal: invSubtotal,
      tax_amount: invTax,
      courier_charges: invCourier,
      discount_amount: invDiscount,
      total_amount: invTotal,
      paid_amount: 0,
      outstanding_amount: invTotal,
      payment_terms: form.payment_terms,
      notes: form.notes,
      bank_name: form.bank_name,
      account_number: form.account_number,
      ifsc_code: form.ifsc_code,
      company_id: companyId,
    }).select().single();

    if (!inv) return null;

    await supabase.from('invoice_items').insert(
      invItems.map(i => ({
        invoice_id: inv.id,
        product_id: i.product_id || null,
        product_name: i.product_name,
        description: i.description,
        unit: i.unit,
        quantity: parseFloat(i.quantity) || 0,
        unit_price: parseFloat(i.unit_price) || 0,
        discount_pct: parseFloat(i.discount_pct) || 0,
        tax_pct: parseFloat(i.tax_pct) || 0,
        total_price: i.total_price,
        godown_id: i.godown_id || null,
      }))
    );

    for (const item of invItems) {
      if (item.product_id) {
        const qty = parseFloat(item.quantity) || 0;
        const rate = parseFloat(item.unit_price) || 0;
        if (item.godown_id) await reduceGodownStock(item.product_id, item.godown_id, qty);
        await supabase.from('stock_movements').insert({
          product_id: item.product_id, movement_type: 'sale', quantity: qty,
          reference_type: 'invoice', reference_id: inv.id,
          godown_id: item.godown_id || null, reference_number: invNumber,
          notes: 'Invoice ' + invNumber,
        });
        const { data: prod } = await supabase.from('products').select('stock_quantity').eq('id', item.product_id).maybeSingle();
        if (prod) await supabase.from('products').update({ stock_quantity: Math.max(0, (prod.stock_quantity || 0) - qty) }).eq('id', item.product_id);
        if (form.customer_id && rate > 0) await updateLastRate(form.customer_id, item.product_id, rate, 'invoice', inv.id);
      }
    }

    await supabase.from('ledger_entries').insert({
      entry_date: form.invoice_date, entry_type: 'debit', account_type: 'customer',
      party_id: form.customer_id || null, party_name: form.customer_name,
      reference_type: 'invoice', reference_id: inv.id,
      description: 'Invoice ' + invNumber, amount: invTotal,
    });

    return { invNumber, invTotal, inv };
  };

  const handleSave = async () => {
    const validItems = items.filter(i => i.product_name);

    // --- SPLIT DETECTION ---
    // Fetch company_id for each product so we can group by entity
    const productCompanyMap: Record<string, string | null> = {};
    const productIds = [...new Set(validItems.map(i => i.product_id).filter(Boolean))];
    if (productIds.length > 0) {
      const { data: prods } = await supabase.from('products').select('id, company_id').in('id', productIds);
      (prods || []).forEach(p => { productCompanyMap[p.id] = p.company_id || null; });
    }

    // Group items by company
    const groups = new Map<string | null, typeof items>();
    for (const item of validItems) {
      const companyId = item.product_id ? (productCompanyMap[item.product_id] ?? null) : null;
      const key = companyId ?? '__none__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }

    const realGroups = [...groups.entries()].map(([key, grpItems]) => ({
      companyId: key === '__none__' ? null : key,
      items: grpItems,
    }));

    const courier = parseFloat(form.courier_charges) || 0;
    const discount = parseFloat(form.discount_amount) || 0;
    const numGroups = realGroups.length;

    const summaries: {invoiceNumber: string; companyName: string; total: number}[] = [];

    // Fetch company names for summary
    const allCompanies = await fetchCompanies();

    for (let g = 0; g < realGroups.length; g++) {
      const { companyId, items: grpItems } = realGroups[g];
      const grpSubtotal = grpItems.reduce((s, i) => s + i.total_price, 0);
      const grpTax = grpItems.reduce((s, i) => {
        const qty = parseFloat(i.quantity) || 0;
        const price = parseFloat(i.unit_price) || 0;
        const disc = parseFloat(i.discount_pct) || 0;
        const tax = parseFloat(i.tax_pct) || 0;
        return s + (qty * price * (1 - disc / 100) * (tax / 100));
      }, 0);
      // Split courier & discount proportionally across groups
      const fraction = numGroups > 1 ? grpSubtotal / (subtotal || 1) : 1;
      const grpCourier = numGroups > 1 ? Math.round(courier * fraction) : courier;
      const grpDiscount = numGroups > 1 ? Math.round(discount * fraction) : discount;
      const grpTotal = grpSubtotal + grpTax + grpCourier - grpDiscount;

      const result = await createOneInvoice(grpItems, companyId, grpSubtotal, grpTax, grpCourier, grpDiscount, grpTotal);
      if (result) {
        const co = allCompanies.find(c => c.id === companyId);
        summaries.push({ invoiceNumber: result.invNumber, companyName: co?.name || 'Default', total: grpTotal });
      }
    }

    // Update customer balance once for total
    if (form.customer_id) {
      const { data: cust } = await supabase.from('customers').select('balance, total_revenue').eq('id', form.customer_id).maybeSingle();
      if (cust) {
        const grandTotal = summaries.reduce((s, x) => s + x.total, 0);
        await supabase.from('customers').update({
          balance: (cust.balance || 0) + grandTotal,
          total_revenue: (cust.total_revenue || 0) + grandTotal,
          last_interaction: new Date().toISOString(),
        }).eq('id', form.customer_id);
      }
    }
    if (form.sales_order_id) {
      await supabase.from('sales_orders').update({ status: 'dispatched' }).eq('id', form.sales_order_id);
    }

    setShowModal(false);
    loadData();
    // Show split summary if multiple invoices were created
    if (summaries.length > 1) setSplitSummary(summaries);
  };

  const openView = async (inv: Invoice) => {
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
    const outstanding = selectedInvoice.outstanding_amount || 0;
    await supabase.from('invoices').update({
      status: 'cancelled',
      outstanding_amount: 0,
    }).eq('id', selectedInvoice.id);

    if (selectedInvoice.customer_id && outstanding > 0) {
      const { data: cust } = await supabase.from('customers').select('balance, total_revenue').eq('id', selectedInvoice.customer_id).maybeSingle();
      if (cust) {
        await supabase.from('customers').update({
          balance: Math.max(0, (cust.balance || 0) - outstanding),
          total_revenue: Math.max(0, (cust.total_revenue || 0) - selectedInvoice.total_amount),
        }).eq('id', selectedInvoice.customer_id);
      }
    }

    await supabase.from('ledger_entries').insert({
      entry_date: new Date().toISOString().split('T')[0],
      entry_type: 'credit',
      account_type: 'customer',
      party_id: selectedInvoice.customer_id || null,
      party_name: selectedInvoice.customer_name,
      reference_type: 'invoice',
      reference_id: selectedInvoice.id,
      description: 'Cancellation of Invoice ' + selectedInvoice.invoice_number,
      amount: outstanding,
    });

    loadData();
  };

  const openPrint = async (inv: Invoice) => {
    const { data: itemsData } = await supabase.from('invoice_items').select('*').eq('invoice_id', inv.id);
    setSelectedInvoice({ ...inv, items: itemsData || [] });
    // Load the company profile for this invoice
    const invWithCompany = inv as Invoice & { company_id?: string };
    if (invWithCompany.company_id) {
      const co = await getCompanyById(invWithCompany.company_id);
      setPrintCompany(co || undefined);
    } else {
      setPrintCompany(undefined);
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
    exportToCSV(
      filtered.map(inv => ({
        'Invoice #': inv.invoice_number,
        'Customer': inv.customer_name,
        'Phone': inv.customer_phone || '',
        'Invoice Date': inv.invoice_date,
        'Due Date': inv.due_date || '',
        'Subtotal': inv.subtotal,
        'Tax Amount': inv.tax_amount,
        'Courier Charges': inv.courier_charges || 0,
        'Discount': inv.discount_amount || 0,
        'Total Amount': inv.total_amount,
        'Paid Amount': inv.paid_amount,
        'Outstanding': inv.outstanding_amount,
        'Status': inv.status,
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
        ? ['sent', 'draft', 'overdue'].includes(i.status)
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

  const STATUSES = ['All', 'Pending', 'Partial', 'Paid'];

  const filteredSOs = availableSOs.filter(so =>
    so.customer_name.toLowerCase().includes(soSearch.toLowerCase()) ||
    so.so_number.toLowerCase().includes(soSearch.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="bg-white border-b border-neutral-100 px-6 py-4 flex items-center justify-between no-print">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">Invoices</h1>
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

      <div className="p-6 space-y-4 no-print">
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
                return (
                  <tr key={inv.id} className={`border-b border-neutral-50 hover:bg-neutral-50 transition-colors ${isOverdue ? 'bg-error-50/30' : ''}`}>
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
                        {(inv as Record<string, unknown>).delivery_challan_id && dcMap[(inv as Record<string, unknown>).delivery_challan_id as string] && (
                          <span className="text-[10px] font-medium bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded w-fit">DC: {dcMap[(inv as Record<string, unknown>).delivery_challan_id as string]}</span>
                        )}
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
                            <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-neutral-200 rounded-lg shadow-lg z-10 overflow-hidden">
                              <button
                                onClick={() => { setInvDropdownOpen(null); openPrint(inv); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-50 transition-colors"
                              >
                                <Printer className="w-3.5 h-3.5" /> Print / PDF
                              </button>
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

      <Modal isOpen={showSOSelectModal} onClose={() => setShowSOSelectModal(false)} title="Create Invoice From" size="lg"
        footer={
          <>
            <button onClick={() => setShowSOSelectModal(false)} className="btn-secondary">Cancel</button>
            {selectMode === 'so' && <button onClick={handleProceedWithSO} disabled={!selectedSOId} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">Continue to Invoice</button>}
          </>
        }>
        <div className="space-y-3">
          <div className="flex gap-1 border-b border-neutral-100 pb-0">
            <button onClick={() => setSelectMode('dc')} className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${selectMode === 'dc' ? 'border-primary-600 text-primary-700' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}>
              From Delivery Challan
            </button>
            <button onClick={() => setSelectMode('so')} className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${selectMode === 'so' ? 'border-primary-600 text-primary-700' : 'border-transparent text-neutral-500 hover:text-neutral-700'}`}>
              From Sales Order
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
            <input
              value={soSearch}
              onChange={e => setSoSearch(e.target.value)}
              placeholder={selectMode === 'dc' ? 'Search DC number or customer...' : 'Search SO number or customer...'}
              className="input pl-8 w-full text-xs"
            />
          </div>
          {selectMode === 'dc' ? (
            availableDCs.filter(dc => !soSearch || dc.challan_number.toLowerCase().includes(soSearch.toLowerCase()) || dc.customer_name.toLowerCase().includes(soSearch.toLowerCase())).length === 0 ? (
              <div className="text-center py-8 text-neutral-400 text-sm">No uninvoiced delivery challans found.</div>
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
            )
          ) : (
            filteredSOs.length === 0 ? (
              <div className="text-center py-8 text-neutral-400 text-sm">
                No eligible Sales Orders found.
              </div>
            ) : (
              <div className="border border-neutral-200 rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                {filteredSOs.map(so => (
                  <div key={so.id} onClick={() => handleSOSelect(so.id)}
                    className={`flex items-center justify-between px-4 py-3 cursor-pointer border-b border-neutral-100 last:border-0 transition-colors ${selectedSOId === so.id ? 'bg-primary-50 border-primary-100' : 'hover:bg-neutral-50'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selectedSOId === so.id ? 'border-primary-600 bg-primary-600' : 'border-neutral-300'}`}>
                        {selectedSOId === so.id && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-primary-700">{so.so_number}</p>
                        <p className="text-xs text-neutral-500">{so.customer_name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatCurrency(so.total_amount)}</p>
                      <p className="text-xs text-neutral-400">{formatDate(so.so_date)} &middot; <StatusBadge status={so.status} /></p>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </Modal>

      <Modal isOpen={showViewModal} onClose={() => setShowViewModal(false)} title="Invoice Details" size="2xl"
        footer={
          <div className="flex gap-2">
            <button onClick={() => { setShowViewModal(false); if (selectedInvoice) openPrint(selectedInvoice); }} className="btn-secondary">Print</button>
            <button onClick={() => setShowViewModal(false)} className="btn-primary">Close</button>
          </div>
        }>
        {selectedInvoice && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="label">Invoice #</p>
                <p className="text-sm font-semibold text-primary-700">{selectedInvoice.invoice_number}</p>
              </div>
              <div>
                <p className="label">Status</p>
                <StatusBadge status={selectedInvoice.status} />
              </div>
              <div>
                <p className="label">Customer</p>
                <p className="text-sm font-medium">{selectedInvoice.customer_name}</p>
                {selectedInvoice.customer_phone && <p className="text-xs text-neutral-500">{selectedInvoice.customer_phone}</p>}
              </div>
              {selectedInvoice.sales_order_id && (
                <div>
                  <p className="label">Sales Order</p>
                  <span className="text-xs font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{soMap[selectedInvoice.sales_order_id] || '—'}</span>
                </div>
              )}
              {(selectedInvoice as Record<string, unknown>).delivery_challan_id && (
                <div>
                  <p className="label">Delivery Challan</p>
                  <span className="text-xs font-semibold bg-orange-50 text-orange-700 px-2 py-0.5 rounded">{dcMap[(selectedInvoice as Record<string, unknown>).delivery_challan_id as string] || '—'}</span>
                </div>
              )}
              <div>
                <p className="label">Invoice Date</p>
                <p className="text-sm">{formatDate(selectedInvoice.invoice_date)}</p>
              </div>
              <div>
                <p className="label">Due Date</p>
                <p className="text-sm">{selectedInvoice.due_date ? formatDate(selectedInvoice.due_date) : '-'}</p>
              </div>
              <div>
                <p className="label">Payment Terms</p>
                <p className="text-sm">{selectedInvoice.payment_terms || '-'}</p>
              </div>
              {selectedInvoice.customer_address && (
                <div className="col-span-2">
                  <p className="label">Address</p>
                  <p className="text-sm">{selectedInvoice.customer_address}{selectedInvoice.customer_city ? `, ${selectedInvoice.customer_city}` : ''}</p>
                </div>
              )}
            </div>

            <div>
              <p className="text-sm font-semibold text-neutral-700 mb-2">Line Items</p>
              <div className="border border-neutral-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="table-header text-left">Product / Description</th>
                      <th className="table-header text-right w-16">Qty</th>
                      <th className="table-header text-right w-24">Rate</th>
                      <th className="table-header text-right w-16">Disc%</th>
                      <th className="table-header text-right w-16">Tax%</th>
                      <th className="table-header text-right w-24">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewItems.map((item, i) => (
                      <tr key={i} className="border-t border-neutral-100">
                        <td className="px-3 py-2">
                          <p className="text-sm font-medium">{item.product_name}</p>
                          {item.description && <p className="text-xs text-neutral-500">{item.description}</p>}
                        </td>
                        <td className="px-2 py-2 text-right text-sm">{item.quantity} {item.unit}</td>
                        <td className="px-2 py-2 text-right text-sm">{formatCurrency(parseFloat(item.unit_price) || 0)}</td>
                        <td className="px-2 py-2 text-right text-sm">{item.discount_pct}%</td>
                        <td className="px-2 py-2 text-right text-sm">{item.tax_pct}%</td>
                        <td className="px-2 py-2 text-right text-sm font-semibold">{formatCurrency(item.total_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end mt-2 gap-4 text-sm pr-2">
                <div className="space-y-1 text-right">
                  <div className="flex gap-8 justify-between text-neutral-600"><span>Subtotal</span><span className="font-medium">{formatCurrency(selectedInvoice.subtotal)}</span></div>
                  <div className="flex gap-8 justify-between text-neutral-600"><span>Tax</span><span className="font-medium">{formatCurrency(selectedInvoice.tax_amount)}</span></div>
                  {(selectedInvoice.courier_charges || 0) > 0 && <div className="flex gap-8 justify-between text-neutral-600"><span>Courier</span><span className="font-medium">{formatCurrency(selectedInvoice.courier_charges)}</span></div>}
                  {(selectedInvoice.discount_amount || 0) > 0 && <div className="flex gap-8 justify-between text-neutral-600"><span>Discount</span><span className="font-medium text-success-600">-{formatCurrency(selectedInvoice.discount_amount)}</span></div>}
                  <div className="flex gap-8 justify-between font-bold text-neutral-900 border-t border-neutral-200 pt-1"><span>Total</span><span>{formatCurrency(selectedInvoice.total_amount)}</span></div>
                  <div className="flex gap-8 justify-between text-success-600"><span>Paid</span><span className="font-medium">{formatCurrency(selectedInvoice.paid_amount)}</span></div>
                  <div className="flex gap-8 justify-between text-error-600 font-bold"><span>Outstanding</span><span>{formatCurrency(selectedInvoice.outstanding_amount)}</span></div>
                </div>
              </div>
            </div>

            {(selectedInvoice.bank_name || selectedInvoice.account_number) && (
              <div className="p-3 bg-neutral-50 rounded-lg grid grid-cols-3 gap-3">
                <p className="col-span-3 text-xs font-semibold text-neutral-600">Bank Details</p>
                {selectedInvoice.bank_name && <div><p className="label">Bank</p><p className="text-sm">{selectedInvoice.bank_name}</p></div>}
                {selectedInvoice.account_number && <div><p className="label">Account #</p><p className="text-sm">{selectedInvoice.account_number}</p></div>}
                {selectedInvoice.ifsc_code && <div><p className="label">IFSC</p><p className="text-sm">{selectedInvoice.ifsc_code}</p></div>}
              </div>
            )}

            {selectedInvoice.notes && (
              <div>
                <p className="label">Notes</p>
                <p className="text-sm text-neutral-600">{selectedInvoice.notes}</p>
              </div>
            )}

            {(viewRelated.dispatches.length > 0 || viewRelated.payments.length > 0) && (
              <div className="border-t border-neutral-100 pt-4">
                <p className="text-sm font-semibold text-neutral-700 mb-3">Related Records</p>
                <div className="grid grid-cols-2 gap-4">
                  {viewRelated.dispatches.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Dispatch Entries</p>
                      <div className="space-y-1">
                        {viewRelated.dispatches.map((d, i) => (
                          <div key={i} className="flex items-center justify-between px-2 py-1.5 bg-neutral-50 rounded-lg">
                            <span className="text-xs font-medium text-neutral-700">{d.dispatch_number}</span>
                            <StatusBadge status={d.status} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {viewRelated.payments.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2">Payments Recorded</p>
                      <div className="space-y-1">
                        {viewRelated.payments.map((p, i) => (
                          <div key={i} className="flex items-center justify-between px-2 py-1.5 bg-success-50 rounded-lg">
                            <div>
                              <span className="text-xs font-semibold text-success-700">{formatCurrency(p.amount)}</span>
                              <span className="text-[10px] text-neutral-400 ml-1.5">{p.payment_mode}</span>
                            </div>
                            <span className="text-[10px] text-neutral-500">{formatDate(p.payment_date)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
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
            <p className="text-sm font-semibold text-neutral-800">Invoice Preview - {selectedInvoice.invoice_number}</p>
            <div className="flex gap-2">
              <button onClick={handlePrint} className="btn-primary">Print / Save PDF</button>
              <button onClick={() => setShowPrint(false)} className="btn-secondary">Close</button>
            </div>
          </div>
          <div ref={printRef} className="py-6 print-content">
            <InvoicePrint invoice={selectedInvoice} companyOverride={printCompany} />
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
        message={selectedInvoice ? `Are you sure you want to cancel invoice ${selectedInvoice.invoice_number}? This action cannot be undone.` : ''}
        confirmLabel="Cancel Invoice"
        isDanger
      />

      <ConfirmDialog
        isOpen={!!cancelTarget}
        onClose={() => { if (!cancellingInvoiceId) setCancelTarget(null); }}
        onConfirm={async () => {
          if (!cancelTarget) return;
          setCancellingInvoiceId(cancelTarget.id);
          const outstanding = cancelTarget.outstanding_amount || 0;
          await supabase.from('invoices').update({ status: 'cancelled', outstanding_amount: 0 }).eq('id', cancelTarget.id);
          if (cancelTarget.customer_id && outstanding > 0) {
            const { data: cust } = await supabase.from('customers').select('balance, total_revenue').eq('id', cancelTarget.customer_id).maybeSingle();
            if (cust) {
              await supabase.from('customers').update({
                balance: Math.max(0, (cust.balance || 0) - outstanding),
                total_revenue: Math.max(0, (cust.total_revenue || 0) - cancelTarget.total_amount),
              }).eq('id', cancelTarget.customer_id);
            }
          }
          setCancellingInvoiceId(null);
          setCancelTarget(null);
          loadData();
        }}
        title="Cancel Invoice"
        message={cancelTarget ? `Cancel invoice ${cancelTarget.invoice_number} for ${cancelTarget.customer_name}? This cannot be undone.` : ''}
        confirmLabel={cancellingInvoiceId ? 'Cancelling...' : 'Yes, Cancel'}
        isDanger
      />

    {/* Split invoice summary */}
      {splitSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSplitSummary(null)} />
          <div className="relative bg-white rounded-xl shadow-card-lg w-full max-w-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 bg-success-50 rounded-full flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-success-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <p className="text-sm font-bold text-neutral-900">{splitSummary.length} Invoices Created</p>
                <p className="text-xs text-neutral-500">Products belonged to different billing entities</p>
              </div>
            </div>
            <div className="space-y-2 mb-4">
              {splitSummary.map(s => (
                <div key={s.invoiceNumber} className="flex items-center justify-between bg-neutral-50 rounded-lg px-3 py-2.5">
                  <div>
                    <p className="text-xs font-bold text-primary-700">{s.invoiceNumber}</p>
                    <p className="text-[11px] text-neutral-500">{s.companyName}</p>
                  </div>
                  <p className="text-sm font-bold text-neutral-800">{formatCurrency(s.total)}</p>
                </div>
              ))}
            </div>
            <button onClick={() => setSplitSummary(null)} className="btn-primary w-full justify-center text-xs">Done</button>
          </div>
        </div>
      )}

    </div>
  );
}