import React, { useState, useEffect } from 'react';
import { Plus, Search, FileText, ChevronDown, ChevronRight, Receipt, Truck, Download, Eye, Pencil, Trash2, Printer, Send, Warehouse } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatDate, generateId, nextDocNumber, exportToCSV } from '../../lib/utils';
import Modal from '../../components/ui/Modal';
import StatusBadge from '../../components/ui/StatusBadge';
import EmptyState from '../../components/ui/EmptyState';
import { useDateRange } from '../../contexts/DateRangeContext';
import { getSmartRate } from '../../lib/rateCardService';
import { fetchGodowns, getGodownStockForProduct } from '../../services/godownService';
import { fetchCompanies } from '../../lib/companiesService';
import type { Company } from '../../lib/companiesService';
import SalesOrderPrint from './SalesOrderPrint';
import type { SalesOrder, SalesOrderItem, Product, Customer, Godown } from '../../types';
import type { ActivePage } from '../../types';
import type { PageState } from '../../App';

interface LineItem {
  product_id: string;
  product_name: string;
  unit: string;
  quantity: string;
  unit_price: string;
  discount_pct: string;
  total_price: number;
  godown_id: string;
}

interface SalesOrdersProps {
  onNavigate: (page: ActivePage, state?: PageState) => void;
}

export default function SalesOrders({ onNavigate }: SalesOrdersProps) {
  const { dateRange } = useDateRange();
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [godownStockMap, setGodownStockMap] = useState<Record<string, number>>({});
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [rowItems, setRowItems] = useState<Record<string, SalesOrderItem[]>>({});
  const [converting, setConverting] = useState<string | null>(null);
  const [editOrder, setEditOrder] = useState<SalesOrder | null>(null);
  const [viewOrder, setViewOrder] = useState<SalesOrder | null>(null);
  const [viewItems, setViewItems] = useState<SalesOrderItem[]>([]);
  const [showViewModal, setShowViewModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SalesOrder | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [linkedInfo, setLinkedInfo] = useState<{invoices: number; challans: number} | null>(null);
  const [printOrder, setPrintOrder] = useState<SalesOrder | null>(null);
  const [printItems, setPrintItems] = useState<SalesOrderItem[]>([]);
  const [printCompany, setPrintCompany] = useState<Company | undefined>(undefined);

  const [form, setForm] = useState({
    customer_id: '', customer_name: '', customer_phone: '',
    customer_address: '', customer_address2: '', customer_city: '', customer_state: '', customer_pincode: '',
    so_date: new Date().toISOString().split('T')[0], delivery_date: '',
    courier_charges: '0', discount_amount: '0', notes: '',
    godown_id: '',
  });
  const [items, setItems] = useState<LineItem[]>([{ product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '', discount_pct: '0', total_price: 0, godown_id: '' }]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [ordersRes, productsRes, customersRes, godownsData] = await Promise.all([
      supabase.from('sales_orders').select('*').order('created_at', { ascending: false }),
      supabase.from('products').select('id, name, unit, selling_price, stock_quantity').eq('is_active', true),
      supabase.from('customers').select('id, name, phone, address, address2, city, state, pincode, balance, total_revenue').eq('is_active', true).order('name'),
      fetchGodowns(),
    ]);
    setOrders(ordersRes.data || []);
    setProducts(productsRes.data || []);
    setCustomers(customersRes.data || []);
    setGodowns(godownsData);
    if (godownsData.length > 0) {
      setForm(f => ({ ...f, godown_id: f.godown_id || godownsData[0].id }));
    }
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

  const toggleExpand = async (id: string) => {
    const next = new Set(expandedRows);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      if (!rowItems[id]) {
        const { data } = await supabase.from('sales_order_items').select('*').eq('sales_order_id', id);
        setRowItems(prev => ({ ...prev, [id]: data || [] }));
      }
    }
    setExpandedRows(next);
  };

  const addItem = () => setItems(prev => [...prev, { product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '', discount_pct: '0', total_price: 0, godown_id: godowns[0]?.id || '' }]);
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
      next[i].total_price = qty * price * (1 - disc / 100);
      return next;
    });

    // Auto-select best godown when product chosen (pick godown with most stock)
    if (field === 'product_id' && value) {
      const { data: stockRows } = await supabase
        .from('godown_stock')
        .select('godown_id, quantity')
        .eq('product_id', value)
        .gt('quantity', 0)
        .order('quantity', { ascending: false })
        .limit(1);
      const bestGodown = stockRows?.[0]?.godown_id || godowns[0]?.id || '';
      setItems(prev => {
        const next = [...prev];
        next[i] = { ...next[i], godown_id: bestGodown };
        return next;
      });
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
            next[i].total_price = qty * smartRate * (1 - disc / 100);
            return next;
          });
        }
      }
    }
  };

  const getStockForItem = (item: LineItem): number | null => {
    if (!item.product_id) return null;
    if (godownStockMap[item.product_id] !== undefined) {
      return godownStockMap[item.product_id];
    }
    const p = products.find(p => p.id === item.product_id);
    return p ? (p.stock_quantity ?? 0) : null;
  };

  const handleCustomerChange = (id: string) => {
    const c = customers.find(c => c.id === id);
    setForm(f => ({
      ...f,
      customer_id: id,
      customer_name: c?.name || '',
      customer_phone: c?.phone || '',
      customer_address: c?.address || '',
      customer_address2: (c as Customer & { address2?: string })?.address2 || '',
      customer_city: c?.city || '',
      customer_state: c?.state || '',
      customer_pincode: c?.pincode || '',
    }));
  };

  const subtotal = items.reduce((s, i) => s + i.total_price, 0);
  const total = subtotal + (parseFloat(form.courier_charges) || 0) - (parseFloat(form.discount_amount) || 0);

  const handleSave = async () => {
    const soNumber = await nextDocNumber('SO', supabase);
    const { data: so } = await supabase.from('sales_orders').insert({
      so_number: soNumber,
      customer_id: form.customer_id || null,
      customer_name: form.customer_name,
      customer_phone: form.customer_phone,
      customer_address: form.customer_address,
      customer_address2: form.customer_address2,
      customer_city: form.customer_city,
      customer_state: form.customer_state,
      customer_pincode: form.customer_pincode,
      so_date: form.so_date,
      delivery_date: form.delivery_date || null,
      status: 'confirmed',
      subtotal,
      tax_amount: 0,
      courier_charges: parseFloat(form.courier_charges) || 0,
      discount_amount: parseFloat(form.discount_amount) || 0,
      total_amount: total,
      notes: form.notes,
      godown_id: form.godown_id || null,
    }).select().single();

    if (so) {
      await supabase.from('sales_order_items').insert(
        items.filter(i => i.product_name).map(i => ({
          sales_order_id: so.id,
          product_id: i.product_id || null,
          product_name: i.product_name,
          unit: i.unit,
          quantity: parseFloat(i.quantity) || 0,
          unit_price: parseFloat(i.unit_price) || 0,
          discount_pct: parseFloat(i.discount_pct) || 0,
          total_price: i.total_price,
          godown_id: i.godown_id || null,
        }))
      );
    }
    setShowModal(false);
    loadData();
  };

  const handleEdit = async () => {
    if (!editOrder) return;
    await supabase.from('sales_orders').update({
      customer_id: form.customer_id || null,
      customer_name: form.customer_name,
      customer_phone: form.customer_phone,
      customer_address: form.customer_address,
      customer_address2: form.customer_address2,
      customer_city: form.customer_city,
      customer_state: form.customer_state,
      customer_pincode: form.customer_pincode,
      so_date: form.so_date,
      delivery_date: form.delivery_date || null,
      courier_charges: parseFloat(form.courier_charges) || 0,
      discount_amount: parseFloat(form.discount_amount) || 0,
      subtotal,
      total_amount: total,
      notes: form.notes,
    }).eq('id', editOrder.id);
    await supabase.from('sales_order_items').delete().eq('sales_order_id', editOrder.id);
    await supabase.from('sales_order_items').insert(
      items.filter(i => i.product_name).map(i => ({
        sales_order_id: editOrder.id,
        product_id: i.product_id || null,
        product_name: i.product_name,
        unit: i.unit,
        quantity: parseFloat(i.quantity) || 0,
        unit_price: parseFloat(i.unit_price) || 0,
        discount_pct: parseFloat(i.discount_pct) || 0,
        total_price: i.total_price,
      }))
    );
    setShowModal(false);
    setEditOrder(null);
    loadData();
  };

  const openEdit = async (order: SalesOrder) => {
    const { data: existingItems } = await supabase.from('sales_order_items').select('*').eq('sales_order_id', order.id);
    setEditOrder(order);
    setForm({
      customer_id: order.customer_id || '',
      customer_name: order.customer_name,
      customer_phone: order.customer_phone || '',
      customer_address: order.customer_address || '',
      customer_address2: order.customer_address2 || '',
      customer_city: order.customer_city || '',
      customer_state: order.customer_state || '',
      customer_pincode: order.customer_pincode || '',
      so_date: order.so_date,
      delivery_date: order.delivery_date || '',
      courier_charges: String(order.courier_charges || 0),
      discount_amount: String(order.discount_amount || 0),
      notes: order.notes || '',
    });
    setItems(
      existingItems && existingItems.length > 0
        ? existingItems.map(i => ({
            product_id: i.product_id || '',
            product_name: i.product_name,
            unit: i.unit,
            quantity: String(i.quantity),
            unit_price: String(i.unit_price),
            discount_pct: String(i.discount_pct || 0),
            total_price: i.total_price,
            godown_id: (i as Record<string,string>).godown_id || '',
          }))
        : [{ product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '', discount_pct: '0', total_price: 0, godown_id: godowns[0]?.id || '' }]
    );
    setShowModal(true);
  };

  const openView = async (order: SalesOrder) => {
    const { data: itemsData } = await supabase.from('sales_order_items').select('*').eq('sales_order_id', order.id);
    setViewOrder(order);
    setViewItems(itemsData || []);
    setShowViewModal(true);
  };

  const openSOPrint = async (order: SalesOrder) => {
    const { data: itemsData } = await supabase.from('sales_order_items').select('*').eq('sales_order_id', order.id);
    setPrintOrder(order);
    setPrintItems((itemsData || []) as SalesOrderItem[]);
    // detect company from first product
    const firstProdId = (itemsData || []).find(i => i.product_id)?.product_id;
    if (firstProdId) {
      const { data: prod } = await supabase.from('products').select('company_id').eq('id', firstProdId).maybeSingle();
      if (prod?.company_id) {
        const cos = await fetchCompanies();
        setPrintCompany(cos.find(c => c.id === prod.company_id) || undefined);
      } else { setPrintCompany(undefined); }
    } else { setPrintCompany(undefined); }
    setShowPrint(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const soId = deleteTarget.id;

      // 1. Delete invoice items + invoices linked to this SO
      const { data: linkedInvs } = await supabase
        .from('invoices').select('id').eq('sales_order_id', soId);
      for (const inv of (linkedInvs || [])) {
        await supabase.from('invoice_items').delete().eq('invoice_id', inv.id);
        await supabase.from('invoices').delete().eq('id', inv.id);
      }

      // 2. Delete DC items + delivery challans linked to this SO
      const { data: linkedDCs } = await supabase
        .from('delivery_challans').select('id').eq('sales_order_id', soId);
      for (const dc of (linkedDCs || [])) {
        await supabase.from('delivery_challan_items').delete().eq('delivery_challan_id', dc.id);
        await supabase.from('delivery_challans').delete().eq('id', dc.id);
      }

      // 3. Delete SO items + SO itself (FK now SET NULL on children)
      await supabase.from('sales_order_items').delete().eq('sales_order_id', soId);
      await supabase.from('sales_orders').delete().eq('id', soId);

    } finally {
      setDeleting(false);
      setDeleteTarget(null);
      setLinkedInfo(null);
      loadData();
    }
  };

  // Check what's linked before showing confirm
  const initiateDelete = async (o: SalesOrder) => {
    const [invRes, dcRes] = await Promise.all([
      supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('sales_order_id', o.id),
      supabase.from('delivery_challans').select('id', { count: 'exact', head: true }).eq('sales_order_id', o.id),
    ]);
    setLinkedInfo({ invoices: invRes.count || 0, challans: dcRes.count || 0 });
    setDeleteTarget(o);
    setShowConfirm(true);
  };

  const handleExportCSV = () => {
    exportToCSV(
      filtered.map(o => ({
        'SO Number': o.so_number,
        'Customer': o.customer_name,
        'Phone': o.customer_phone || '',
        'Date': o.so_date,
        'Delivery Date': o.delivery_date || '',
        'Subtotal': o.subtotal,
        'Courier Charges': o.courier_charges || 0,
        'Discount': o.discount_amount || 0,
        'Total Amount': o.total_amount,
        'Status': o.status,
        'Notes': o.notes || '',
      })),
      'sales-orders'
    );
  };

  const createInvoiceFromSO = async (order: SalesOrder) => {
    setConverting(order.id);
    try {
      let soItems = rowItems[order.id];
      if (!soItems) {
        const { data } = await supabase.from('sales_order_items').select('*').eq('sales_order_id', order.id);
        soItems = data || [];
        setRowItems(prev => ({ ...prev, [order.id]: soItems }));
      }

      const { data: inv } = await supabase.from('invoices').insert({
        invoice_number: await nextDocNumber('INV', supabase),
        sales_order_id: order.id,
        customer_id: order.customer_id || null,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        customer_address: order.customer_address,
        invoice_date: new Date().toISOString().split('T')[0],
        status: 'sent',
        subtotal: order.subtotal,
        tax_amount: order.tax_amount,
        courier_charges: order.courier_charges,
        discount_amount: order.discount_amount,
        total_amount: order.total_amount,
        paid_amount: 0,
        outstanding_amount: order.total_amount,
        payment_terms: 'Due on receipt',
      }).select().single();

      if (inv) {
        await supabase.from('invoice_items').insert(
          soItems.map(i => ({
            invoice_id: inv.id,
            product_id: i.product_id || null,
            product_name: i.product_name,
            unit: i.unit,
            quantity: i.quantity,
            unit_price: i.unit_price,
            discount_pct: i.discount_pct,
            tax_pct: 0,
            total_price: i.total_price,
          }))
        );

        for (const item of soItems) {
          if (item.product_id) {
            const prod = products.find(p => p.id === item.product_id);
            if (prod) {
              const newQty = Math.max(0, (prod.stock_quantity || 0) - item.quantity);
              await supabase.from('products').update({ stock_quantity: newQty, updated_at: new Date().toISOString() }).eq('id', item.product_id);
              await supabase.from('stock_movements').insert({
                product_id: item.product_id,
                movement_type: 'out',
                quantity: item.quantity,
                reference_type: 'invoice',
                reference_id: inv.id,
                notes: `Invoice ${inv.invoice_number} for ${order.customer_name}`,
              });
            }
          }
        }

        if (order.customer_id) {
          const { data: cust } = await supabase.from('customers').select('balance, total_revenue').eq('id', order.customer_id).maybeSingle();
          if (cust) {
            await supabase.from('customers').update({
              balance: (cust.balance || 0) + order.total_amount,
              total_revenue: (cust.total_revenue || 0) + order.total_amount,
              last_interaction: new Date().toISOString(),
            }).eq('id', order.customer_id);
          }
        }

        await supabase.from('sales_orders').update({ status: 'invoiced' }).eq('id', order.id);
        onNavigate('invoices');
      }
    } finally {
      setConverting(null);
    }
  };

  const createChallanFromSO = async (order: SalesOrder) => {
    setConverting(order.id);
    try {
      let soItems = rowItems[order.id];
      if (!soItems) {
        const { data } = await supabase.from('sales_order_items').select('*').eq('sales_order_id', order.id);
        soItems = data || [];
        setRowItems(prev => ({ ...prev, [order.id]: soItems }));
      }

      const { data: dc } = await supabase.from('delivery_challans').insert({
        challan_number: await nextDocNumber('DC', supabase),
        sales_order_id: order.id,
        customer_id: order.customer_id || null,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        customer_address: order.customer_address,
        challan_date: new Date().toISOString().split('T')[0],
        dispatch_mode: 'Courier',
        status: 'dispatched',
      }).select().single();

      if (dc) {
        await supabase.from('delivery_challan_items').insert(
          soItems.map(i => ({
            delivery_challan_id: dc.id,
            product_id: i.product_id || null,
            product_name: i.product_name,
            unit: i.unit,
            quantity: i.quantity,
          }))
        );

        await supabase.from('sales_orders').update({ status: 'dispatched' }).eq('id', order.id);
        onNavigate('challans');
      }
    } finally {
      setConverting(null);
    }
  };

  const filtered = orders.filter(o =>
    o.so_date >= dateRange.from &&
    o.so_date <= dateRange.to &&
    (o.so_number.toLowerCase().includes(search.toLowerCase()) ||
    o.customer_name.toLowerCase().includes(search.toLowerCase()))
  );

  const statusColors: Record<string, string> = {
    draft: 'text-neutral-500',
    confirmed: 'text-blue-600',
    invoiced: 'text-primary-600',
    dispatched: 'text-amber-600',
    delivered: 'text-success-600',
    cancelled: 'text-error-600',
  };

  const totalValue = orders.reduce((s, o) => s + o.total_amount, 0);
  const pendingOrders = orders.filter(o => o.status === 'confirmed').length;

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="bg-white border-b border-neutral-100 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">Sales Orders</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Create orders and convert to invoices or challans</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search orders..." className="input pl-8 w-52 text-xs" />
          </div>
          <button onClick={handleExportCSV} className="btn-secondary flex items-center gap-1.5 text-xs">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
          <button onClick={() => {
            setEditOrder(null);
            setForm({ customer_id: '', customer_name: '', customer_phone: '', customer_address: '', customer_address2: '', customer_city: '', customer_state: '', customer_pincode: '', so_date: new Date().toISOString().split('T')[0], delivery_date: '', courier_charges: '0', discount_amount: '0', notes: '', godown_id: godowns[0]?.id || '' });
            setGodownStockMap({});
            setItems([{ product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '', discount_pct: '0', total_price: 0 }]);
            setShowModal(true);
          }} className="btn-primary">
            <Plus className="w-4 h-4" /> New Order
          </button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="card">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Total Orders</p>
            <p className="text-2xl font-bold text-neutral-900 mt-1">{orders.length}</p>
          </div>
          <div className="card">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Pending Confirmation</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{pendingOrders}</p>
          </div>
          <div className="card">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Total Value</p>
            <p className="text-2xl font-bold text-neutral-900 mt-1">{formatCurrency(totalValue)}</p>
          </div>
        </div>

        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-neutral-50 border-b border-neutral-100">
              <tr>
                <th className="table-header w-8" />
                <th className="table-header text-left">SO #</th>
                <th className="table-header text-left">Customer</th>
                <th className="table-header text-left">Date</th>
                <th className="table-header text-left">Delivery</th>
                <th className="table-header text-right">Amount</th>
                <th className="table-header text-left">Status</th>
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <React.Fragment key={o.id}>
                  <tr className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                    <td className="table-cell w-8">
                      <button onClick={() => toggleExpand(o.id)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-neutral-200">
                        {expandedRows.has(o.id) ? <ChevronDown className="w-3.5 h-3.5 text-neutral-500" /> : <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />}
                      </button>
                    </td>
                    <td className="table-cell font-medium text-primary-700">{o.so_number}</td>
                    <td className="table-cell">
                      <p className="font-medium">{o.customer_name}</p>
                      <p className="text-xs text-neutral-400">{o.customer_phone}</p>
                    </td>
                    <td className="table-cell text-neutral-500">{formatDate(o.so_date)}</td>
                    <td className="table-cell text-neutral-500">{o.delivery_date ? formatDate(o.delivery_date) : '-'}</td>
                    <td className="table-cell text-right font-semibold">{formatCurrency(o.total_amount)}</td>
                    <td className="table-cell">
                      <span className={`text-xs font-semibold capitalize ${statusColors[o.status] || 'text-neutral-500'}`}>{o.status}</span>
                    </td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-1">
                        {(o.status === 'confirmed' || o.status === 'draft') && (
                          <>
                            <button
                              onClick={() => createInvoiceFromSO(o)}
                              disabled={converting === o.id}
                              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-primary-50 text-primary-700 hover:bg-primary-100 disabled:opacity-50 transition-colors"
                            >
                              <Receipt className="w-3 h-3" /> Invoice
                            </button>
                            <button
                              onClick={() => createChallanFromSO(o)}
                              disabled={converting === o.id}
                              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors"
                            >
                              <Truck className="w-3 h-3" /> Challan
                            </button>
                          </>
                        )}
                        <button onClick={() => openView(o)} title="View" className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"><Eye className="w-3.5 h-3.5" /></button>
                        <button onClick={() => openSOPrint(o)} title="Print Proforma" className="p-1.5 rounded-lg text-neutral-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"><Printer className="w-3.5 h-3.5" /></button>
                        {o.status !== 'cancelled' && (
                          <button onClick={() => openEdit(o)} title="Edit" className="p-1.5 rounded-lg text-neutral-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                        )}
                        <button onClick={() => initiateDelete(o)} title="Delete" className="p-1.5 rounded-lg text-neutral-400 hover:text-error-600 hover:bg-error-50 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                  {expandedRows.has(o.id) && (
                    <tr key={`${o.id}-items`} className="bg-neutral-50 border-b border-neutral-100">
                      <td colSpan={8} className="px-10 py-3">
                        {rowItems[o.id] ? (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-neutral-400 uppercase text-[10px]">
                                <th className="text-left pb-1 font-semibold tracking-wider">Product</th>
                                <th className="text-right pb-1 font-semibold tracking-wider w-16">Qty</th>
                                <th className="text-right pb-1 font-semibold tracking-wider w-20">Unit Price</th>
                                <th className="text-right pb-1 font-semibold tracking-wider w-16">Disc%</th>
                                <th className="text-right pb-1 font-semibold tracking-wider w-24">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rowItems[o.id].map((item, idx) => (
                                <tr key={idx} className="border-t border-neutral-200">
                                  <td className="py-1.5 text-neutral-700 font-medium">{item.product_name}</td>
                                  <td className="py-1.5 text-right text-neutral-600">{item.quantity} {item.unit}</td>
                                  <td className="py-1.5 text-right text-neutral-600">{formatCurrency(item.unit_price)}</td>
                                  <td className="py-1.5 text-right text-neutral-500">{item.discount_pct}%</td>
                                  <td className="py-1.5 text-right font-semibold text-neutral-800">{formatCurrency(item.total_price)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="text-xs text-neutral-400">Loading...</p>
                        )}
                        {o.notes && <p className="mt-2 text-xs text-neutral-500 italic">Note: {o.notes}</p>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <EmptyState icon={FileText} title="No sales orders" description="Create your first sales order." />}
        </div>
      </div>

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditOrder(null); }} title={editOrder ? `Edit Sales Order — ${editOrder.so_number}` : 'New Sales Order'} size="xl"
        footer={
          <>
            <button onClick={() => { setShowModal(false); setEditOrder(null); }} className="btn-secondary">Cancel</button>
            <button onClick={editOrder ? handleEdit : handleSave} className="btn-primary">{editOrder ? 'Save Changes' : 'Create Order'}</button>
          </>
        }>
        <div className="space-y-3">
          {/* Row 1: Order meta — 4 fields in one line */}
          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="label">Customer</label>
              <select value={form.customer_id} onChange={e => handleCustomerChange(e.target.value)} className="input text-xs">
                <option value="">-- Select --</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Customer Name *</label>
              <input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} className="input text-xs" placeholder="Full name" />
            </div>
            <div>
              <label className="label">SO Date</label>
              <input type="date" value={form.so_date} onChange={e => setForm(f => ({ ...f, so_date: e.target.value }))} className="input text-xs" />
            </div>
            <div>
              <label className="label">Delivery Date</label>
              <input type="date" value={form.delivery_date} onChange={e => setForm(f => ({ ...f, delivery_date: e.target.value }))} className="input text-xs" />
            </div>
          </div>
          {/* Row 2: Address across full width */}
          <div className="grid grid-cols-4 gap-2">
            <div className="col-span-2">
              <label className="label">Address Line 1</label>
              <input value={form.customer_address} onChange={e => setForm(f => ({ ...f, customer_address: e.target.value }))} className="input text-xs" placeholder="Street / House No." />
            </div>
            <div className="col-span-2">
              <label className="label">Address Line 2</label>
              <input value={form.customer_address2} onChange={e => setForm(f => ({ ...f, customer_address2: e.target.value }))} className="input text-xs" placeholder="Area / Landmark" />
            </div>
            <div>
              <label className="label">City</label>
              <input value={form.customer_city} onChange={e => setForm(f => ({ ...f, customer_city: e.target.value }))} className="input text-xs" placeholder="City" />
            </div>
            <div>
              <label className="label">State</label>
              <input value={form.customer_state} onChange={e => setForm(f => ({ ...f, customer_state: e.target.value }))} className="input text-xs" placeholder="State" />
            </div>
            <div>
              <label className="label">PIN</label>
              <input value={form.customer_pincode} onChange={e => setForm(f => ({ ...f, customer_pincode: e.target.value }))} className="input text-xs" placeholder="PIN" maxLength={6} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} className="input text-xs" placeholder="+91..." />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-neutral-700">Items</p>
              <button onClick={addItem} className="btn-ghost text-xs"><Plus className="w-3.5 h-3.5" /> Add Item</button>
            </div>
            <div className="border border-neutral-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="table-header text-left">Product</th>
                    <th className="table-header text-left w-32">Godown</th>
                    <th className="table-header text-right w-16">Qty</th>
                    <th className="table-header text-right w-24">Price</th>
                    <th className="table-header text-right w-16">Disc%</th>
                    <th className="table-header text-right w-24">Total</th>
                    <th className="table-header w-8" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const stock = getStockForItem(item);
                    const qty = parseFloat(item.quantity) || 0;
                    const overStock = stock !== null && qty > stock;
                    return (
                      <tr key={i} className="border-t border-neutral-100">
                        <td className="px-3 py-2">
                          <select value={item.product_id} onChange={e => updateItem(i, 'product_id', e.target.value)} className="input text-xs">
                            <option value="">-- Select Product --</option>
                            {products.map(p => {
                              const stockQty = form.godown_id && godownStockMap[p.id] !== undefined
                                ? godownStockMap[p.id]
                                : p.stock_quantity;
                              return <option key={p.id} value={p.id}>{p.name} (Stock: {stockQty})</option>;
                            })}
                          </select>
                          {!item.product_id && <input value={item.product_name} onChange={e => updateItem(i, 'product_name', e.target.value)} className="input text-xs mt-1" placeholder="Or type name..." />}
                        </td>
                        <td className="px-3 py-2 w-32">
                          <select value={item.godown_id} onChange={e => {
                            const gid = e.target.value;
                            setItems(prev => { const next=[...prev]; next[i]={...next[i], godown_id: gid}; return next; });
                            if (gid && item.product_id) loadGodownStock(gid, [item.product_id]);
                          }} className="input text-xs py-1">
                            {godowns.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                          {item.product_id && (() => {
                            const s = godownStockMap[item.product_id];
                            return s !== undefined ? (
                              <p className={`text-[10px] mt-0.5 text-right font-medium ${s === 0 ? 'text-error-600' : s <= (products.find(p=>p.id===item.product_id)?.low_stock_alert||5) ? 'text-warning-600' : 'text-success-600'}`}>
                                {s} in stock
                              </p>
                            ) : null;
                          })()}
                        </td>
                        <td className="px-3 py-2 w-20">
                          <input type="number" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} className="input text-xs text-right" />

                        </td>
                        <td className="px-3 py-2 w-24"><input type="number" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)} className="input text-xs text-right" /></td>
                        <td className="px-3 py-2 w-16"><input type="number" value={item.discount_pct} onChange={e => updateItem(i, 'discount_pct', e.target.value)} className="input text-xs text-right" /></td>
                        <td className="px-3 py-2 w-24 text-right text-sm font-medium">{formatCurrency(item.total_price)}</td>
                        <td className="px-3 py-2 w-8"><button onClick={() => removeItem(i)} className="text-neutral-400 hover:text-error-500 text-lg leading-none">&times;</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end mt-3 gap-4">
              <div className="flex items-center gap-2">
                <label className="label mb-0">Courier</label>
                <input type="number" value={form.courier_charges} onChange={e => setForm(f => ({ ...f, courier_charges: e.target.value }))} className="input w-24 text-right text-xs" />
              </div>
              <div className="flex items-center gap-2">
                <label className="label mb-0">Discount</label>
                <input type="number" value={form.discount_amount} onChange={e => setForm(f => ({ ...f, discount_amount: e.target.value }))} className="input w-24 text-right text-xs" />
              </div>
              <div className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-bold">
                Total: {formatCurrency(total)}
              </div>
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input resize-none h-16" />
          </div>
        </div>
      </Modal>

      <Modal isOpen={showViewModal} onClose={() => { setShowViewModal(false); setViewOrder(null); }} title={viewOrder ? `Sales Order — ${viewOrder.so_number}` : ''} size="xl"
        footer={
          <div className="flex items-center gap-3">
            <button onClick={() => { setShowViewModal(false); setViewOrder(null); }} className="btn-secondary">Close</button>
            {viewOrder && (
              <button onClick={() => { setShowViewModal(false); openSOPrint(viewOrder); }} className="btn-primary flex items-center gap-1.5">
                <Printer className="w-3.5 h-3.5" /> Print Proforma
              </button>
            )}
          </div>
        }>
        {viewOrder && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Customer</p>
                <p className="font-medium text-neutral-900">{viewOrder.customer_name}</p>
                {viewOrder.customer_phone && <p className="text-xs text-neutral-500">{viewOrder.customer_phone}</p>}
              </div>
              <div>
                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Status</p>
                <StatusBadge status={viewOrder.status} />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">SO Date</p>
                <p className="text-neutral-700">{formatDate(viewOrder.so_date)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Delivery Date</p>
                <p className="text-neutral-700">{viewOrder.delivery_date ? formatDate(viewOrder.delivery_date) : '-'}</p>
              </div>
              {viewOrder.customer_address && (
                <div className="col-span-2">
                  <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Delivery Address</p>
                  <p className="text-neutral-700">{viewOrder.customer_address}</p>
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-neutral-700 mb-2">Items</p>
              <div className="border border-neutral-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="table-header text-left">Product</th>
                      <th className="table-header text-right w-20">Qty</th>
                      <th className="table-header text-right w-24">Unit Price</th>
                      <th className="table-header text-right w-16">Disc%</th>
                      <th className="table-header text-right w-24">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewItems.map((item, idx) => (
                      <tr key={idx} className="border-t border-neutral-100">
                        <td className="table-cell font-medium">{item.product_name}</td>
                        <td className="table-cell text-right">{item.quantity} {item.unit}</td>
                        <td className="table-cell text-right">{formatCurrency(item.unit_price)}</td>
                        <td className="table-cell text-right">{item.discount_pct}%</td>
                        <td className="table-cell text-right font-semibold">{formatCurrency(item.total_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end">
              <div className="space-y-1 text-sm min-w-[200px]">
                <div className="flex justify-between gap-8 text-neutral-600">
                  <span>Subtotal</span>
                  <span>{formatCurrency(viewOrder.subtotal)}</span>
                </div>
                {(viewOrder.courier_charges || 0) > 0 && (
                  <div className="flex justify-between gap-8 text-neutral-600">
                    <span>Courier</span>
                    <span>{formatCurrency(viewOrder.courier_charges || 0)}</span>
                  </div>
                )}
                {(viewOrder.discount_amount || 0) > 0 && (
                  <div className="flex justify-between gap-8 text-neutral-600">
                    <span>Discount</span>
                    <span>- {formatCurrency(viewOrder.discount_amount || 0)}</span>
                  </div>
                )}
                <div className="flex justify-between gap-8 font-bold text-neutral-900 border-t border-neutral-200 pt-1 mt-1">
                  <span>Total</span>
                  <span>{formatCurrency(viewOrder.total_amount)}</span>
                </div>
              </div>
            </div>

            {viewOrder.notes && (
              <div>
                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1">Notes</p>
                <p className="text-sm text-neutral-600 italic">{viewOrder.notes}</p>
              </div>
            )}

            <div id={`proforma-${viewOrder.id}`} style={{ display: 'none' }}>
              <div className="header">
                <div>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a' }}>PROFORMA INVOICE</h2>
                  <p style={{ color: '#666', fontSize: 13 }}>{viewOrder.so_number}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p className="label">Date</p>
                  <p className="value">{formatDate(viewOrder.so_date)}</p>
                  {viewOrder.delivery_date && <>
                    <p className="label" style={{ marginTop: 6 }}>Expected Delivery</p>
                    <p className="value">{formatDate(viewOrder.delivery_date)}</p>
                  </>}
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <p className="label">Bill To</p>
                <p className="value">{viewOrder.customer_name}</p>
                {viewOrder.customer_phone && <p style={{ fontSize: 12, color: '#555' }}>{viewOrder.customer_phone}</p>}
                {viewOrder.customer_address && <p style={{ fontSize: 12, color: '#555' }}>{viewOrder.customer_address}{viewOrder.customer_city ? `, ${viewOrder.customer_city}` : ''}</p>}
              </div>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Unit Price</th>
                    <th style={{ textAlign: 'right' }}>Disc%</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {viewItems.map((item, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td>{item.product_name}</td>
                      <td style={{ textAlign: 'right' }}>{item.quantity} {item.unit}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(item.unit_price)}</td>
                      <td style={{ textAlign: 'right' }}>{item.discount_pct}%</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(item.total_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="total-section">
                <p>Subtotal: {formatCurrency(viewOrder.subtotal)}</p>
                {(viewOrder.courier_charges || 0) > 0 && <p>Courier: {formatCurrency(viewOrder.courier_charges || 0)}</p>}
                {(viewOrder.discount_amount || 0) > 0 && <p>Discount: -{formatCurrency(viewOrder.discount_amount || 0)}</p>}
                <p className="total">TOTAL: {formatCurrency(viewOrder.total_amount)}</p>
              </div>
              {viewOrder.notes && <p style={{ marginTop: 16, color: '#555', fontSize: 12 }}>Notes: {viewOrder.notes}</p>}
              <div className="footer">
                <p>This is a Proforma Invoice and not a tax invoice. Subject to change until final invoice is issued.</p>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {showConfirm && deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !deleting && setShowConfirm(false)} />
          <div className="relative bg-white rounded-2xl shadow-card-lg w-full max-w-sm p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-error-50 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-error-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">Delete Sales Order</h3>
                <p className="text-sm text-neutral-500 mt-1">
                  Delete <span className="font-semibold text-neutral-800">{deleteTarget.so_number}</span>?
                </p>
                {linkedInfo && (linkedInfo.invoices > 0 || linkedInfo.challans > 0) && (
                  <div className="mt-2 p-2.5 bg-warning-50 border border-warning-200 rounded-lg">
                    <p className="text-xs font-semibold text-warning-700 mb-1">⚠️ This will also delete:</p>
                    <ul className="text-xs text-warning-600 space-y-0.5">
                      {linkedInfo.invoices > 0 && <li>• {linkedInfo.invoices} linked invoice{linkedInfo.invoices > 1 ? 's' : ''}</li>}
                      {linkedInfo.challans > 0 && <li>• {linkedInfo.challans} delivery challan{linkedInfo.challans > 1 ? 's' : ''}</li>}
                    </ul>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowConfirm(false); setDeleteTarget(null); setLinkedInfo(null); }} disabled={deleting} className="btn-secondary text-xs">Cancel</button>
              <button onClick={handleDelete} disabled={deleting}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-error-600 hover:bg-error-700 disabled:opacity-60 transition-colors flex items-center gap-1.5">
                {deleting ? <><div className="w-3 h-3 border-2 border-white/60 border-t-white rounded-full animate-spin" /> Deleting...</> : <><Trash2 className="w-3 h-3" /> Delete All</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-screen print preview — same UX as Invoice */}
      {showPrint && printOrder && (
        <div className="fixed inset-0 z-50 bg-neutral-100 overflow-auto">
          <div className="no-print flex items-center justify-between bg-white border-b border-neutral-200 px-5 py-3">
            <p className="text-sm font-semibold text-neutral-800">Proforma — {printOrder.so_number}</p>
            <div className="flex gap-2">
              <button onClick={() => window.print()} className="btn-primary"><Printer className="w-3.5 h-3.5" /> Print / Save PDF</button>
              <button onClick={() => setShowPrint(false)} className="btn-secondary">Close</button>
            </div>
          </div>
          <div className="py-6 print-content">
            <SalesOrderPrint order={printOrder} items={printItems} companyOverride={printCompany} />
          </div>
        </div>
      )}
    </div>
  );
}
