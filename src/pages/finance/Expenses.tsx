import { useState, useEffect, useRef } from 'react';
import { Plus, Search, Receipt, Download, Pencil, Trash2, Eye, ImagePlus, X, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatDate, generateId, exportToCSV } from '../../lib/utils';
import { useDateRange } from '../../contexts/DateRangeContext';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import type { Expense } from '../../types';

const CATEGORIES = ['Rent', 'Travel', 'Marketing', 'Courier', 'Utilities', 'Supplies', 'Salary', 'Miscellaneous'] as const;

interface ImageSlot {
  key: 'receipt_image_url' | 'product_image_url' | 'payment_screenshot_url';
  label: string;
  hint: string;
}

const IMAGE_SLOTS: ImageSlot[] = [
  { key: 'receipt_image_url',       label: 'Receipt / Bill',        hint: 'Photo of bill or receipt' },
  { key: 'product_image_url',       label: 'Product Image',         hint: 'Photo of item purchased' },
  { key: 'payment_screenshot_url',  label: 'Payment Screenshot',    hint: 'GPay / UPI / Bank screenshot' },
];

const emptyForm = {
  expense_date: new Date().toISOString().split('T')[0],
  category: 'Miscellaneous' as Expense['category'],
  description: '', amount: '', payment_mode: 'UPI', reference_number: '', notes: '',
  receipt_image_url: '',
  product_image_url: '',
  payment_screenshot_url: '',
};

export default function Expenses() {
  const { dateRange } = useDateRange();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [viewingExpense, setViewingExpense] = useState<Expense | null>(null);
  const [confirmExpense, setConfirmExpense] = useState<Expense | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileRefs = {
    receipt_image_url:      useRef<HTMLInputElement>(null),
    product_image_url:      useRef<HTMLInputElement>(null),
    payment_screenshot_url: useRef<HTMLInputElement>(null),
  };

  useEffect(() => { loadExpenses(); }, [dateRange]);

  const loadExpenses = async () => {
    const { data } = await supabase.from('expenses').select('*')
      .gte('expense_date', dateRange.from)
      .lte('expense_date', dateRange.to)
      .order('expense_date', { ascending: false });
    setExpenses(data || []);
  };

  const openAdd = () => {
    setEditingExpense(null);
    setForm({ ...emptyForm, expense_date: new Date().toISOString().split('T')[0] });
    setShowModal(true);
  };

  const openEdit = (e: Expense) => {
    setEditingExpense(e);
    setForm({
      expense_date: e.expense_date,
      category: e.category,
      description: e.description,
      amount: String(e.amount),
      payment_mode: e.payment_mode,
      reference_number: e.reference_number || '',
      notes: e.notes || '',
      receipt_image_url: (e as Record<string, string>).receipt_image_url || '',
      product_image_url: (e as Record<string, string>).product_image_url || '',
      payment_screenshot_url: (e as Record<string, string>).payment_screenshot_url || '',
    });
    setShowModal(true);
  };

  const uploadImage = async (slot: ImageSlot['key'], file: File) => {
    setUploading(u => ({ ...u, [slot]: true }));
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${slot}/${generateId('IMG')}.${ext}`;
      const { error } = await supabase.storage.from('expense-receipts').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('expense-receipts').getPublicUrl(path);
      setForm(f => ({ ...f, [slot]: publicUrl }));
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(u => ({ ...u, [slot]: false }));
    }
  };

  const removeImage = async (slot: ImageSlot['key']) => {
    const url = form[slot];
    if (url) {
      // Extract path from URL for deletion
      const path = url.split('/expense-receipts/')[1];
      if (path) await supabase.storage.from('expense-receipts').remove([path]);
    }
    setForm(f => ({ ...f, [slot]: '' }));
  };

  const handleSave = async () => {
    const payload = {
      expense_date: form.expense_date,
      category: form.category,
      description: form.description,
      amount: parseFloat(form.amount) || 0,
      payment_mode: form.payment_mode,
      reference_number: form.reference_number || null,
      notes: form.notes || null,
      receipt_image_url: form.receipt_image_url || null,
      product_image_url: form.product_image_url || null,
      payment_screenshot_url: form.payment_screenshot_url || null,
    };
    if (editingExpense) {
      await supabase.from('expenses').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingExpense.id);
    } else {
      await supabase.from('expenses').insert({ expense_number: generateId('EXP'), ...payload });
    }
    setShowModal(false);
    loadExpenses();
  };

  const handleDelete = async (e: Expense) => {
    setDeleting(true);
    try {
      // Delete attached images from storage first
      const paths: string[] = [];
      for (const key of ['receipt_image_url', 'product_image_url', 'payment_screenshot_url'] as const) {
        const url = (e as Record<string, string>)[key];
        if (url) {
          const segment = url.split('/expense-receipts/')[1];
          if (segment) paths.push(segment.split('?')[0]); // strip any query params
        }
      }
      if (paths.length > 0) {
        await supabase.storage.from('expense-receipts').remove(paths);
      }
      const { error } = await supabase.from('expenses').delete().eq('id', e.id);
      if (error) throw error;
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setDeleting(false);
      setConfirmExpense(null);
      loadExpenses();
    }
  };

  const handleExport = () => {
    exportToCSV(filtered.map(e => ({
      expense_number: e.expense_number,
      expense_date: e.expense_date,
      category: e.category,
      description: e.description,
      amount: e.amount,
      payment_mode: e.payment_mode,
      reference_number: e.reference_number || '',
      notes: e.notes || '',
    })), 'expenses');
  };

  const filtered = expenses.filter(e => {
    const matchSearch = e.description.toLowerCase().includes(search.toLowerCase());
    const matchCat = catFilter === 'All' || e.category === catFilter;
    return matchSearch && matchCat;
  });

  const totalExpenses = filtered.reduce((s, e) => s + e.amount, 0);
  const catTotals = CATEGORIES.map(cat => ({
    cat, total: expenses.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0),
  })).sort((a, b) => b.total - a.total);

  const getCatColor = (cat: string) => {
    const map: Record<string, string> = {
      'Rent': 'bg-primary-100 text-primary-700',
      'Travel': 'bg-blue-100 text-blue-700',
      'Marketing': 'bg-green-100 text-green-700',
      'Courier': 'bg-orange-100 text-orange-700',
      'Utilities': 'bg-yellow-100 text-yellow-700',
      'Supplies': 'bg-accent-100 text-accent-700',
      'Salary': 'bg-neutral-200 text-neutral-700',
      'Miscellaneous': 'bg-neutral-100 text-neutral-500',
    };
    return map[cat] || 'bg-neutral-100 text-neutral-600';
  };

  const hasImages = (e: Expense) => {
    const ex = e as Record<string, string>;
    return !!(ex.receipt_image_url || ex.product_image_url || ex.payment_screenshot_url);
  };

  // Image upload tile component
  const ImageUploadTile = ({ slot }: { slot: ImageSlot }) => {
    const url = form[slot.key];
    const isLoading = uploading[slot.key];
    return (
      <div className="space-y-1">
        <label className="label">{slot.label}</label>
        <input
          ref={fileRefs[slot.key]}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(slot.key, f); }}
        />
        {url ? (
          <div className="relative group rounded-lg overflow-hidden border border-neutral-200 bg-neutral-50" style={{ height: 90 }}>
            <img
              src={url} alt={slot.label}
              className="w-full h-full object-cover cursor-pointer"
              onClick={() => setLightbox(url)}
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
              <button
                type="button"
                onClick={() => fileRefs[slot.key].current?.click()}
                className="w-7 h-7 bg-white rounded-full flex items-center justify-center shadow text-neutral-700 hover:bg-neutral-100"
                title="Replace"
              >
                <Upload className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => removeImage(slot.key)}
                className="w-7 h-7 bg-white rounded-full flex items-center justify-center shadow text-error-600 hover:bg-error-50"
                title="Remove"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRefs[slot.key].current?.click()}
            disabled={isLoading}
            className="w-full border-2 border-dashed border-neutral-200 rounded-lg flex flex-col items-center justify-center gap-1.5 text-neutral-400 hover:border-primary-300 hover:text-primary-500 transition-colors"
            style={{ height: 90 }}
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <ImagePlus className="w-5 h-5" />
                <span className="text-[10px] font-medium text-center px-2">{slot.hint}</span>
              </>
            )}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-error-50 rounded-lg flex items-center justify-center">
              <Receipt className="w-4 h-4 text-error-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-neutral-900 leading-tight">Expenses</p>
              <p className="text-[10px] text-neutral-400">Track all business expenses</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5 ml-2">
            <span className="text-xs font-bold text-error-600">{formatCurrency(totalExpenses)}</span>
            <span className="text-[10px] text-neutral-400">{filtered.length} entries</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="input pl-7 w-40" />
          </div>
          <button onClick={handleExport} className="btn-secondary"><Download className="w-3.5 h-3.5" /> Export</button>
          <button onClick={openAdd} className="btn-primary"><Plus className="w-3.5 h-3.5" /> Add Expense</button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-5 py-3 space-y-3">
        {/* Category filter chips */}
        <div className="flex flex-wrap gap-1.5">
          {['All', ...CATEGORIES].map(c => (
            <button key={c} onClick={() => setCatFilter(c)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${catFilter === c ? 'bg-primary-600 text-white' : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>
              {c}
            </button>
          ))}
        </div>

        {/* Category bar chart inline */}
        {catTotals.some(c => c.total > 0) && (
          <div className="bg-white rounded-xl border border-neutral-100 shadow-card px-4 py-3 flex items-center gap-6 overflow-x-auto">
            {catTotals.filter(c => c.total > 0).map(({ cat, total }) => {
              const max = catTotals[0]?.total || 1;
              return (
                <div key={cat} className="flex items-center gap-2 shrink-0 cursor-pointer" onClick={() => setCatFilter(catFilter === cat ? 'All' : cat)}>
                  <div className="w-1.5 h-8 bg-neutral-100 rounded-full overflow-hidden">
                    <div className="w-full bg-primary-400 rounded-full transition-all" style={{ height: `${(total / max) * 100}%`, marginTop: `${100 - (total / max) * 100}%` }} />
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-neutral-500 leading-tight">{cat}</p>
                    <p className="text-xs font-bold text-neutral-800">{formatCurrency(total)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-xl border border-neutral-100 shadow-card overflow-hidden">
          <table className="w-full">
            <thead className="bg-neutral-50 border-b border-neutral-100">
              <tr>
                <th className="table-header text-left">Date</th>
                <th className="table-header text-left">Category</th>
                <th className="table-header text-left">Description</th>
                <th className="table-header text-left">Mode</th>
                <th className="table-header text-left">Ref #</th>
                <th className="table-header text-center">Docs</th>
                <th className="table-header text-right">Amount</th>
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {filtered.map(e => {
                const ex = e as Record<string, string>;
                const imgCount = [ex.receipt_image_url, ex.product_image_url, ex.payment_screenshot_url].filter(Boolean).length;
                return (
                  <tr key={e.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="table-cell text-neutral-500">{formatDate(e.expense_date)}</td>
                    <td className="table-cell">
                      <span className={`badge text-[10px] ${getCatColor(e.category)}`}>{e.category}</span>
                    </td>
                    <td className="table-cell font-medium text-neutral-800">{e.description}</td>
                    <td className="table-cell text-neutral-500">{e.payment_mode}</td>
                    <td className="table-cell text-neutral-400 text-[11px]">{e.reference_number || '—'}</td>
                    <td className="table-cell text-center">
                      {imgCount > 0 ? (
                        <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                          <ImagePlus className="w-2.5 h-2.5" />{imgCount}
                        </span>
                      ) : <span className="text-neutral-300">—</span>}
                    </td>
                    <td className="table-cell text-right font-bold text-error-600">{formatCurrency(e.amount)}</td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setViewingExpense(e); setShowViewModal(true); }} title="View"
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openEdit(e)} title="Edit"
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setConfirmExpense(e)} title="Delete"
                          className="p-1.5 rounded-lg text-neutral-400 hover:text-error-600 hover:bg-error-50 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <EmptyState icon={Receipt} title="No expenses" description="Add your first expense entry." />}
        </div>
      </div>

      {/* Add / Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)}
        title={editingExpense ? 'Edit Expense' : 'Add Expense'} size="lg"
        footer={<>
          <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={Object.values(uploading).some(Boolean)} className="btn-primary">
            {Object.values(uploading).some(Boolean) ? 'Uploading...' : editingExpense ? 'Update' : 'Save Expense'}
          </button>
        </>}>
        <div className="space-y-3">
          {/* Row 1: Date, Category, Amount, Mode */}
          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="label">Date</label>
              <input type="date" value={form.expense_date} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="label">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as Expense['category'] }))} className="input">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Amount (₹) *</label>
              <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="input" placeholder="0" />
            </div>
            <div>
              <label className="label">Payment Mode</label>
              <select value={form.payment_mode} onChange={e => setForm(f => ({ ...f, payment_mode: e.target.value }))} className="input">
                {['UPI', 'Cash', 'Bank Transfer', 'Card', 'Cheque'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>
          {/* Row 2: Description + Reference */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="label">Description *</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input" placeholder="What was this expense for?" />
            </div>
            <div>
              <label className="label">Reference / UTR #</label>
              <input value={form.reference_number} onChange={e => setForm(f => ({ ...f, reference_number: e.target.value }))} className="input" placeholder="Optional" />
            </div>
          </div>
          {/* Row 3: Notes */}
          <div>
            <label className="label">Notes</label>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input" placeholder="Optional notes" />
          </div>
          {/* Row 4: 3 image slots */}
          <div>
            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">Attachments</p>
            <div className="grid grid-cols-3 gap-3">
              {IMAGE_SLOTS.map(slot => <ImageUploadTile key={slot.key} slot={slot} />)}
            </div>
          </div>
        </div>
      </Modal>

      {/* View Modal */}
      <Modal isOpen={showViewModal} onClose={() => setShowViewModal(false)} title="Expense Details" size="md"
        footer={
          <div className="flex gap-2">
            <button onClick={() => { setShowViewModal(false); if (viewingExpense) openEdit(viewingExpense); }} className="btn-secondary"><Pencil className="w-3 h-3" /> Edit</button>
            <button onClick={() => setShowViewModal(false)} className="btn-primary">Close</button>
          </div>
        }>
        {viewingExpense && (() => {
          const ex = viewingExpense as Record<string, string>;
          const images = IMAGE_SLOTS.map(s => ({ label: s.label, url: ex[s.key] })).filter(i => i.url);
          return (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="label">Expense #</p>
                  <p className="text-sm font-semibold text-primary-700">{viewingExpense.expense_number}</p>
                </div>
                <div>
                  <p className="label">Date</p>
                  <p className="text-sm font-medium">{formatDate(viewingExpense.expense_date)}</p>
                </div>
                <div>
                  <p className="label">Category</p>
                  <span className={`badge text-[10px] ${getCatColor(viewingExpense.category)}`}>{viewingExpense.category}</span>
                </div>
                <div>
                  <p className="label">Amount</p>
                  <p className="text-xl font-bold text-error-600">{formatCurrency(viewingExpense.amount)}</p>
                </div>
                <div className="col-span-2">
                  <p className="label">Description</p>
                  <p className="text-sm text-neutral-900">{viewingExpense.description}</p>
                </div>
                <div>
                  <p className="label">Payment Mode</p>
                  <p className="text-sm">{viewingExpense.payment_mode}</p>
                </div>
                <div>
                  <p className="label">Reference #</p>
                  <p className="text-sm">{viewingExpense.reference_number || '—'}</p>
                </div>
                {viewingExpense.notes && (
                  <div className="col-span-2">
                    <p className="label">Notes</p>
                    <p className="text-sm text-neutral-600">{viewingExpense.notes}</p>
                  </div>
                )}
              </div>
              {images.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">Attachments</p>
                  <div className="grid grid-cols-3 gap-2">
                    {images.map(img => (
                      <div key={img.label} className="space-y-1">
                        <p className="text-[10px] text-neutral-500 font-medium">{img.label}</p>
                        <img
                          src={img.url} alt={img.label}
                          className="w-full h-24 object-cover rounded-lg border border-neutral-200 cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setLightbox(img.url)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center" onClick={() => setLightbox(null)}>
            <X className="w-4 h-4 text-white" />
          </button>
          <img src={lightbox} alt="Attachment" className="max-w-full max-h-full rounded-lg object-contain" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Delete confirmation — inline to handle async properly */}
      {confirmExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !deleting && setConfirmExpense(null)} />
          <div className="relative bg-white rounded-2xl shadow-card-lg w-full max-w-sm p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-error-50 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-error-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">Delete Expense</h3>
                <p className="text-sm text-neutral-500 mt-1">Delete <span className="font-medium text-neutral-800">"{confirmExpense.description}"</span>? This also removes any attached images and cannot be undone.</p>
              </div>
            </div>
            <div className="flex gap-2 mt-5 justify-end">
              <button onClick={() => setConfirmExpense(null)} disabled={deleting} className="btn-secondary text-xs px-3 py-1.5">Cancel</button>
              <button
                onClick={() => handleDelete(confirmExpense)}
                disabled={deleting}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-error-600 hover:bg-error-700 disabled:opacity-60 transition-colors flex items-center gap-1.5"
              >
                {deleting ? <><div className="w-3 h-3 border-2 border-white/60 border-t-white rounded-full animate-spin" /> Deleting...</> : <><Trash2 className="w-3 h-3" /> Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
