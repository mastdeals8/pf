import { useState, useEffect } from 'react';
import { Plus, Search, Truck, CheckCircle, Package, IndianRupee, ArrowUpRight, Printer } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatDate, generateId } from '../lib/utils';
import { useCompanySettings } from '../lib/useCompanySettings';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import ActionMenu, { actionEdit } from '../components/ui/ActionMenu';
import type { CourierEntry, Customer, DeliveryChallan } from '../types';
import type { PageState } from '../App';

const TRANSPORT_OPTIONS = [
  'DTDC', 'BlueDart', 'FedEx', 'Delhivery', 'India Post', 'Ekart', 'XpressBees',
  'Bus', 'Tempo', 'Hand Delivery', 'Train', 'Air', 'Other',
];

const STATUS_TABS = [
  { key: 'All', label: 'All' },
  { key: 'booked', label: 'Booked' },
  { key: 'in_transit', label: 'In Transit' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'returned', label: 'Returned' },
];

const STATUS_COLORS: Record<string, string> = {
  booked: 'bg-warning-50 text-warning-700',
  in_transit: 'bg-blue-50 text-blue-700',
  delivered: 'bg-success-50 text-success-700',
  returned: 'bg-error-50 text-error-700',
};

interface SOOption { id: string; so_number: string; customer_name: string; }

const emptyForm = {
  courier_date: new Date().toISOString().split('T')[0],
  customer_id: '', customer_name: '', courier_company: 'DTDC',
  tracking_id: '', weight_kg: '', charges: '', status: 'booked',
  notes: '', sales_order_id: '',
  // address fields for label
  customer_address: '', customer_city: '', customer_state: '', customer_pincode: '', customer_phone: '',
};

interface CourierProps {
  prefillFromDC?: DeliveryChallan;
}

export default function Courier({ prefillFromDC }: CourierProps) {
  const { company } = useCompanySettings();
  const [entries, setEntries] = useState<CourierEntry[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [soOptions, setSoOptions] = useState<SOOption[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CourierEntry | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [printEntry, setPrintEntry] = useState<(CourierEntry & typeof emptyForm) | null>(null);

  useEffect(() => { loadData(); }, []);

  // Auto-open add modal when Challan "Create Shipment" is clicked
  useEffect(() => {
    if (prefillFromDC) {
      setEditing(null);
      setForm({
        ...emptyForm,
        courier_date: new Date().toISOString().split('T')[0],
        customer_id: prefillFromDC.customer_id || '',
        customer_name: prefillFromDC.customer_name || '',
        customer_phone: prefillFromDC.customer_phone || '',
        customer_address: prefillFromDC.customer_address || '',
        customer_city: prefillFromDC.customer_city || '',
        customer_state: prefillFromDC.customer_state || '',
        customer_pincode: prefillFromDC.customer_pincode || '',
        sales_order_id: prefillFromDC.sales_order_id || '',
        courier_company: prefillFromDC.courier_company || 'DTDC',
        tracking_id: prefillFromDC.tracking_number || '',
        notes: `From Challan ${prefillFromDC.challan_number}`,
      });
      setShowModal(true);
    }
  }, [prefillFromDC]);

  const loadData = async () => {
    const [entriesRes, customersRes, soRes] = await Promise.all([
      supabase.from('courier_entries').select('*').order('courier_date', { ascending: false }),
      supabase.from('customers').select('id, name, phone, address, city, state, pincode').eq('is_active', true).order('name'),
      supabase.from('sales_orders').select('id, so_number, customer_name').in('status', ['confirmed', 'dispatched']).order('created_at', { ascending: false }).limit(50),
    ]);
    setEntries(entriesRes.data || []);
    setCustomers(customersRes.data || []);
    setSoOptions(soRes.data || []);
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm, courier_date: new Date().toISOString().split('T')[0] });
    setShowModal(true);
  };

  const openEdit = (e: CourierEntry) => {
    setEditing(e);
    setForm({
      courier_date: e.courier_date,
      customer_id: e.customer_id || '',
      customer_name: e.customer_name,
      courier_company: e.courier_company,
      tracking_id: e.tracking_id || '',
      weight_kg: e.weight_kg ? String(e.weight_kg) : '',
      charges: String(e.charges),
      status: e.status,
      notes: e.notes || '',
      sales_order_id: e.sales_order_id || '',
      customer_address: '',
      customer_city: '', customer_state: '', customer_pincode: '', customer_phone: '',
    });
    setShowModal(true);
  };

  const handleCustomerSelect = (id: string) => {
    const c = customers.find(c => c.id === id);
    setForm(f => ({
      ...f,
      customer_id: id,
      customer_name: c?.name || f.customer_name,
      customer_phone: c?.phone || '',
      customer_address: (c as Customer & { address?: string })?.address || '',
      customer_city: c?.city || '',
      customer_state: c?.state || '',
      customer_pincode: c?.pincode || '',
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      courier_date: form.courier_date,
      customer_id: form.customer_id || null,
      customer_name: form.customer_name.trim(),
      courier_company: form.courier_company,
      tracking_id: form.tracking_id.trim() || null,
      weight_kg: parseFloat(form.weight_kg) || 0,
      charges: parseFloat(form.charges) || 0,
      status: form.status,
      notes: form.notes.trim() || null,
      sales_order_id: form.sales_order_id || null,
      updated_at: new Date().toISOString(),
    };
    if (editing) {
      await supabase.from('courier_entries').update(payload).eq('id', editing.id);
    } else {
      const dispatch_number = generateId('DSP');
      const { data: newEntry } = await supabase.from('courier_entries').insert({ ...payload, dispatch_number }).select().single();
      if (form.sales_order_id) {
        await supabase.from('sales_orders').update({ status: 'dispatched' }).eq('id', form.sales_order_id);
      }
      // Auto-open label print after adding
      if (newEntry) {
        setPrintEntry({ ...newEntry, ...form } as CourierEntry & typeof emptyForm);
      }
    }
    setSaving(false);
    setShowModal(false);
    loadData();
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('courier_entries').update({ status }).eq('id', id);
    loadData();
  };

  const openLabel = async (e: CourierEntry) => {
    // Fetch customer address if available
    let addr = { address: '', city: '', state: '', pincode: '', phone: '' };
    if (e.customer_id) {
      const { data: c } = await supabase.from('customers').select('address, city, state, pincode, phone').eq('id', e.customer_id).maybeSingle();
      if (c) addr = c;
    }
    setPrintEntry({ ...e, customer_address: addr.address || '', customer_city: addr.city || '', customer_state: addr.state || '', customer_pincode: addr.pincode || '', customer_phone: addr.phone || e.customer_name } as CourierEntry & typeof emptyForm);
  };

  const printLabel = () => {
    if (!printEntry) return;
    const w = window.open('', '_blank', 'width=794,height=500');
    if (!w) return;
    const from = [
      `<strong>${company.name}</strong>`,
      company.address1,
      company.address2,
      [company.city, company.state, company.pincode].filter(Boolean).join(', '),
      company.phone,
    ].filter(Boolean).join('<br/>');
    const to = [
      `<strong>${printEntry.customer_name}</strong>`,
      printEntry.customer_phone,
      printEntry.customer_address,
      [printEntry.customer_city, printEntry.customer_state, printEntry.customer_pincode].filter(Boolean).join(', '),
    ].filter(Boolean).join('<br/>');
    w.document.write(`<!DOCTYPE html><html><head><title>Shipping Label</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, sans-serif; }
  body { background: white; padding: 12mm; }
  .label-box { border: 2.5px solid #000; border-radius: 4px; padding: 0; max-width: 180mm; margin: 0 auto; }
  .header { background: #1a1a1a; color: white; padding: 8px 14px; display: flex; justify-content: space-between; align-items: center; }
  .header-title { font-size: 18px; font-weight: 700; letter-spacing: 2px; }
  .header-meta { text-align: right; font-size: 11px; }
  .body { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
  .addr-box { padding: 14px; }
  .addr-box + .addr-box { border-left: 1.5px solid #ccc; }
  .addr-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #666; margin-bottom: 6px; }
  .addr-text { font-size: 13px; line-height: 1.6; }
  .divider { border-top: 1.5px solid #ccc; }
  .footer { padding: 8px 14px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #444; }
  .tracking-box { background: #f5f5f5; border: 1px solid #ddd; padding: 4px 10px; border-radius: 3px; font-family: monospace; font-size: 12px; font-weight: 700; }
  @media print { .no-print { display: none !important; } }
</style></head><body>
<div class="no-print" style="margin-bottom:12px;display:flex;gap:8px">
  <button onclick="window.print()" style="background:#e8610a;color:white;border:none;padding:8px 18px;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600">🖨️ Print Label</button>
  <button onclick="window.close()" style="background:#eee;border:1px solid #ccc;padding:8px 14px;border-radius:6px;font-size:13px;cursor:pointer">Close</button>
</div>
<div class="label-box">
  <div class="header">
    <span class="header-title">SHIPPING LABEL</span>
    <div class="header-meta">
      <div>Date: ${printEntry.courier_date}</div>
      <div>Via: ${printEntry.courier_company}</div>
    </div>
  </div>
  <div class="body">
    <div class="addr-box">
      <div class="addr-label">FROM</div>
      <div class="addr-text">${from}</div>
    </div>
    <div class="addr-box">
      <div class="addr-label">TO (SHIP TO)</div>
      <div class="addr-text">${to}</div>
    </div>
  </div>
  <div class="divider"></div>
  <div class="footer">
    <div>
      ${printEntry.tracking_id ? `<span style="margin-right:6px">Tracking:</span><span class="tracking-box">${printEntry.tracking_id}</span>` : '<span style="color:#999">No tracking number</span>'}
    </div>
    <div>
      ${printEntry.weight_kg ? `Weight: ${printEntry.weight_kg} kg` : ''}
      ${printEntry.notes ? `&nbsp;| Note: ${printEntry.notes}` : ''}
    </div>
  </div>
</div>
</body></html>`);
    w.document.close();
  };

  const filtered = entries.filter(e => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      e.customer_name.toLowerCase().includes(q) ||
      (e.tracking_id || '').toLowerCase().includes(q) ||
      e.courier_company.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'All' || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const now = new Date();
  const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthlyEntries = entries.filter(e => e.courier_date >= startOfMonth);
  const monthlyCost = monthlyEntries.reduce((s, e) => s + e.charges, 0);
  const inTransit = entries.filter(e => ['booked', 'in_transit'].includes(e.status)).length;
  const delivered = entries.filter(e => e.status === 'delivered').length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-neutral-50">
      {/* Toolbar */}
      <div className="page-header">
        <div className="flex items-center gap-3 flex-1">
          {/* Inline KPI chips */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5">
              <Package className="w-3 h-3 text-neutral-400" />
              <span className="text-xs font-semibold text-neutral-700">{monthlyEntries.length}</span>
              <span className="text-[10px] text-neutral-400">this month</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5">
              <IndianRupee className="w-3 h-3 text-primary-500" />
              <span className="text-xs font-semibold text-primary-700">{formatCurrency(monthlyCost)}</span>
            </div>
            <div className={`flex items-center gap-1.5 border rounded-lg px-2.5 py-1.5 ${inTransit > 0 ? 'bg-warning-50 border-warning-200' : 'bg-white border-neutral-200'}`}>
              <Truck className={`w-3 h-3 ${inTransit > 0 ? 'text-warning-600' : 'text-neutral-400'}`} />
              <span className={`text-xs font-semibold ${inTransit > 0 ? 'text-warning-700' : 'text-neutral-700'}`}>{inTransit}</span>
              <span className="text-[10px] text-neutral-400">in transit</span>
            </div>
            <div className="flex items-center gap-1.5 bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5">
              <CheckCircle className="w-3 h-3 text-success-600" />
              <span className="text-xs font-semibold text-success-700">{delivered}</span>
              <span className="text-[10px] text-neutral-400">delivered</span>
            </div>
          </div>
          {/* Status tab filter */}
          <div className="flex items-center gap-0.5 ml-2 border border-neutral-200 rounded-lg bg-white p-0.5">
            {STATUS_TABS.map(tab => (
              <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  statusFilter === tab.key ? 'bg-primary-600 text-white' : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'
                }`}>
                {tab.label}
                {tab.key !== 'All' && (
                  <span className={`ml-1 text-[9px] ${statusFilter === tab.key ? 'opacity-70' : 'text-neutral-400'}`}>
                    {entries.filter(e => e.status === tab.key).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Customer, tracking..." className="input pl-7 w-44" />
          </div>
          <button onClick={openAdd} className="btn-primary">
            <Plus className="w-3.5 h-3.5" /> Add Shipment
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden px-5 py-3">
        <div className="h-full bg-white rounded-xl border border-neutral-100 shadow-card overflow-hidden flex flex-col">
          <div className="overflow-auto flex-1">
            <table className="w-full">
              <thead className="sticky top-0 bg-neutral-50 border-b border-neutral-100 z-10">
                <tr>
                  <th className="table-header text-left">Date</th>
                  <th className="table-header text-left">Customer</th>
                  <th className="table-header text-left">Via</th>
                  <th className="table-header text-left">Tracking / LR</th>
                  <th className="table-header text-left">Linked</th>
                  <th className="table-header text-right">Wt (kg)</th>
                  <th className="table-header text-right">Charges</th>
                  <th className="table-header text-left">Status</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {filtered.map(e => (
                  <tr key={e.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="table-cell text-neutral-500">{formatDate(e.courier_date)}</td>
                    <td className="table-cell font-medium text-neutral-800">{e.customer_name}</td>
                    <td className="table-cell text-neutral-600">{e.courier_company}</td>
                    <td className="table-cell">
                      {e.tracking_id
                        ? <span className="font-mono bg-neutral-100 text-neutral-700 px-1.5 py-0.5 rounded text-[10px]">{e.tracking_id}</span>
                        : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="table-cell">
                      {e.sales_order_id
                        ? <span className="badge bg-blue-50 text-blue-700 gap-1"><ArrowUpRight className="w-2.5 h-2.5" />SO</span>
                        : e.invoice_id
                        ? <span className="badge bg-green-50 text-green-700 gap-1"><ArrowUpRight className="w-2.5 h-2.5" />Inv</span>
                        : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="table-cell text-right text-neutral-600">{e.weight_kg || '—'}</td>
                    <td className="table-cell text-right font-semibold text-primary-700">{formatCurrency(e.charges)}</td>
                    <td className="table-cell">
                      <span className={`badge capitalize ${STATUS_COLORS[e.status] || 'bg-neutral-100 text-neutral-600'}`}>
                        {e.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="table-cell text-right">
                      <ActionMenu items={[
                        actionEdit(() => openEdit(e)),
                        { label: 'Print Label', icon: <Printer className="w-3.5 h-3.5" />, onClick: () => openLabel(e) },
                        ...(e.status === 'booked' ? [{ label: 'Mark In Transit', icon: <Truck className="w-3.5 h-3.5" />, onClick: () => updateStatus(e.id, 'in_transit') }] : []),
                        ...(e.status === 'in_transit' ? [{ label: 'Mark Delivered', icon: <CheckCircle className="w-3.5 h-3.5" />, onClick: () => updateStatus(e.id, 'delivered') }] : []),
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <EmptyState icon={Truck} title="No shipments found" description="Add your first shipment entry." />}
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditing(null); }}
        title={editing ? 'Edit Shipment' : 'Add Shipment'}
        subtitle={prefillFromDC && !editing ? `Pre-filled from Challan ${prefillFromDC.challan_number}` : undefined}
        size="lg"
        footer={<>
          <button onClick={() => { setShowModal(false); setEditing(null); }} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : editing ? 'Update' : 'Add & Print Label'}
          </button>
        </>}>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Date</label>
            <input type="date" value={form.courier_date} onChange={e => setForm(f => ({ ...f, courier_date: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="label">Customer</label>
            <select value={form.customer_id} onChange={e => handleCustomerSelect(e.target.value)} className="input">
              <option value="">— Select —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Customer Name *</label>
            <input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} className="input" placeholder="Name" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input value={form.customer_phone} onChange={e => setForm(f => ({ ...f, customer_phone: e.target.value }))} className="input" placeholder="+91..." />
          </div>
          <div>
            <label className="label">Via (Transport) *</label>
            <select value={form.courier_company} onChange={e => setForm(f => ({ ...f, courier_company: e.target.value }))} className="input">
              {TRANSPORT_OPTIONS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Tracking / LR Number</label>
            <input value={form.tracking_id} onChange={e => setForm(f => ({ ...f, tracking_id: e.target.value }))} className="input" placeholder="AWB / LR no." />
          </div>
          <div className="col-span-2">
            <label className="label">Delivery Address (for label)</label>
            <input value={form.customer_address} onChange={e => setForm(f => ({ ...f, customer_address: e.target.value }))} className="input" placeholder="Street, Area..." />
          </div>
          <div>
            <label className="label">City / State / PIN</label>
            <div className="flex gap-1">
              <input value={form.customer_city} onChange={e => setForm(f => ({ ...f, customer_city: e.target.value }))} className="input" placeholder="City" />
              <input value={form.customer_pincode} onChange={e => setForm(f => ({ ...f, customer_pincode: e.target.value }))} className="input w-20" placeholder="PIN" />
            </div>
          </div>
          <div>
            <label className="label">Weight (kg)</label>
            <input type="number" step="0.1" value={form.weight_kg} onChange={e => setForm(f => ({ ...f, weight_kg: e.target.value }))} className="input" placeholder="0.5" />
          </div>
          <div>
            <label className="label">Charges (₹)</label>
            <input type="number" value={form.charges} onChange={e => setForm(f => ({ ...f, charges: e.target.value }))} className="input" placeholder="0" />
          </div>
          <div>
            <label className="label">Link to Sales Order</label>
            <select value={form.sales_order_id} onChange={e => setForm(f => ({ ...f, sales_order_id: e.target.value }))} className="input">
              <option value="">— None —</option>
              {soOptions.map(so => <option key={so.id} value={so.id}>{so.so_number} — {so.customer_name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="input">
              {['booked', 'in_transit', 'delivered', 'returned'].map(s => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Notes</label>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input" placeholder="Optional" />
          </div>
        </div>
      </Modal>

      {/* Label Print Preview Modal */}
      {printEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPrintEntry(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
              <p className="text-sm font-semibold text-neutral-800">Shipping Label Preview</p>
              <div className="flex gap-2">
                <button onClick={printLabel} className="btn-primary"><Printer className="w-3.5 h-3.5" /> Print A4 Label</button>
                <button onClick={() => setPrintEntry(null)} className="btn-secondary">Close</button>
              </div>
            </div>
            <div className="p-5">
              <div className="border-2 border-neutral-800 rounded-lg overflow-hidden text-sm">
                <div className="bg-neutral-900 text-white px-4 py-3 flex justify-between items-center">
                  <span className="text-base font-bold tracking-widest">SHIPPING LABEL</span>
                  <div className="text-right text-xs opacity-80">
                    <div>{printEntry.courier_date}</div>
                    <div>Via: {printEntry.courier_company}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 divide-x divide-neutral-200">
                  <div className="p-4">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 mb-2">FROM</p>
                    <p className="font-bold text-neutral-900">{company.name}</p>
                    {company.address1 && <p className="text-neutral-600 text-xs">{company.address1}</p>}
                    {company.address2 && <p className="text-neutral-600 text-xs">{company.address2}</p>}
                    {(company.city || company.pincode) && <p className="text-neutral-600 text-xs">{[company.city, company.state, company.pincode].filter(Boolean).join(', ')}</p>}
                    {company.phone && <p className="text-neutral-600 text-xs">{company.phone}</p>}
                  </div>
                  <div className="p-4">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 mb-2">TO (SHIP TO)</p>
                    <p className="font-bold text-neutral-900">{printEntry.customer_name}</p>
                    {printEntry.customer_phone && <p className="text-neutral-600 text-xs">{printEntry.customer_phone}</p>}
                    {printEntry.customer_address && <p className="text-neutral-600 text-xs">{printEntry.customer_address}</p>}
                    {(printEntry.customer_city || printEntry.customer_pincode) && (
                      <p className="text-neutral-600 text-xs">{[printEntry.customer_city, printEntry.customer_state, printEntry.customer_pincode].filter(Boolean).join(', ')}</p>
                    )}
                  </div>
                </div>
                <div className="border-t border-neutral-200 px-4 py-2 flex items-center justify-between bg-neutral-50">
                  <div>
                    {printEntry.tracking_id
                      ? <span className="font-mono text-xs font-bold bg-white border border-neutral-300 px-2 py-0.5 rounded">📦 {printEntry.tracking_id}</span>
                      : <span className="text-neutral-400 text-xs">No tracking number</span>}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {printEntry.weight_kg ? `${printEntry.weight_kg} kg` : ''}
                    {printEntry.notes ? ` · ${printEntry.notes}` : ''}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
