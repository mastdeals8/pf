import { useState, useEffect } from 'react';
import { Plus, Search, Printer, Truck, Download, Eye, Pencil, Trash2, Send, Receipt, FileText, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatDate, formatCurrency, generateId, nextDocNumber, exportToCSV } from '../../lib/utils';
import { getSmartRate } from '../../lib/rateCardService';
import Modal from '../../components/ui/Modal';
import StatusBadge from '../../components/ui/StatusBadge';
import EmptyState from '../../components/ui/EmptyState';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import ChallanPrint from './ChallanPrint';
import { fetchCompanies } from '../../lib/companiesService';
import type { Company } from '../../lib/companiesService';
import type { DeliveryChallan as DCType, Product, Customer, SalesOrder, SalesOrderItem } from '../../types';
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

interface ChallanItem {
  id?: string;
  delivery_challan_id?: string;
  product_id: string | null;
  product_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface DeliveryChallanProps {
  onNavigate: (page: ActivePage, state?: PageState) => void;
}

const emptyForm = {
  customer_id: '', customer_name: '', customer_phone: '',
  customer_address: '', customer_address2: '',
  customer_city: '', customer_state: '', customer_pincode: '',
  challan_date: new Date().toISOString().split('T')[0],
  dispatch_mode: 'Courier', courier_company: '', tracking_number: '', notes: '',
  sales_order_id: '',
};

export default function DeliveryChallan({ onNavigate }: DeliveryChallanProps) {
  const [challans, setChallans] = useState<DCType[]>([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [selectedChallan, setSelectedChallan] = useState<DCType | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [editChallan, setEditChallan] = useState<DCType | null>(null);
  const [viewChallan, setViewChallan] = useState<DCType | null>(null);
  const [viewItems, setViewItems] = useState<ChallanItem[]>([]);
  const [showViewModal, setShowViewModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DCType | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loadingSO, setLoadingSO] = useState(false);
  const [printCompany, setPrintCompany] = useState<Company | undefined>(undefined);
  const [godowns, setGodowns] = useState<{id: string; name: string}[]>([]);

  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState<LineItem[]>([{ product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '0', discount_pct: '0', total_price: 0, godown_id: '' }]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [challansRes, productsRes, customersRes, soRes, godownsRes] = await Promise.all([
      supabase.from('delivery_challans').select('*').order('created_at', { ascending: false }),
      supabase.from('products').select('id, name, unit, selling_price').eq('is_active', true),
      supabase.from('customers').select('id, name, phone, address, address2, city, state, pincode').eq('is_active', true).order('name'),
      supabase.from('sales_orders').select('id, so_number, customer_id, customer_name, status').in('status', ['confirmed', 'dispatched', 'delivered']).order('created_at', { ascending: false }),
      supabase.from('godowns').select('id, name').eq('is_active', true).order('name'),
    ]);
    const allChallans = challansRes.data || [];
    setChallans(allChallans);
    setProducts(productsRes.data || []);
    setCustomers(customersRes.data || []);
    setGodowns(godownsRes.data || []);
    const linkedSOIds = new Set(allChallans.filter(c => c.sales_order_id && c.status !== 'cancelled').map(c => c.sales_order_id));
    const allSOs = (soRes.data || []) as SalesOrder[];
    setSalesOrders(allSOs.filter(so => !linkedSOIds.has(so.id)));
  };

  const handleCustomerChange = (id: string) => {
    const c = customers.find(c => c.id === id);
    setForm(f => ({
      ...f,
      customer_id: id,
      customer_name: c?.name || '',
      customer_phone: c?.phone || '',
      customer_address: c?.address || '',
      customer_address2: c?.address2 || '',
      customer_city: c?.city || '',
      customer_state: c?.state || '',
      customer_pincode: c?.pincode || '',
    }));
  };

  const handleSOChange = async (soId: string) => {
    setForm(f => ({ ...f, sales_order_id: soId }));
    if (!soId) return;
    setLoadingSO(true);
    // Fetch full SO row — includes customer_address, customer_city etc. saved at order time
    const { data: fullSO } = await supabase
      .from('sales_orders')
      .select('*')
      .eq('id', soId)
      .maybeSingle();
    if (fullSO) {
      setForm(f => ({
        ...f,
        sales_order_id: soId,
        customer_id: fullSO.customer_id || '',
        customer_name: fullSO.customer_name || '',
        customer_phone: fullSO.customer_phone || '',
        customer_address: fullSO.customer_address || '',
        customer_address2: fullSO.customer_address2 || '',
        customer_city: fullSO.customer_city || '',
        customer_state: fullSO.customer_state || '',
        customer_pincode: fullSO.customer_pincode || '',
      }));
    }
    const { data: soItems } = await supabase
      .from('sales_order_items')
      .select('*')
      .eq('sales_order_id', soId);
    if (soItems && soItems.length > 0) {
      setItems(soItems.map((i: SalesOrderItem) => ({
        product_id: i.product_id || '',
        product_name: i.product_name,
        unit: i.unit,
        quantity: String(i.quantity),
        unit_price: String(i.unit_price),
        discount_pct: String(i.discount_pct || 0),
        total_price: i.total_price,
        godown_id: (i as Record<string,string>).godown_id || godowns[0]?.id || '',
      })));
    }
    setLoadingSO(false);
  };

  const calcTotal = (qty: string, price: string, disc: string): number => {
    const q = parseFloat(qty) || 0;
    const p = parseFloat(price) || 0;
    const d = parseFloat(disc) || 0;
    return q * p * (1 - d / 100);
  };

  const updateItem = async (i: number, field: string, value: string) => {
    setItems(prev => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      if (field === 'product_id') {
        const p = products.find(p => p.id === value);
        if (p) {
          next[i].product_name = p.name;
          next[i].unit = p.unit;
          next[i].unit_price = String(p.selling_price || 0);
        }
      }
      next[i].total_price = calcTotal(next[i].quantity, next[i].unit_price, next[i].discount_pct);
      return next;
    });

    // Auto-select best godown when product chosen
    if (field === 'product_id' && value) {
      const { data: stockRows } = await supabase
        .from('godown_stock').select('godown_id, quantity')
        .eq('product_id', value).gt('quantity', 0)
        .order('quantity', { ascending: false }).limit(1);
      const bestGodown = stockRows?.[0]?.godown_id || godowns[0]?.id || '';
      setItems(prev => { const next=[...prev]; next[i]={...next[i], godown_id: bestGodown}; return next; });
    }

    if (field === 'product_id' && value && form.customer_id) {
      const rate = await getSmartRate(form.customer_id, value, products.find(p => p.id === value)?.selling_price || 0);
      setItems(prev => {
        const next = [...prev];
        next[i] = { ...next[i], unit_price: String(rate) };
        next[i].total_price = calcTotal(next[i].quantity, String(rate), next[i].discount_pct);
        return next;
      });
    }
  };

  const subtotal = items.reduce((s, i) => s + i.total_price, 0);

  const handleSave = async () => {
    const challanNumber = await nextDocNumber('DC', supabase);
    const { data: challan } = await supabase.from('delivery_challans').insert({
      challan_number: challanNumber,
      sales_order_id: form.sales_order_id || null,
      customer_id: form.customer_id || null,
      customer_name: form.customer_name,
      customer_phone: form.customer_phone,
      customer_address: form.customer_address,
      customer_address2: form.customer_address2,
      customer_city: form.customer_city,
      customer_state: form.customer_state,
      customer_pincode: form.customer_pincode,
      challan_date: form.challan_date,
      dispatch_mode: form.dispatch_mode,
      courier_company: form.courier_company,
      tracking_number: form.tracking_number,
      status: 'dispatched', notes: form.notes,
    }).select().single();

    if (challan) {
      await supabase.from('delivery_challan_items').insert(
        items.filter(i => i.product_name).map(i => ({
          delivery_challan_id: challan.id,
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
      if (form.sales_order_id) {
        await supabase.from('sales_orders').update({ status: 'dispatched' }).eq('id', form.sales_order_id);
      }
    }
    setShowModal(false);
    loadData();
  };

  const handleEdit = async () => {
    if (!editChallan) return;
    await supabase.from('delivery_challans').update({
      sales_order_id: form.sales_order_id || null,
      customer_id: form.customer_id || null,
      customer_name: form.customer_name,
      customer_phone: form.customer_phone,
      customer_address: form.customer_address,
      customer_address2: form.customer_address2,
      customer_city: form.customer_city,
      customer_state: form.customer_state,
      customer_pincode: form.customer_pincode,
      challan_date: form.challan_date,
      dispatch_mode: form.dispatch_mode,
      courier_company: form.courier_company,
      tracking_number: form.tracking_number,
      notes: form.notes,
    }).eq('id', editChallan.id);
    await supabase.from('delivery_challan_items').delete().eq('delivery_challan_id', editChallan.id);
    await supabase.from('delivery_challan_items').insert(
      items.filter(i => i.product_name).map(i => ({
        delivery_challan_id: editChallan.id,
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
    setEditChallan(null);
    loadData();
  };

  const [showSOSelectModal, setShowSOSelectModal] = useState(false);
  const [soSelectSearch, setSoSelectSearch] = useState('');
  const [editingSOs, setEditingSOs] = useState<SalesOrder[]>([]);

  const openNew = () => {
    setEditChallan(null);
    setForm(emptyForm);
    setItems([{ product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '0', discount_pct: '0', total_price: 0 }]);
    setSoSelectSearch('');
    setShowSOSelectModal(true);
  };

  const handleSOSelectAndOpenForm = async (soId: string) => {
    setShowSOSelectModal(false);
    setEditChallan(null);
    setForm(emptyForm);
    setItems([{ product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '0', discount_pct: '0', total_price: 0 }]);
    await handleSOChange(soId);
    setShowModal(true);
  };

  const handleNewWithoutSO = () => {
    setShowSOSelectModal(false);
    setEditChallan(null);
    setForm(emptyForm);
    setItems([{ product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '0', discount_pct: '0', total_price: 0 }]);
    setShowModal(true);
  };

  const openEdit = async (dc: DCType) => {
    const { data: existingItems } = await supabase.from('delivery_challan_items').select('*').eq('delivery_challan_id', dc.id);
    if (dc.sales_order_id) {
      const { data: thisSO } = await supabase.from('sales_orders').select('id, so_number, customer_id, customer_name, status').eq('id', dc.sales_order_id).maybeSingle();
      if (thisSO) setEditingSOs([thisSO as SalesOrder]);
    } else {
      setEditingSOs([]);
    }
    setEditChallan(dc);
    setForm({
      customer_id: dc.customer_id || '',
      customer_name: dc.customer_name,
      customer_phone: dc.customer_phone || '',
      customer_address: dc.customer_address || '',
      customer_address2: dc.customer_address2 || '',
      customer_city: dc.customer_city || '',
      customer_state: dc.customer_state || '',
      customer_pincode: dc.customer_pincode || '',
      challan_date: dc.challan_date,
      dispatch_mode: dc.dispatch_mode || 'Courier',
      courier_company: dc.courier_company || '',
      tracking_number: dc.tracking_number || '',
      notes: dc.notes || '',
      sales_order_id: dc.sales_order_id || '',
    });
    setItems(
      existingItems && existingItems.length > 0
        ? existingItems.map(i => ({
            product_id: i.product_id || '',
            product_name: i.product_name,
            unit: i.unit,
            quantity: String(i.quantity),
            unit_price: String(i.unit_price || 0),
            discount_pct: String(i.discount_pct || 0),
            total_price: i.total_price || 0,
            godown_id: (i as Record<string,string>).godown_id || '',
          }))
        : [{ product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '0', discount_pct: '0', total_price: 0, godown_id: godowns[0]?.id || '' }]
    );
    setShowModal(true);
  };

  const openView = async (dc: DCType) => {
    const { data: itemsData } = await supabase.from('delivery_challan_items').select('*').eq('delivery_challan_id', dc.id);
    setViewChallan(dc);
    setViewItems((itemsData || []) as ChallanItem[]);
    setShowViewModal(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    // Delete items first, then the challan itself
    await supabase.from('delivery_challan_items').delete().eq('delivery_challan_id', deleteTarget.id);
    await supabase.from('delivery_challans').delete().eq('id', deleteTarget.id);
    setDeleteTarget(null);
    loadData();
  };

  const openPrint = async (dc: DCType) => {
    const { data: itemsData } = await supabase.from('delivery_challan_items').select('*').eq('delivery_challan_id', dc.id);
    setSelectedChallan({ ...dc, items: itemsData || [] });
    // Detect company from first product that has one
    const dcWithCompany = dc as DCType & { company_id?: string };
    let coId = dcWithCompany.company_id || null;
    if (!coId && itemsData && itemsData.length > 0) {
      const firstProdId = itemsData.find(i => i.product_id)?.product_id;
      if (firstProdId) {
        const { data: prod } = await supabase.from('products').select('company_id').eq('id', firstProdId).maybeSingle();
        coId = prod?.company_id || null;
      }
    }
    if (coId) {
      const companies = await fetchCompanies();
      setPrintCompany(companies.find(c => c.id === coId) || undefined);
    } else {
      setPrintCompany(undefined);
    }
    setShowPrint(true);
  };

  const handleExportCSV = () => {
    exportToCSV(
      filtered.map(dc => ({
        'Challan Number': dc.challan_number,
        'Customer': dc.customer_name,
        'Date': dc.challan_date,
        'Dispatch Mode': dc.dispatch_mode || '',
        'Courier': dc.courier_company || '',
        'Tracking': dc.tracking_number || '',
        'Status': dc.status,
      })),
      'delivery-challans'
    );
  };

  const filtered = challans.filter(c =>
    c.challan_number.toLowerCase().includes(search.toLowerCase()) ||
    c.customer_name.toLowerCase().includes(search.toLowerCase())
  );

  const customerSOs = salesOrders.filter(so =>
    !form.customer_id || so.customer_id === form.customer_id
  );

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="bg-white border-b border-neutral-100 px-6 py-4 flex items-center justify-between no-print">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">Delivery Challans</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Track dispatches and deliveries — link to Sales Orders</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search challans..." className="input pl-8 w-52 text-xs" />
          </div>
          <button onClick={handleExportCSV} className="btn-secondary text-xs flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
          <button onClick={openNew} className="btn-primary">
            <Plus className="w-4 h-4" /> New Challan
          </button>
        </div>
      </div>

      <div className="p-6 no-print">
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-neutral-50 border-b border-neutral-100">
              <tr>
                <th className="table-header text-left">Challan #</th>
                <th className="table-header text-left">Customer</th>
                <th className="table-header text-left">SO Linked</th>
                <th className="table-header text-left">Date</th>
                <th className="table-header text-left">Courier</th>
                <th className="table-header text-left">Tracking</th>
                <th className="table-header text-left">Status</th>
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(dc => (
                <tr key={dc.id} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                  <td className="table-cell font-medium text-primary-700 text-xs">{dc.challan_number}</td>
                  <td className="table-cell">
                    <p className="font-medium text-sm">{dc.customer_name}</p>
                    {dc.customer_phone && <p className="text-xs text-neutral-400">{dc.customer_phone}</p>}
                  </td>
                  <td className="table-cell">
                    {dc.sales_order_id ? (
                      <span className="text-xs font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                        {salesOrders.find(s => s.id === dc.sales_order_id)?.so_number || 'SO Linked'}
                      </span>
                    ) : <span className="text-neutral-300 text-xs">—</span>}
                  </td>
                  <td className="table-cell text-neutral-500 text-sm">{formatDate(dc.challan_date)}</td>
                  <td className="table-cell text-neutral-600 text-sm">{dc.courier_company || dc.dispatch_mode || '—'}</td>
                  <td className="table-cell">
                    {dc.tracking_number ? (
                      <span className="text-xs font-mono bg-neutral-100 px-2 py-0.5 rounded">{dc.tracking_number}</span>
                    ) : <span className="text-neutral-400 text-xs">-</span>}
                  </td>
                  <td className="table-cell"><StatusBadge status={dc.status} /></td>
                  <td className="table-cell text-right">
                    <div className="flex items-center justify-end gap-1">
                      {dc.status !== 'cancelled' && (
                        <button onClick={() => onNavigate('courier', { prefillDCForShipment: dc })} title="Create Shipment"
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {dc.status !== 'cancelled' && (
                        <button onClick={() => onNavigate('invoices', { prefillDCForInvoice: dc })} title="Create Invoice"
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-primary-600 hover:bg-primary-50 transition-colors">
                          <Receipt className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => openView(dc)} title="View" className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"><Eye className="w-3.5 h-3.5" /></button>
                      <button onClick={() => openPrint(dc)} title="Print" className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"><Printer className="w-3.5 h-3.5" /></button>
                      {dc.status !== 'delivered' && dc.status !== 'cancelled' && (
                        <button onClick={() => openEdit(dc)} title="Edit" className="p-1.5 rounded-lg text-neutral-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                      )}
                      <button onClick={() => { setDeleteTarget(dc); setShowConfirm(true); }} title="Cancel" className="p-1.5 rounded-lg text-neutral-400 hover:text-error-600 hover:bg-error-50 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <EmptyState icon={Truck} title="No challans yet" description="Create a delivery challan." />}
        </div>
      </div>

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditChallan(null); }}
        title={editChallan ? `Edit Challan — ${editChallan.challan_number}` : 'New Delivery Challan'} size="xl"
        footer={
          <>
            <button onClick={() => { setShowModal(false); setEditChallan(null); }} className="btn-secondary">Cancel</button>
            <button onClick={editChallan ? handleEdit : handleSave} className="btn-primary">
              {editChallan ? 'Save Changes' : 'Create Challan'}
            </button>
          </>
        }>
        <div className="space-y-3">
          {/* Compact SO banner — shown when linked (pre-selected from the SO picker popup) */}
          {form.sales_order_id && (
            <div className="px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider">Linked Sales Order</p>
                <p className="text-sm text-blue-800 font-medium">
                  {[...editingSOs, ...salesOrders].find(s => s.id === form.sales_order_id)?.so_number || form.sales_order_id}
                  {' — '}{form.customer_name}
                </p>
              </div>
              {loadingSO && <p className="text-xs text-blue-500 animate-pulse">Loading...</p>}
            </div>
          )}

          {/* Row 1: Customer + dispatch info — all in one line */}
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
              <label className="label">Challan Date</label>
              <input type="date" value={form.challan_date} onChange={e => setForm(f => ({ ...f, challan_date: e.target.value }))} className="input text-xs" />
            </div>
            <div>
              <label className="label">Dispatch Mode</label>
              <select value={form.dispatch_mode} onChange={e => setForm(f => ({ ...f, dispatch_mode: e.target.value }))} className="input text-xs">
                {['Courier', 'Hand Delivery', 'Postal', 'Transport'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
          {/* Row 2: Address + courier details */}
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
          {/* Row 3: Courier details */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Courier Company</label>
              <input value={form.courier_company} onChange={e => setForm(f => ({ ...f, courier_company: e.target.value }))} className="input text-xs" placeholder="e.g., BlueDart, DTDC" />
            </div>
            <div>
              <label className="label">Tracking / AWB Number</label>
              <input value={form.tracking_number} onChange={e => setForm(f => ({ ...f, tracking_number: e.target.value }))} className="input text-xs" placeholder="AWB / Tracking ID" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-neutral-700">Items</p>
              <button onClick={() => setItems(prev => [...prev, { product_id: '', product_name: '', unit: 'pcs', quantity: '1', unit_price: '0', discount_pct: '0', total_price: 0, godown_id: godowns[0]?.id || '' }])}
                className="btn-ghost text-xs"><Plus className="w-3.5 h-3.5" /> Add Item</button>
            </div>
            <div className="border border-neutral-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="table-header text-left">Product</th>
                    <th className="table-header text-left w-28">Godown</th>
                    <th className="table-header text-center w-14">Unit</th>
                    <th className="table-header text-right w-16">Qty</th>
                    <th className="table-header text-right w-20">Price (₹)</th>
                    <th className="table-header text-right w-16">Disc%</th>
                    <th className="table-header text-right w-24">Total</th>
                    <th className="table-header w-8" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-t border-neutral-100">
                      <td className="px-3 py-2">
                        <select value={item.product_id} onChange={e => updateItem(i, 'product_id', e.target.value)} className="input text-xs">
                          <option value="">-- Product --</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        {!item.product_id && <input value={item.product_name} onChange={e => updateItem(i, 'product_name', e.target.value)} className="input text-xs mt-1" placeholder="Or type name..." />}
                      </td>
                      <td className="px-3 py-2 w-28"><select value={item.godown_id} onChange={e => { const gid=e.target.value; setItems(prev=>{const next=[...prev];next[i]={...next[i],godown_id:gid};return next;}); }} className="input text-xs py-1">{godowns.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></td>
                      <td className="px-3 py-2"><input value={item.unit} onChange={e => updateItem(i, 'unit', e.target.value)} className="input text-xs text-center" /></td>
                      <td className="px-3 py-2"><input type="number" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} className="input text-xs text-right" /></td>
                      <td className="px-3 py-2"><input type="number" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)} className="input text-xs text-right" /></td>
                      <td className="px-3 py-2"><input type="number" value={item.discount_pct} onChange={e => updateItem(i, 'discount_pct', e.target.value)} className="input text-xs text-right" /></td>
                      <td className="px-3 py-2 text-right text-sm font-medium text-neutral-700">{formatCurrency(item.total_price)}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => setItems(prev => prev.filter((_, idx) => idx !== i))} className="text-neutral-400 hover:text-error-500">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end mt-2">
              <div className="bg-primary-600 text-white px-4 py-1.5 rounded-lg text-sm font-bold">
                Total: {formatCurrency(subtotal)}
              </div>
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input resize-none h-14" />
          </div>
        </div>
      </Modal>

      <Modal isOpen={showViewModal} onClose={() => { setShowViewModal(false); setViewChallan(null); }}
        title={viewChallan ? `Delivery Challan — ${viewChallan.challan_number}` : ''} size="lg"
        footer={<button onClick={() => { setShowViewModal(false); setViewChallan(null); }} className="btn-secondary">Close</button>}>
        {viewChallan && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Customer</p>
                <p className="font-medium text-neutral-900">{viewChallan.customer_name}</p>
                {viewChallan.customer_phone && <p className="text-xs text-neutral-500">{viewChallan.customer_phone}</p>}
              </div>
              <div>
                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Status</p>
                <StatusBadge status={viewChallan.status} />
              </div>
              {viewChallan.sales_order_id && (
                <div>
                  <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Linked SO</p>
                  <p className="text-xs font-medium text-blue-700">{salesOrders.find(s => s.id === viewChallan.sales_order_id)?.so_number || '—'}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Challan Date</p>
                <p className="text-neutral-700">{formatDate(viewChallan.challan_date)}</p>
              </div>
              {viewChallan.courier_company && (
                <div>
                  <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Courier</p>
                  <p className="text-neutral-700">{viewChallan.courier_company}</p>
                </div>
              )}
              {viewChallan.tracking_number && (
                <div>
                  <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Tracking</p>
                  <span className="text-xs font-mono bg-neutral-100 px-2 py-0.5 rounded">{viewChallan.tracking_number}</span>
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
                      <th className="table-header text-right w-24">Rate</th>
                      <th className="table-header text-right w-24">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewItems.map((item, idx) => (
                      <tr key={idx} className="border-t border-neutral-100">
                        <td className="table-cell font-medium">{item.product_name}</td>
                        <td className="table-cell text-right">{item.quantity} {item.unit}</td>
                        <td className="table-cell text-right">{formatCurrency(item.unit_price)}</td>
                        <td className="table-cell text-right font-semibold">{formatCurrency(item.total_price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={showConfirm}
        onClose={() => { setShowConfirm(false); setDeleteTarget(null); }}
        onConfirm={handleDelete}
        title="Cancel Delivery Challan"
        message={`Cancel challan ${deleteTarget?.challan_number}?`}
        confirmLabel="Cancel Challan"
        isDanger
      />

      {showSOSelectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowSOSelectModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
              <div>
                <h2 className="text-base font-bold text-neutral-900">New Delivery Challan</h2>
                <p className="text-xs text-neutral-500">Link to a Sales Order or create without one</p>
              </div>
              <button onClick={() => setShowSOSelectModal(false)} className="p-1.5 rounded-lg hover:bg-neutral-100 transition-colors">
                <X className="w-4 h-4 text-neutral-500" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                <input
                  value={soSelectSearch}
                  onChange={e => setSoSelectSearch(e.target.value)}
                  placeholder="Search SO number or customer..."
                  className="input pl-8 w-full text-xs"
                  autoFocus
                />
              </div>

              {salesOrders.filter(so =>
                !soSelectSearch ||
                so.so_number.toLowerCase().includes(soSelectSearch.toLowerCase()) ||
                so.customer_name.toLowerCase().includes(soSelectSearch.toLowerCase())
              ).length === 0 && soSelectSearch ? (
                <div className="text-center py-6 text-neutral-400 text-sm">No matching Sales Orders found.</div>
              ) : (
                <div className="border border-neutral-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                  {salesOrders
                    .filter(so =>
                      !soSelectSearch ||
                      so.so_number.toLowerCase().includes(soSelectSearch.toLowerCase()) ||
                      so.customer_name.toLowerCase().includes(soSelectSearch.toLowerCase())
                    )
                    .map(so => (
                      <div key={so.id} onClick={() => handleSOSelectAndOpenForm(so.id)}
                        className="flex items-center justify-between px-4 py-3 cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-primary-50 transition-colors">
                        <div>
                          <p className="text-sm font-semibold text-primary-700">{so.so_number}</p>
                          <p className="text-xs text-neutral-500">{so.customer_name}</p>
                        </div>
                        <StatusBadge status={so.status} />
                      </div>
                    ))}
                  {salesOrders.length === 0 && (
                    <div className="text-center py-6 text-neutral-400 text-sm">No confirmed Sales Orders available.</div>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 pb-5">
              <button onClick={handleNewWithoutSO} className="w-full btn-secondary text-sm">
                <Plus className="w-4 h-4" /> Create without Sales Order
              </button>
            </div>
          </div>
        </div>
      )}

      {showPrint && selectedChallan && (
        <div className="fixed inset-0 z-50 bg-neutral-100 overflow-auto">
          <div className="no-print flex items-center justify-between bg-white border-b border-neutral-200 px-6 py-3">
            <p className="text-sm font-semibold">Challan Preview - {selectedChallan.challan_number}</p>
            <div className="flex gap-2">
              <button onClick={() => window.print()} className="btn-primary"><Printer className="w-4 h-4" /> Print</button>
              <button onClick={() => setShowPrint(false)} className="btn-secondary">Close</button>
            </div>
          </div>
          <div className="py-6 print-content"><ChallanPrint challan={selectedChallan} companyOverride={printCompany} /></div>
        </div>
      )}
    </div>
  );
}
