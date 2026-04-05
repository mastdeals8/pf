import React, { useState, useEffect } from 'react';
import { Plus, Search, FileText, ChevronDown, ChevronRight, Receipt, Truck, Download, Eye, Pencil, Trash2, Printer, Send, Warehouse } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatDate, generateId, exportToCSV } from '../../lib/utils';
import Modal from '../../components/ui/Modal';
import StatusBadge from '../../components/ui/StatusBadge';
import EmptyState from '../../components/ui/EmptyState';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { useDateRange } from '../../contexts/DateRangeContext';
import { getSmartRate } from '../../lib/rateCardService';
import { fetchGodowns, getGodownStockForProduct } from '../../services/godownService';
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

  const [form, setForm] = useState({
    customer_id: '', customer_name: '', customer_phone: '',
    customer_address: '', customer_address2: '', customer_city: '', customer_state: '', customer_pincode: '',
    so_date: new Date().toISOString().split('T')[0], delivery_date: '',
    courier_charges: '0', discount_amount: '0', notes: '',
    godown_id: '',
  });
  const [items, setItems] = useState<LineItem[]>([{ product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '', discount_pct: '0', total_price: 0 }]);

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

  const addItem = () => setItems(prev => [...prev, { product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '', discount_pct: '0', total_price: 0 }]);
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

    if (field === 'product_id' && value && form.godown_id) {
      loadGodownStock(form.godown_id, [...items.map(it => it.product_id), value]);
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
    if (form.godown_id && godownStockMap[item.product_id] !== undefined) {
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
    const soNumber = generateId('SO');
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
          }))
        : [{ product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '', discount_pct: '0', total_price: 0 }]
    );
    setShowModal(true);
  };

  const openView = async (order: SalesOrder) => {
    const { data: itemsData } = await supabase.from('sales_order_items').select('*').eq('sales_order_id', order.id);
    setViewOrder(order);
    setViewItems(itemsData || []);
    setShowViewModal(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from('sales_orders').update({ status: 'cancelled' }).eq('id', deleteTarget.id);
    setDeleteTarget(null);
    loadData();
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
        invoice_number: generateId('INV'),
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
        challan_number: generateId('DC'),
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
                        <button onClick={() => openView(o)} title="View / Print Proforma" className="p-1.5 rounded-lg text-neutral-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"><Eye className="w-3.5 h-3.5" /></button>
                        {(o.status === 'confirmed' || o.status === 'draft') && (
                          <button onClick={() => openEdit(o)} title="Edit" className="p-1.5 rounded-lg text-neutral-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                        )}
                        <button onClick={() => { setDeleteTarget(o); setShowConfirm(true); }} title="Cancel" className="p-1.5 rounded-lg text-neutral-400 hover:text-error-600 hover:bg-error-50 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
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
          {/* Row 1: Customer + Name + Phone */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Customer</label>
              <select value={form.customer_id} onChange={e => handleCustomerChange(e.target.value)} className="input">
                <option value="">-- Select --</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Customer Name *</label>
              <input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} className="input" placeholder="Full name" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} className="input" placeholder="+91 XXXXX XXXXX" />
            </div>
          </div>
          {/* Row 2: Godown + SO Date + Delivery Date */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label flex items-center gap-1"><Warehouse className="w-3 h-3 text-neutral-400" /> Dispatch Godown</label>
              <select
                value={form.godown_id}
                onChange={e => {
                  setForm(f => ({ ...f, godown_id: e.target.value }));
                  if (e.target.value) loadGodownStock(e.target.value, items.map(i => i.product_id));
                }}
                className="input"
              >
                <option value="">-- Select Godown --</option>
                {godowns.map(g => <option key={g.id} value={g.id}>{g.name}{g.location ? ` (${g.location})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="label">SO Date</label>
              <input type="date" value={form.so_date} onChange={e => setForm(f => ({ ...f, so_date: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Delivery Date</label>
              <input type="date" value={form.delivery_date} onChange={e => setForm(f => ({ ...f, delivery_date: e.target.value }))} className="input" />
            </div>
          </div>
          {/* Row 3: Address inline */}
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-2">
              <label className="label">Address</label>
              <input value={form.customer_address} onChange={e => setForm(f => ({ ...f, customer_address: e.target.value }))} className="input" placeholder="Street / House No., Area / Landmark" />
            </div>
            <div>
              <label className="label">City</label>
              <input value={form.customer_city} onChange={e => setForm(f => ({ ...f, customer_city: e.target.value }))} className="input" placeholder="City" />
            </div>
            <div>
              <label className="label">State / PIN</label>
              <div className="flex gap-1">
                <input value={form.customer_state} onChange={e => setForm(f => ({ ...f, customer_state: e.target.value }))} className="input" placeholder="State" />
                <input value={form.customer_pincode} onChange={e => setForm(f => ({ ...f, customer_pincode: e.target.value }))} className="input w-20" placeholder="PIN" />
              </div>
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
                        <td className="px-3 py-2 w-20">
                          <input type="number" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} className="input text-xs text-right" />
                          {overStock && (
                            <p className="text-[10px] text-amber-600 mt-0.5 text-right">
                              ({form.godown_id ? 'Only' : 'Only'} {stock} {form.godown_id ? 'in godown' : 'in stock'})
                            </p>
                          )}
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
              <button onClick={() => {
                setShowViewModal(false);
                window.setTimeout(() => {
                  const printContent = document.getElementById(`proforma-${viewOrder.id}`);
                  if (printContent) {
                    const w = window.open('', '_blank');
                    if (w) {
                      w.document.write(`<html><head><title>Proforma Invoice - ${viewOrder.so_number}</title><style>body{font-family:sans-serif;padding:20px;color:#333}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}h2{margin:0}.header{display:flex;justify-content:space-between;margin-bottom:20px}.label{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px}.value{font-size:13px;font-weight:600}.badge{background:#e8f4fd;color:#1565c0;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700}.total-section{margin-top:16px;text-align:right}.total{font-size:16px;font-weight:700}.footer{margin-top:24px;padding-top:12px;border-top:1px solid #eee;text-align:center;color:#666;font-size:11px}</style></head><body>${printContent.innerHTML}</body></html>`);
                      w.document.close();
                      w.print();
                    }
                  }
                }, 100);
              }} className="btn-primary flex items-center gap-1.5">
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

      <ConfirmDialog
        isOpen={showConfirm}
        onClose={() => { setShowConfirm(false); setDeleteTarget(null); }}
        onConfirm={handleDelete}
        title="Cancel Sales Order"
        message={`Are you sure you want to cancel order ${deleteTarget?.so_number}? This action cannot be undone.`}
        confirmLabel="Cancel Order"
        isDanger
      />
    </div>
  );
}
