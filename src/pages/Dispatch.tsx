import { useState, useEffect, useRef } from 'react';
import { Truck, Plus, CreditCard as Edit2, Search, CheckCircle, Clock, ArrowRight, Hash, Warehouse, AlertCircle, Lock, Download, X, XCircle, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDate, exportToCSV, nextDocNumber } from '../lib/utils';
import { fetchGodowns } from '../services/godownService';
import type { DispatchEntry, DeliveryChallan, Godown } from '../types';
import type { ActivePage } from '../types';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import StatusBadge from '../components/ui/StatusBadge';

const DISPATCH_MODES = ['Bus', 'Tempo', 'Courier', 'Hand Delivery', 'Other'];
const STATUS_OPTIONS = ['pending', 'dispatched', 'in_transit', 'delivered', 'returned'];

interface DispatchFormData {
  reference_type: 'sales_order' | 'invoice';
  sales_order_id: string;
  invoice_id: string;
  customer_name: string;
  dispatch_mode: string;
  transport_name: string;
  lr_number: string;
  vehicle_number: string;
  driver_name: string;
  driver_phone: string;
  dispatch_date: string;
  expected_delivery_date: string;
  notes: string;
  status: string;
  godown_id: string;
}

const emptyForm: DispatchFormData = {
  reference_type: 'sales_order',
  sales_order_id: '',
  invoice_id: '',
  customer_name: '',
  dispatch_mode: 'Courier',
  transport_name: '',
  lr_number: '',
  vehicle_number: '',
  driver_name: '',
  driver_phone: '',
  dispatch_date: new Date().toISOString().split('T')[0],
  expected_delivery_date: '',
  notes: '',
  status: 'dispatched',
  godown_id: '',
};

interface SOOption { id: string; so_number: string; customer_name: string; }
interface InvOption { id: string; invoice_number: string; customer_name: string; }

interface DispatchProps {
  prefillFromDC?: DeliveryChallan;
  onNavigate?: (page: ActivePage) => void;
}

export default function Dispatch({ prefillFromDC, onNavigate: _onNavigate }: DispatchProps) {
  const [dispatches, setDispatches] = useState<DispatchEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<DispatchEntry | null>(null);
  const [form, setForm] = useState<DispatchFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [soOptions, setSoOptions] = useState<SOOption[]>([]);
  const [invOptions, setInvOptions] = useState<InvOption[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [cancelTarget, setCancelTarget] = useState<DispatchEntry | null>(null);
  const [soMap, setSoMap] = useState<Record<string, string>>({});
  const [invMap, setInvMap] = useState<Record<string, string>>({});
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadDispatches(); loadOptions(); loadGodownsList(); }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (prefillFromDC) {
      setEditing(null);
      setForm({
        ...emptyForm,
        reference_type: prefillFromDC.sales_order_id ? 'sales_order' : 'invoice',
        sales_order_id: prefillFromDC.sales_order_id || '',
        invoice_id: prefillFromDC.invoice_id || '',
        customer_name: prefillFromDC.customer_name || '',
        dispatch_mode: prefillFromDC.dispatch_mode || 'Courier',
        transport_name: prefillFromDC.courier_company || '',
        lr_number: prefillFromDC.tracking_number || '',
        dispatch_date: prefillFromDC.challan_date || new Date().toISOString().split('T')[0],
        notes: prefillFromDC.notes || '',
        status: 'dispatched',
        vehicle_number: '', driver_name: '', driver_phone: '', expected_delivery_date: '',
      });
      setShowModal(true);
    }
  }, [prefillFromDC]);

  const loadDispatches = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('dispatch_entries')
      .select('*')
      .order('dispatch_date', { ascending: false })
      .order('created_at', { ascending: false });
    setDispatches((data || []) as DispatchEntry[]);
    setLoading(false);
  };

  const loadGodownsList = async () => {
    const data = await fetchGodowns();
    setGodowns(data);
    if (data.length > 0) {
      setForm(f => ({ ...f, godown_id: f.godown_id || data[0].id }));
    }
  };

  const loadOptions = async () => {
    const [soRes, invDropdownRes, invAllRes] = await Promise.all([
      supabase.from('sales_orders').select('id, so_number, customer_name').in('status', ['confirmed', 'dispatched']).order('created_at', { ascending: false }).limit(50),
      supabase.from('invoices').select('id, invoice_number, customer_name').not('status', 'in', '(cancelled,paid)').order('created_at', { ascending: false }).limit(50),
      supabase.from('invoices').select('id, invoice_number, status').order('created_at', { ascending: false }).limit(200),
    ]);
    setSoOptions(soRes.data || []);
    setInvOptions(invDropdownRes.data || []);
    const sm: Record<string, string> = {};
    (soRes.data || []).forEach((s: { id: string; so_number: string }) => { sm[s.id] = s.so_number; });
    setSoMap(sm);
    const im: Record<string, string> = {};
    (invAllRes.data || []).forEach((i: { id: string; invoice_number: string; status: string }) => {
      if (i.status !== 'cancelled') im[i.id] = i.invoice_number;
    });
    setInvMap(im);
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm, dispatch_date: new Date().toISOString().split('T')[0] });
    setShowModal(true);
  };

  const openEdit = (d: DispatchEntry) => {
    if (d.status === 'delivered' || d.status === 'returned') return;
    setEditing(d);
    setForm({
      reference_type: (d.reference_type as 'sales_order' | 'invoice') || 'sales_order',
      sales_order_id: d.sales_order_id || '',
      invoice_id: d.invoice_id || '',
      customer_name: d.customer_name || '',
      dispatch_mode: d.dispatch_mode || 'Courier',
      transport_name: d.transport_name || '',
      lr_number: d.lr_number || '',
      vehicle_number: '',
      driver_name: '',
      driver_phone: '',
      dispatch_date: d.dispatch_date,
      expected_delivery_date: d.expected_delivery_date || '',
      notes: d.notes || '',
      status: d.status,
      godown_id: d.godown_id || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      reference_type: form.reference_type,
      sales_order_id: form.reference_type === 'sales_order' && form.sales_order_id ? form.sales_order_id : null,
      invoice_id: form.reference_type === 'invoice' && form.invoice_id ? form.invoice_id : null,
      customer_name: form.customer_name.trim(),
      dispatch_mode: form.dispatch_mode,
      transport_name: form.transport_name.trim(),
      lr_number: form.lr_number.trim(),
      vehicle_number: form.vehicle_number.trim(),
      driver_name: form.driver_name.trim(),
      driver_phone: form.driver_phone.trim(),
      dispatch_date: form.dispatch_date,
      expected_delivery_date: form.expected_delivery_date || null,
      notes: form.notes.trim(),
      status: form.status,
      godown_id: form.godown_id || null,
      updated_at: new Date().toISOString(),
    };

    if (editing) {
      await supabase.from('dispatch_entries').update(payload).eq('id', editing.id);
      if (form.status === 'delivered') {
        if (form.reference_type === 'sales_order' && form.sales_order_id) {
          await supabase.from('sales_orders').update({ status: 'delivered' }).eq('id', form.sales_order_id);
        }
        if (form.reference_type === 'invoice' && form.invoice_id) {
          await supabase.from('delivery_challans').update({ status: 'delivered' }).eq('invoice_id', form.invoice_id);
        }
      }
    } else {
      const dispatch_number = await nextDocNumber('DSP', supabase);
      await supabase.from('dispatch_entries').insert({ ...payload, dispatch_number });
      if (form.reference_type === 'sales_order' && form.sales_order_id) {
        await supabase.from('sales_orders').update({ status: 'dispatched' }).eq('id', form.sales_order_id);
      }
    }

    setSaving(false);
    setShowModal(false);
    await loadDispatches();
  };

  const markDelivered = async (d: DispatchEntry) => {
    await supabase.from('dispatch_entries').update({ status: 'delivered', updated_at: new Date().toISOString() }).eq('id', d.id);
    if (d.sales_order_id) await supabase.from('sales_orders').update({ status: 'delivered' }).eq('id', d.sales_order_id);
    await loadDispatches();
  };

  const cancelDispatch = async (d: DispatchEntry) => {
    setCancellingId(d.id);
    await supabase.from('dispatch_entries').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', d.id);
    setCancellingId(null);
    setCancelTarget(null);
    await loadDispatches();
  };

  const updateStatus = async (d: DispatchEntry, newStatus: string) => {
    await supabase.from('dispatch_entries').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', d.id);
    if (newStatus === 'delivered' && d.sales_order_id) {
      await supabase.from('sales_orders').update({ status: 'delivered' }).eq('id', d.sales_order_id);
    }
    await loadDispatches();
  };

  const uniqueCustomers = [...new Set(dispatches.map(d => d.customer_name).filter(Boolean))].sort();

  const filtered = dispatches.filter(d => {
    const matchSearch = !search || (d.dispatch_number?.toLowerCase().includes(search.toLowerCase())) || (d.customer_name?.toLowerCase().includes(search.toLowerCase())) || (d.lr_number?.toLowerCase().includes(search.toLowerCase()));
    const matchStatus = filterStatus === 'all' || d.status === filterStatus;
    const matchCustomer = !filterCustomer || d.customer_name === filterCustomer;
    const matchFrom = !filterFrom || d.dispatch_date >= filterFrom;
    const matchTo = !filterTo || d.dispatch_date <= filterTo;
    return matchSearch && matchStatus && matchCustomer && matchFrom && matchTo;
  });

  const handleExport = () => {
    exportToCSV(filtered.map(d => ({
      'Dispatch #': d.dispatch_number,
      Customer: d.customer_name || '',
      Mode: d.dispatch_mode || '',
      Transport: d.transport_name || '',
      'LR/Tracking': d.lr_number || '',
      'Dispatch Date': d.dispatch_date,
      'Expected Delivery': d.expected_delivery_date || '',
      Status: d.status,
      Reference: d.sales_order_id ? `SO: ${soMap[d.sales_order_id] || d.sales_order_id}` : d.invoice_id ? `INV: ${invMap[d.invoice_id] || d.invoice_id}` : '',
      Notes: d.notes || '',
    })), 'dispatch');
  };

  const statusCounts = {
    pending: dispatches.filter(d => d.status === 'pending').length,
    dispatched: dispatches.filter(d => d.status === 'dispatched').length,
    in_transit: dispatches.filter(d => d.status === 'in_transit').length,
    delivered: dispatches.filter(d => d.status === 'delivered').length,
  };

  const getStatusColor = (status: string) => {
    const m: Record<string, string> = {
      pending: 'bg-warning-50 text-warning-700',
      dispatched: 'bg-blue-50 text-blue-700',
      in_transit: 'bg-primary-50 text-primary-700',
      delivered: 'bg-success-50 text-success-700',
      returned: 'bg-error-50 text-error-700',
    };
    return m[status] || 'bg-neutral-100 text-neutral-600';
  };

  const getModeIcon = (mode: string) => {
    if (mode === 'Courier') return '📦';
    if (mode === 'Bus') return '🚌';
    if (mode === 'Tempo') return '🚛';
    if (mode === 'Hand Delivery') return '🤝';
    return '🚚';
  };

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
              <Truck className="w-5 h-5 text-primary-600" /> Dispatch Tracker
            </h1>
            <p className="text-xs text-neutral-500 mt-0.5">Track all outgoing shipments and deliveries</p>
          </div>
          <button onClick={openAdd} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Dispatch
          </button>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Pending', value: 'pending', count: statusCounts.pending, color: 'bg-warning-50 text-warning-600', icon: Clock, hint: 'Not yet shipped' },
            { label: 'Dispatched', value: 'dispatched', count: statusCounts.dispatched, color: 'bg-blue-50 text-blue-600', icon: Truck, hint: 'Shipped out' },
            { label: 'In Transit', value: 'in_transit', count: statusCounts.in_transit, color: 'bg-primary-50 text-primary-600', icon: ArrowRight, hint: 'On the way' },
            { label: 'Delivered', value: 'delivered', count: statusCounts.delivered, color: 'bg-success-50 text-success-600', icon: CheckCircle, hint: 'Completed' },
          ].map(kpi => (
            <button key={kpi.label} onClick={() => setFilterStatus(filterStatus === kpi.value ? 'all' : kpi.value)}
              className={`card text-left hover:shadow-md transition-all ${filterStatus === kpi.value ? 'ring-2 ring-primary-500 shadow-md' : ''}`}>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2 ${kpi.color}`}>
                <kpi.icon className="w-4 h-4" />
              </div>
              <p className="text-2xl font-bold text-neutral-900">{kpi.count}</p>
              <p className="text-xs font-medium text-neutral-600 mt-0.5">{kpi.label}</p>
              <p className="text-[10px] text-neutral-400">{kpi.hint}</p>
            </button>
          ))}
        </div>

        {(statusCounts.pending + statusCounts.dispatched + statusCounts.in_transit) > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-100 rounded-xl">
            <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
            <p className="text-xs text-blue-700">
              <span className="font-semibold">{statusCounts.pending + statusCounts.dispatched + statusCounts.in_transit}</span> shipment{statusCounts.pending + statusCounts.dispatched + statusCounts.in_transit !== 1 ? 's' : ''} in progress — click <strong>Delivered</strong> once the customer confirms receipt
            </p>
          </div>
        )}

        <div className="card">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input type="text" placeholder="Search dispatch, LR, customer..." value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-8 text-xs py-1.5 w-full" />
            </div>
            <select value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)} className="input-field text-xs py-1.5 w-40">
              <option value="">All Customers</option>
              {uniqueCustomers.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input-field text-xs py-1.5 w-36">
              <option value="all">All Status</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
            <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="input-field text-xs py-1.5 w-36" title="From date" />
            <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="input-field text-xs py-1.5 w-36" title="To date" />
            {(filterCustomer || filterStatus !== 'all' || filterFrom || filterTo || search) && (
              <button onClick={() => { setFilterCustomer(''); setFilterStatus('all'); setFilterFrom(''); setFilterTo(''); setSearch(''); }} className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors" title="Clear filters">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-neutral-400">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
              <button onClick={handleExport} className="btn-secondary text-xs flex items-center gap-1.5 py-1.5">
                <Download className="w-3.5 h-3.5" /> Export
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <Truck className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
              <p className="text-sm text-neutral-500">No dispatches found</p>
              <button onClick={openAdd} className="btn-primary mt-4 flex items-center gap-2 mx-auto">
                <Plus className="w-4 h-4" /> Create First Dispatch
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-100">
                    <th className="table-header text-left">Dispatch #</th>
                    <th className="table-header text-left">Customer</th>
                    <th className="table-header text-left">Godown</th>
                    <th className="table-header text-left">Mode</th>
                    <th className="table-header text-left">LR / Tracking</th>
                    <th className="table-header text-left">Dispatch Date</th>
                    <th className="table-header text-left">Expected</th>
                    <th className="table-header text-left">Status</th>
                    <th className="table-header text-left">Reference</th>
                    <th className="table-header text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(d => {
                    const isDelivered = d.status === 'delivered';
                    const isCancelled = d.status === 'cancelled';
                    const isLocked = isDelivered || isCancelled;
                    return (
                      <tr key={d.id} className={`border-b border-neutral-50 hover:bg-neutral-50 transition-colors ${isLocked ? 'opacity-60' : ''}`}>
                        <td className="table-cell font-medium text-primary-700 font-mono text-xs">{d.dispatch_number}</td>
                        <td className="table-cell font-medium text-neutral-800">{d.customer_name || '—'}</td>
                        <td className="table-cell text-xs text-neutral-500">
                          {d.godown_id ? (godowns.find(g => g.id === d.godown_id)?.name || '—') : '—'}
                        </td>
                        <td className="table-cell">
                          <span className="flex items-center gap-1.5 text-xs">
                            <span>{getModeIcon(d.dispatch_mode || '')}</span>
                            <span>{d.dispatch_mode || '—'}</span>
                          </span>
                          {d.transport_name && <p className="text-[10px] text-neutral-400 mt-0.5">{d.transport_name}</p>}
                        </td>
                        <td className="table-cell">
                          {d.lr_number ? (
                            <span className="flex items-center gap-1 text-xs text-neutral-700">
                              <Hash className="w-3 h-3 text-neutral-400" />{d.lr_number}
                            </span>
                          ) : <span className="text-neutral-300">—</span>}
                        </td>
                        <td className="table-cell text-xs text-neutral-600">{formatDate(d.dispatch_date)}</td>
                        <td className="table-cell text-xs text-neutral-500">{d.expected_delivery_date ? formatDate(d.expected_delivery_date) : '—'}</td>
                        <td className="table-cell">
                          {isLocked ? (
                            <span className={`badge capitalize ${getStatusColor(d.status)}`}>{d.status.replace('_', ' ')}</span>
                          ) : (
                            <select
                              value={d.status}
                              onChange={e => updateStatus(d, e.target.value)}
                              className={`text-xs rounded-lg border px-2 py-1 font-medium cursor-pointer ${getStatusColor(d.status)} border-transparent`}
                            >
                              {STATUS_OPTIONS.filter(s => s !== 'cancelled').map(s => (
                                <option key={s} value={s}>{s.replace('_', ' ')}</option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="table-cell">
                          <div className="flex flex-col gap-0.5">
                            {d.sales_order_id && (
                              <span className="text-[10px] font-medium bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded w-fit">
                                SO: {soMap[d.sales_order_id] || 'Sales Order'}
                              </span>
                            )}
                            {d.invoice_id && (() => {
                              const invNum = invMap[d.invoice_id];
                              if (!invNum) {
                                return (
                                  <span className="text-[10px] font-medium bg-error-50 text-error-600 px-1.5 py-0.5 rounded w-fit">
                                    Cancelled
                                  </span>
                                );
                              }
                              return (
                                <span className="text-[10px] font-medium bg-green-50 text-green-700 px-1.5 py-0.5 rounded w-fit">
                                  INV: {invNum}
                                </span>
                              );
                            })()}
                            {!d.sales_order_id && !d.invoice_id && <span className="text-neutral-300 text-xs">—</span>}
                          </div>
                        </td>
                        <td className="table-cell">
                          <div className="flex items-center gap-1" ref={dropdownRef}>
                            {isLocked ? (
                              <span className="flex items-center gap-1 text-[10px] text-neutral-400 px-1.5 py-1">
                                <Lock className="w-3 h-3" />
                                {isDelivered ? 'Delivered' : 'Cancelled'}
                              </span>
                            ) : (
                              <div className="relative">
                                <button
                                  onClick={() => setOpenDropdown(openDropdown === d.id ? null : d.id)}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-neutral-100 hover:bg-neutral-200 text-neutral-600 transition-colors"
                                >
                                  Actions <ChevronDown className="w-3 h-3" />
                                </button>
                                {openDropdown === d.id && (
                                  <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-neutral-200 rounded-lg shadow-lg z-10 overflow-hidden">
                                    <button
                                      onClick={() => { setOpenDropdown(null); openEdit(d); }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-50 transition-colors"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" /> Edit
                                    </button>
                                    <button
                                      onClick={() => { setOpenDropdown(null); setCancelTarget(d); }}
                                      disabled={cancellingId === d.id}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-error-600 hover:bg-error-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                      {cancellingId === d.id ? 'Cancelling...' : 'Cancel'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget && cancelDispatch(cancelTarget)}
        title="Cancel Dispatch"
        message={cancelTarget ? `Are you sure you want to cancel dispatch ${cancelTarget.dispatch_number}? This cannot be undone.` : ''}
        confirmLabel="Cancel Dispatch"
        isDanger
      />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Dispatch' : 'New Dispatch Entry'} maxWidth="max-w-2xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Reference Type</label>
              <select className="input-field" value={form.reference_type} onChange={e => setForm({ ...form, reference_type: e.target.value as 'sales_order' | 'invoice', sales_order_id: '', invoice_id: '', customer_name: '' })}>
                <option value="sales_order">Sales Order</option>
                <option value="invoice">Invoice</option>
              </select>
            </div>
            {form.reference_type === 'sales_order' ? (
              <div>
                <label className="form-label">Sales Order</label>
                <select className="input-field" value={form.sales_order_id} onChange={e => {
                  const so = soOptions.find(s => s.id === e.target.value);
                  setForm({ ...form, sales_order_id: e.target.value, customer_name: so?.customer_name || form.customer_name });
                }}>
                  <option value="">Select Sales Order</option>
                  {soOptions.map(so => <option key={so.id} value={so.id}>{so.so_number} — {so.customer_name}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="form-label">Invoice</label>
                <select className="input-field" value={form.invoice_id} onChange={e => {
                  const inv = invOptions.find(i => i.id === e.target.value);
                  setForm({ ...form, invoice_id: e.target.value, customer_name: inv?.customer_name || form.customer_name });
                }}>
                  <option value="">Select Invoice</option>
                  {invOptions.map(inv => <option key={inv.id} value={inv.id}>{inv.invoice_number} — {inv.customer_name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="form-label">Customer Name</label>
            <input className="input-field" value={form.customer_name} onChange={e => setForm({ ...form, customer_name: e.target.value })} placeholder="Customer name" />
          </div>

          <div>
            <label className="form-label flex items-center gap-1.5"><Warehouse className="w-3.5 h-3.5 text-neutral-400" /> Dispatched From Godown</label>
            <select className="input-field" value={form.godown_id} onChange={e => setForm({ ...form, godown_id: e.target.value })}>
              <option value="">-- Select Godown --</option>
              {godowns.map(g => <option key={g.id} value={g.id}>{g.name}{g.location ? ` (${g.location})` : ''}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Dispatch Mode *</label>
              <select className="input-field" value={form.dispatch_mode} onChange={e => setForm({ ...form, dispatch_mode: e.target.value })}>
                {DISPATCH_MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">Transport / Courier Company</label>
              <input className="input-field" value={form.transport_name} onChange={e => setForm({ ...form, transport_name: e.target.value })} placeholder="e.g. DTDC, Blue Dart" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">LR / Tracking Number</label>
              <input className="input-field" value={form.lr_number} onChange={e => setForm({ ...form, lr_number: e.target.value })} placeholder="LR or tracking ID" />
            </div>
            <div>
              <label className="form-label">Vehicle Number</label>
              <input className="input-field" value={form.vehicle_number} onChange={e => setForm({ ...form, vehicle_number: e.target.value })} placeholder="e.g. MH12AB1234" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Driver Name</label>
              <input className="input-field" value={form.driver_name} onChange={e => setForm({ ...form, driver_name: e.target.value })} placeholder="Driver name" />
            </div>
            <div>
              <label className="form-label">Driver Phone</label>
              <input className="input-field" value={form.driver_phone} onChange={e => setForm({ ...form, driver_phone: e.target.value })} placeholder="Driver contact" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="form-label">Dispatch Date *</label>
              <input type="date" className="input-field" value={form.dispatch_date} onChange={e => setForm({ ...form, dispatch_date: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Expected Delivery</label>
              <input type="date" className="input-field" value={form.expected_delivery_date} onChange={e => setForm({ ...form, expected_delivery_date: e.target.value })} />
            </div>
            <div>
              <label className="form-label">Status</label>
              <select className="input-field" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="form-label">Notes</label>
            <textarea className="input-field" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any additional notes..." />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.dispatch_date} className="btn-primary">
              {saving ? 'Saving...' : editing ? 'Update Dispatch' : 'Create Dispatch'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
