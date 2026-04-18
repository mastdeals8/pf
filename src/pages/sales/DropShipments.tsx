// Deprecated - replaced by B2B Sales Order flow
import { useState, useEffect } from 'react';
import { Plus, Search, ChevronDown, ChevronRight, X, Download, Truck, Building2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatDate, nextDocNumber, exportToCSV } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import ActionMenu, { actionEdit, actionDelete } from '../../components/ui/ActionMenu';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { useDateRange } from '../../contexts/DateRangeContext';
import type { DropShipment, Product, Supplier, Customer } from '../../types';

interface LineItem {
  product_id: string;
  product_name: string;
  unit: string;
  quantity: string;
  unit_price: string;
  total_price: number;
}

const DS_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  supplier_dispatched: 'Dispatched',
  delivered: 'Delivered',
  invoiced: 'Invoiced',
  cancelled: 'Cancelled',
};

const DS_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-neutral-100 text-neutral-600',
  confirmed: 'bg-blue-100 text-blue-700',
  supplier_dispatched: 'bg-warning-100 text-warning-700',
  delivered: 'bg-success-100 text-success-700',
  invoiced: 'bg-teal-100 text-teal-700',
  cancelled: 'bg-error-100 text-error-600',
};

export default function DropShipments() {
  const { isAdmin } = useAuth();
  const { dateRange } = useDateRange();
  const [shipments, setShipments] = useState<DropShipment[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingDS, setEditingDS] = useState<DropShipment | null>(null);
  const [confirmDS, setConfirmDS] = useState<DropShipment | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [rowItems, setRowItems] = useState<Record<string, any[]>>({});

  const [form, setForm] = useState({
    supplier_id: '',
    supplier_name: '',
    customer_id: '',
    customer_name: '',
    customer_phone: '',
    customer_address: '',
    customer_city: '',
    ds_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: '',
    status: 'draft' as DropShipment['status'],
    supplier_invoice_number: '',
    tracking_number: '',
    courier_company: '',
    notes: '',
  });

  const [items, setItems] = useState<LineItem[]>([
    { product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '', total_price: 0 },
  ]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [dsRes, supplierRes, customerRes, productRes] = await Promise.all([
      supabase.from('drop_shipments').select('*').order('created_at', { ascending: false }),
      supabase.from('suppliers').select('*').eq('is_active', true).order('name'),
      supabase.from('customers').select('id, name, phone, address, city, category').eq('is_active', true).eq('category', 'B2B').order('name'),
      supabase.from('products').select('id, name, unit, selling_price').eq('is_active', true),
    ]);
    setShipments((dsRes.data || []) as any);
    setSuppliers((supplierRes.data || []) as any);
    setCustomers((customerRes.data || []) as any);
    setProducts((productRes.data || []) as any);
  };

  const subtotal = items.reduce((s, i) => s + i.total_price, 0);

  const addItem = () => setItems(prev => [...prev, { product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '', total_price: 0 }]);
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i));

  const updateItem = (i: number, field: string, value: string) => {
    setItems(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === 'product_id') {
        const p = products.find(p => p.id === value);
        if (p) { next[i].product_name = p.name; next[i].unit = p.unit; next[i].unit_price = String(p.selling_price); }
      }
      const qty = parseFloat(next[i].quantity) || 0;
      const price = parseFloat(next[i].unit_price) || 0;
      next[i].total_price = qty * price;
      return next;
    });
  };

  const handleSupplierChange = (id: string) => {
    const s = suppliers.find(s => s.id === id);
    setForm(f => ({ ...f, supplier_id: id, supplier_name: s?.name || '' }));
  };

  const handleCustomerChange = (id: string) => {
    const c = customers.find(c => c.id === id);
    setForm(f => ({ ...f, customer_id: id, customer_name: c?.name || '', customer_phone: (c as any)?.phone || '', customer_address: (c as any)?.address || '', customer_city: (c as any)?.city || '' }));
  };

  const openNew = () => {
    setEditingDS(null);
    setForm({ supplier_id: '', supplier_name: '', customer_id: '', customer_name: '', customer_phone: '', customer_address: '', customer_city: '', ds_date: new Date().toISOString().split('T')[0], expected_delivery_date: '', status: 'draft', supplier_invoice_number: '', tracking_number: '', courier_company: '', notes: '' });
    setItems([{ product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '', total_price: 0 }]);
    setShowModal(true);
  };

  const openEdit = async (ds: DropShipment) => {
    setEditingDS(ds);
    setForm({
      supplier_id: ds.supplier_id || '',
      supplier_name: ds.supplier_name,
      customer_id: ds.customer_id || '',
      customer_name: ds.customer_name,
      customer_phone: ds.customer_phone || '',
      customer_address: ds.customer_address || '',
      customer_city: ds.customer_city || '',
      ds_date: ds.ds_date,
      expected_delivery_date: ds.expected_delivery_date || '',
      status: ds.status,
      supplier_invoice_number: ds.supplier_invoice_number || '',
      tracking_number: ds.tracking_number || '',
      courier_company: ds.courier_company || '',
      notes: ds.notes || '',
    });
    const { data } = await supabase.from('drop_shipment_items').select('*').eq('drop_shipment_id', ds.id);
    const loaded = (data || []).map((item: any) => ({
      product_id: item.product_id || '',
      product_name: item.product_name,
      unit: item.unit,
      quantity: String(item.quantity),
      unit_price: String(item.unit_price),
      total_price: item.total_price,
    }));
    setItems(loaded.length ? loaded : [{ product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '', total_price: 0 }]);
    setShowModal(true);
  };

  const handleSave = async () => {
    const payload = {
      supplier_id: form.supplier_id || null,
      supplier_name: form.supplier_name,
      customer_id: form.customer_id || null,
      customer_name: form.customer_name,
      customer_phone: form.customer_phone,
      customer_address: form.customer_address,
      customer_city: form.customer_city,
      ds_date: form.ds_date,
      expected_delivery_date: form.expected_delivery_date || null,
      status: form.status,
      supplier_invoice_number: form.supplier_invoice_number,
      tracking_number: form.tracking_number,
      courier_company: form.courier_company,
      subtotal,
      tax_amount: 0,
      total_amount: subtotal,
      notes: form.notes,
    };
    const itemPayload = items.filter(i => i.product_name).map(i => ({
      product_id: i.product_id || null,
      product_name: i.product_name,
      unit: i.unit,
      quantity: parseFloat(i.quantity) || 0,
      unit_price: parseFloat(i.unit_price) || 0,
      total_price: i.total_price,
    }));

    if (editingDS) {
      await supabase.from('drop_shipments').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingDS.id);
      await supabase.from('drop_shipment_items').delete().eq('drop_shipment_id', editingDS.id);
      await supabase.from('drop_shipment_items').insert(itemPayload.map(i => ({ ...i, drop_shipment_id: editingDS.id })));
    } else {
      const dsNumber = await nextDocNumber('DS', supabase);
      const { data: ds } = await supabase.from('drop_shipments').insert({ ...payload, ds_number: dsNumber }).select().single();
      if (ds) {
        await supabase.from('drop_shipment_items').insert(itemPayload.map(i => ({ ...i, drop_shipment_id: ds.id })));
      }
    }
    setShowModal(false);
    loadData();
  };

  const handleDelete = async (ds: DropShipment) => {
    await supabase.from('drop_shipments').update({ status: 'cancelled' }).eq('id', ds.id);
    loadData();
  };

  const updateStatus = async (ds: DropShipment, status: DropShipment['status']) => {
    await supabase.from('drop_shipments').update({ status, updated_at: new Date().toISOString() }).eq('id', ds.id);
    loadData();
  };

  const toggleExpand = async (id: string) => {
    if (expandedRow === id) { setExpandedRow(null); return; }
    if (!rowItems[id]) {
      const { data } = await supabase.from('drop_shipment_items').select('*').eq('drop_shipment_id', id);
      setRowItems(prev => ({ ...prev, [id]: data || [] }));
    }
    setExpandedRow(id);
  };

  const filtered = shipments.filter(s =>
    s.ds_date >= dateRange.from && s.ds_date <= dateRange.to &&
    (s.supplier_name.toLowerCase().includes(search.toLowerCase()) ||
     s.customer_name.toLowerCase().includes(search.toLowerCase()) ||
     s.ds_number.toLowerCase().includes(search.toLowerCase()))
  );

  const handleExport = () => {
    exportToCSV(filtered.map(s => ({
      ds_number: s.ds_number,
      supplier_name: s.supplier_name,
      customer_name: s.customer_name,
      ds_date: s.ds_date,
      expected_delivery_date: s.expected_delivery_date || '',
      total_amount: s.total_amount,
      status: s.status,
    })), 'drop-shipments');
  };

  const totalActive = shipments.filter(s => !['cancelled', 'invoiced'].includes(s.status)).length;
  const totalValue = shipments.reduce((s, d) => s + d.total_amount, 0);
  const pendingInvoice = shipments.filter(s => s.status === 'delivered').length;

  if (!isAdmin) return null;

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="bg-white border-b border-neutral-100 px-5 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-neutral-900">B2B Drop Shipments</h1>
          <p className="text-xs text-neutral-500">Supplier ships directly to your B2B customer</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="input pl-8 w-44 text-xs" />
          </div>
          <button onClick={handleExport} className="btn-secondary text-xs">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
          <button onClick={openNew} className="btn-primary text-xs">
            <Plus className="w-3.5 h-3.5" /> New Drop Shipment
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-4 gap-3">
          <div className="card">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Active Shipments</p>
            <p className="text-2xl font-bold text-neutral-900 mt-0.5">{totalActive}</p>
            <p className="text-[10px] text-neutral-400 mt-0.5">In progress</p>
          </div>
          <div className="card">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Total Value</p>
            <p className="text-2xl font-bold text-neutral-900 mt-0.5">{formatCurrency(totalValue)}</p>
          </div>
          <div className="card">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Pending Invoice</p>
            <p className={`text-2xl font-bold mt-0.5 ${pendingInvoice > 0 ? 'text-warning-700' : 'text-neutral-900'}`}>{pendingInvoice}</p>
            <p className="text-[10px] text-neutral-400 mt-0.5">Delivered, not invoiced</p>
          </div>
          <div className="card">
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Total Shipments</p>
            <p className="text-2xl font-bold text-neutral-900 mt-0.5">{shipments.length}</p>
          </div>
        </div>

        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-neutral-50 border-b border-neutral-100">
              <tr>
                <th className="table-header w-8" />
                <th className="table-header text-left">DS #</th>
                <th className="table-header text-left">Supplier</th>
                <th className="table-header text-left">B2B Customer</th>
                <th className="table-header text-left">Date</th>
                <th className="table-header text-left">Exp. Delivery</th>
                <th className="table-header text-right">Amount</th>
                <th className="table-header text-left">Status</th>
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(ds => (
                <>
                  <tr key={ds.id} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                    <td className="table-cell">
                      <button onClick={() => toggleExpand(ds.id)} className="text-neutral-400 hover:text-primary-600">
                        {expandedRow === ds.id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                    <td className="table-cell font-medium text-primary-700 text-xs">{ds.ds_number}</td>
                    <td className="table-cell">
                      <p className="text-sm font-medium">{ds.supplier_name || '-'}</p>
                    </td>
                    <td className="table-cell">
                      <p className="text-sm font-medium">{ds.customer_name}</p>
                      {ds.customer_city && <p className="text-[10px] text-neutral-400">{ds.customer_city}</p>}
                    </td>
                    <td className="table-cell text-neutral-500 text-sm">{formatDate(ds.ds_date)}</td>
                    <td className="table-cell text-sm">
                      {ds.expected_delivery_date ? (
                        <span className="text-neutral-600">{formatDate(ds.expected_delivery_date)}</span>
                      ) : <span className="text-neutral-300">-</span>}
                    </td>
                    <td className="table-cell text-right font-semibold">{formatCurrency(ds.total_amount)}</td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1.5">
                        <span className={`badge text-[10px] ${DS_STATUS_COLORS[ds.status] || 'bg-neutral-100 text-neutral-600'}`}>
                          {DS_STATUS_LABELS[ds.status] || ds.status}
                        </span>
                        {ds.status !== 'cancelled' && ds.status !== 'invoiced' && (
                          <select
                            value={ds.status}
                            onChange={e => updateStatus(ds, e.target.value as DropShipment['status'])}
                            className="text-[10px] border border-neutral-200 rounded px-1 py-0.5 bg-white text-neutral-600 cursor-pointer"
                            onClick={e => e.stopPropagation()}
                          >
                            <option value="draft">Draft</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="supplier_dispatched">Dispatched</option>
                            <option value="delivered">Delivered</option>
                            <option value="invoiced">Invoiced</option>
                          </select>
                        )}
                      </div>
                    </td>
                    <td className="table-cell text-right">
                      <ActionMenu items={[
                        actionEdit(() => openEdit(ds)),
                        actionDelete(() => setConfirmDS(ds)),
                      ]} />
                    </td>
                  </tr>
                  {expandedRow === ds.id && rowItems[ds.id] && (
                    <tr key={`${ds.id}-items`}>
                      <td colSpan={9} className="bg-blue-50 px-8 py-3 border-b border-blue-100">
                        <div className="flex gap-8">
                          <div className="flex-1">
                            <table className="w-full">
                              <thead>
                                <tr className="text-[10px] text-neutral-500 uppercase tracking-wider">
                                  <th className="text-left pb-1 font-semibold">Product</th>
                                  <th className="text-right pb-1 font-semibold w-24">Qty</th>
                                  <th className="text-right pb-1 font-semibold w-28">Unit Price</th>
                                  <th className="text-right pb-1 font-semibold w-28">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rowItems[ds.id].map((item: any) => (
                                  <tr key={item.id} className="text-xs">
                                    <td className="py-0.5 text-neutral-800 font-medium">{item.product_name}</td>
                                    <td className="py-0.5 text-right text-neutral-600">{item.quantity} {item.unit}</td>
                                    <td className="py-0.5 text-right text-neutral-600">{formatCurrency(item.unit_price)}</td>
                                    <td className="py-0.5 text-right font-semibold">{formatCurrency(item.total_price)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {(ds.tracking_number || ds.courier_company) && (
                            <div className="text-xs text-neutral-600 min-w-36">
                              {ds.courier_company && <p><span className="font-medium">Courier:</span> {ds.courier_company}</p>}
                              {ds.tracking_number && <p><span className="font-medium">Tracking:</span> {ds.tracking_number}</p>}
                              {ds.supplier_invoice_number && <p><span className="font-medium">Supplier Inv:</span> {ds.supplier_invoice_number}</p>}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <EmptyState icon={Truck} title="No drop shipments yet" description="Create a drop shipment to send goods directly from supplier to customer." />}
        </div>
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingDS ? 'Edit Drop Shipment' : 'New B2B Drop Shipment'} size="xl"
        footer={
          <>
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} className="btn-primary">{editingDS ? 'Update' : 'Create Drop Shipment'}</button>
          </>
        }>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-neutral-400" /> Supplier
              </label>
              <select value={form.supplier_id} onChange={e => handleSupplierChange(e.target.value)} className="input">
                <option value="">-- Select Supplier --</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Supplier Name *</label>
              <input value={form.supplier_name} onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))} className="input" placeholder="Or type name" />
            </div>
            <div>
              <label className="label">Date</label>
              <input type="date" value={form.ds_date} onChange={e => setForm(f => ({ ...f, ds_date: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-neutral-400" /> B2B Customer
              </label>
              <select value={form.customer_id} onChange={e => handleCustomerChange(e.target.value)} className="input">
                <option value="">-- Select B2B Customer --</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Customer Name *</label>
              <input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} className="input" placeholder="Or type name" />
            </div>
            <div>
              <label className="label">Customer Phone</label>
              <input value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Delivery Address</label>
              <input value={form.customer_address} onChange={e => setForm(f => ({ ...f, customer_address: e.target.value }))} className="input" placeholder="Ship-to address" />
            </div>
            <div>
              <label className="label">City</label>
              <input value={form.customer_city} onChange={e => setForm(f => ({ ...f, customer_city: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Expected Delivery</label>
              <input type="date" value={form.expected_delivery_date} onChange={e => setForm(f => ({ ...f, expected_delivery_date: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as DropShipment['status'] }))} className="input">
                <option value="draft">Draft</option>
                <option value="confirmed">Confirmed</option>
                <option value="supplier_dispatched">Supplier Dispatched</option>
                <option value="delivered">Delivered</option>
                <option value="invoiced">Invoiced</option>
              </select>
            </div>
            <div>
              <label className="label">Courier Company</label>
              <input value={form.courier_company} onChange={e => setForm(f => ({ ...f, courier_company: e.target.value }))} className="input" placeholder="Optional" />
            </div>
            <div>
              <label className="label">Tracking Number</label>
              <input value={form.tracking_number} onChange={e => setForm(f => ({ ...f, tracking_number: e.target.value }))} className="input" placeholder="Optional" />
            </div>
            <div>
              <label className="label">Supplier Invoice #</label>
              <input value={form.supplier_invoice_number} onChange={e => setForm(f => ({ ...f, supplier_invoice_number: e.target.value }))} className="input" placeholder="Optional" />
            </div>
            <div className="col-span-2">
              <label className="label">Notes</label>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input" placeholder="Optional" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-neutral-700">Items (No stock deduction — direct supplier delivery)</p>
              <button onClick={addItem} className="btn-ghost text-xs"><Plus className="w-3.5 h-3.5" /> Add Item</button>
            </div>
            <div className="border border-neutral-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="table-header text-left">Product</th>
                    <th className="table-header text-left w-16">Unit</th>
                    <th className="table-header text-right w-20">Qty</th>
                    <th className="table-header text-right w-24">Price (₹)</th>
                    <th className="table-header text-right w-24">Total</th>
                    <th className="table-header w-8" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-t border-neutral-100">
                      <td className="px-3 py-2">
                        <select value={item.product_id} onChange={e => updateItem(i, 'product_id', e.target.value)} className="input text-xs">
                          <option value="">-- Select Product --</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        {!item.product_id && <input value={item.product_name} onChange={e => updateItem(i, 'product_name', e.target.value)} className="input text-xs mt-1" placeholder="Or type name..." />}
                      </td>
                      <td className="px-3 py-2"><input value={item.unit} onChange={e => updateItem(i, 'unit', e.target.value)} className="input text-xs" /></td>
                      <td className="px-3 py-2"><input type="number" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} className="input text-xs text-right" /></td>
                      <td className="px-3 py-2"><input type="number" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)} className="input text-xs text-right" /></td>
                      <td className="px-3 py-2 text-right text-sm font-medium">{formatCurrency(item.total_price)}</td>
                      <td className="px-3 py-2"><button onClick={() => removeItem(i)} className="text-neutral-400 hover:text-error-500"><X className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end mt-2">
              <div className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-bold">
                Total: {formatCurrency(subtotal)}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmDS}
        onClose={() => setConfirmDS(null)}
        onConfirm={() => confirmDS && handleDelete(confirmDS)}
        title="Cancel Drop Shipment"
        message={`Cancel drop shipment ${confirmDS?.ds_number}? This will mark it as cancelled.`}
        confirmLabel="Cancel Shipment"
        isDanger
      />
    </div>
  );
}
