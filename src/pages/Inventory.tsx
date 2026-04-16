import { useState, useEffect, useRef } from 'react';
import { Plus, ArrowUpDown, Search, BarChart2, AlertTriangle, ImagePlus, Download, History, Pencil, Trash2, Eye, X } from 'lucide-react';
import { supabase, uploadProductImage } from '../lib/supabase';
import { formatCurrency, generateId, exportToCSV, formatDate } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import type { Product, StockMovement, Godown } from '../types';
import { fetchCompanies } from '../lib/companiesService';
import type { Company } from '../lib/companiesService';

const CATEGORIES = ['All', 'Astro Products', 'Vastu Items', 'Healing Items'] as const;
const UNITS = ['pcs', 'grams', 'kg', 'sets', 'ml', 'liters'];

export default function Inventory() {
  const { isAdmin } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [filtered, setFiltered] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>('All');
  const [stockStatus, setStockStatus] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [confirmProduct, setConfirmProduct] = useState<Product | null>(null);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [openingStocks, setOpeningStocks] = useState<Record<string, string>>({});

  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [ledgerProduct, setLedgerProduct] = useState<Product | null>(null);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);

  const [form, setForm] = useState({
    name: '', category: 'Astro Products' as Product['category'], unit: 'pcs',
    purchase_price: '', selling_price: '', low_stock_alert: '5',
    description: '', sku: '', image_url: '',
    direction: '', is_gemstone: false, weight_grams: '',
    total_weight: '', weight_unit: 'grams' as 'grams' | 'carats',
    low_stock_enabled: true,
    company_id: '',
  });
  const [stockForm, setStockForm] = useState({ type: 'adjustment', quantity: '', notes: '', movement_label: 'adjustment' });
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');

  useEffect(() => { loadData(); fetchCompanies().then(setCompanies); }, []);

  useEffect(() => {
    let data = products;
    if (category !== 'All') data = data.filter(p => p.category === category);
    if (stockStatus === 'In Stock') data = data.filter(p => p.stock_quantity > p.low_stock_alert);
    if (stockStatus === 'Low Alert') data = data.filter(p => p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_alert);
    if (stockStatus === 'Out of Stock') data = data.filter(p => p.stock_quantity <= 0);
    if (search) data = data.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()));
    setFiltered(data);
  }, [products, category, stockStatus, search]);

  const loadData = async () => {
    setLoading(true);
    const [productsRes, godownsRes, godownStockRes] = await Promise.all([
      supabase.from('products').select('*').eq('is_active', true).order('created_at', { ascending: false }),
      supabase.from('godowns').select('*').eq('is_active', true).order('name'),
      supabase.from('godown_stock').select('product_id, quantity'),
    ]);
    const rawProducts = productsRes.data || [];
    const stockRows = godownStockRes.data || [];
    const stockTotals: Record<string, number> = {};
    for (const row of stockRows) {
      stockTotals[row.product_id] = (stockTotals[row.product_id] || 0) + (row.quantity || 0);
    }
    const merged = rawProducts.map(p => ({
      ...p,
      stock_quantity: stockTotals[p.id] ?? p.stock_quantity,
    }));
    setProducts(merged);
    setGodowns(godownsRes.data || []);
    setLoading(false);
  };

  const openAdd = () => {
    setEditing(null);
    setPendingImageFile(null);
    setImagePreview('');
    const stocks: Record<string, string> = {};
    (godowns).forEach(g => { stocks[g.id] = '0'; });
    setOpeningStocks(stocks);
    const defaultCompany = companies.find(c => c.sort_order === 2) || companies[0];
    setForm({
      name: '', category: 'Astro Products', unit: 'pcs',
      purchase_price: '', selling_price: '', low_stock_alert: '5',
      description: '', sku: generateId('SKU'), image_url: '',
      direction: '', is_gemstone: false, weight_grams: '',
      total_weight: '', weight_unit: 'grams',
      low_stock_enabled: true,
      company_id: defaultCompany?.id || '',
    });
    setShowModal(true);
  };

  const [editGodownStocks, setEditGodownStocks] = useState<Record<string, string>>({});

  const openEdit = async (p: Product) => {
    setEditing(p);
    setPendingImageFile(null);
    setImagePreview(p.image_url || '');
    setOpeningStocks({});
    const { data: stocks } = await supabase.from('godown_stock').select('godown_id, quantity').eq('product_id', p.id);
    const stocksMap: Record<string, string> = {};
    (stocks || []).forEach(s => { stocksMap[s.godown_id] = String(s.quantity); });
    godowns.forEach(g => { if (!stocksMap[g.id]) stocksMap[g.id] = '0'; });
    setEditGodownStocks(stocksMap);
    setForm({
      name: p.name, category: p.category, unit: p.unit,
      purchase_price: String(p.purchase_price), selling_price: String(p.selling_price),
      low_stock_alert: String(p.low_stock_alert),
      description: p.description || '', sku: p.sku, image_url: p.image_url || '',
      direction: p.direction || '', is_gemstone: p.is_gemstone || false,
      weight_grams: p.weight_grams ? String(p.weight_grams) : '',
      total_weight: p.total_weight ? String(p.total_weight) : '',
      weight_unit: (p.weight_unit as 'grams' | 'carats') || 'grams',
      low_stock_enabled: p.low_stock_alert > 0,
      company_id: (p as unknown as { company_id?: string }).company_id || '',
    });
    setShowModal(true);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    let imageUrl = form.image_url;
    if (pendingImageFile) {
      setImageUploading(true);
      const tempId = editing?.id || generateId('IMG');
      const uploaded = await uploadProductImage(pendingImageFile, tempId);
      if (uploaded) imageUrl = uploaded;
      setImageUploading(false);
    }
    const totalW = form.is_gemstone && form.total_weight ? parseFloat(form.total_weight) || 0 : 0;
    const totalOpening = Object.values(openingStocks).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
    const payload = {
      name: form.name, category: form.category, unit: form.unit, sku: form.sku,
      purchase_price: parseFloat(form.purchase_price) || 0,
      selling_price: parseFloat(form.selling_price) || 0,
      stock_quantity: editing ? undefined : totalOpening,
      low_stock_alert: form.low_stock_enabled ? (parseFloat(form.low_stock_alert) || 5) : 0,
      description: form.description,
      image_url: imageUrl || null,
      direction: form.direction || null,
      is_gemstone: form.is_gemstone,
      weight_grams: form.is_gemstone && form.weight_grams ? parseFloat(form.weight_grams) || null : null,
      total_weight: totalW,
      remaining_weight: editing ? undefined : totalW,
      weight_unit: form.is_gemstone ? form.weight_unit : null,
      updated_at: new Date().toISOString(),
    };
    if (editing) {
      const { stock_quantity: _sq, remaining_weight: _rw, ...editPayload } = payload;
      await supabase.from('products').update(editPayload).eq('id', editing.id);
      for (const [godownId, qtyStr] of Object.entries(editGodownStocks)) {
        const qty = parseFloat(qtyStr) || 0;
        await supabase.from('godown_stock').upsert({
          product_id: editing.id,
          godown_id: godownId,
          quantity: qty,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'godown_id,product_id' });
      }
      const totalStock = Object.values(editGodownStocks).reduce((s, v) => s + (parseFloat(v) || 0), 0);
      await supabase.from('products').update({ stock_quantity: totalStock }).eq('id', editing.id);
    } else {
      const { data: newProduct } = await supabase.from('products').insert(payload).select().maybeSingle();
      if (newProduct) {
        for (const [godownId, qtyStr] of Object.entries(openingStocks)) {
          const qty = parseFloat(qtyStr) || 0;
          if (qty > 0) {
            await supabase.from('godown_stock').upsert({
              product_id: newProduct.id,
              godown_id: godownId,
              quantity: qty,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'godown_id,product_id' });
            await supabase.from('stock_movements').insert({
              product_id: newProduct.id,
              movement_type: 'in',
              quantity: qty,
              godown_id: godownId,
              notes: 'Opening stock',
              reference_type: 'opening_stock',
            });
          }
        }
      }
    }
    setShowModal(false);
    loadData();
  };

  const handleDelete = async (p: Product) => {
    await supabase.from('products').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', p.id);
    loadData();
  };

  const openStockModal = (p: Product) => {
    setSelectedProduct(p);
    setStockForm({ type: 'in', quantity: '', notes: '', movement_label: 'in' });
    setShowStockModal(true);
  };

  const openLedgerModal = async (p: Product) => {
    setLedgerProduct(p);
    setShowLedgerModal(true);
    const { data } = await supabase.from('stock_movements').select('*').eq('product_id', p.id).order('created_at', { ascending: false }).limit(50);
    setStockMovements(data || []);
  };

  const handleStockUpdate = async () => {
    if (!selectedProduct) return;
    const qty = parseFloat(stockForm.quantity) || 0;
    const mvType = stockForm.movement_label;
    const isIn = ['in', 'purchase', 'return'].includes(mvType);
    const newQty = isIn
      ? selectedProduct.stock_quantity + qty
      : mvType === 'adjustment' ? qty
      : Math.max(0, selectedProduct.stock_quantity - qty);

    const updates: Record<string, unknown> = { stock_quantity: newQty, updated_at: new Date().toISOString() };
    if (selectedProduct.is_gemstone && selectedProduct.total_weight) {
      const weightAmt = parseFloat(stockForm.quantity) || 0;
      if (isIn) {
        updates.remaining_weight = (selectedProduct.remaining_weight || 0) + weightAmt;
        updates.total_weight = (selectedProduct.total_weight || 0) + (mvType === 'purchase' ? weightAmt : 0);
      } else if (mvType !== 'adjustment') {
        updates.remaining_weight = Math.max(0, (selectedProduct.remaining_weight || 0) - weightAmt);
      }
    }
    await supabase.from('products').update(updates).eq('id', selectedProduct.id);
    await supabase.from('stock_movements').insert({
      product_id: selectedProduct.id,
      movement_type: mvType,
      quantity: qty,
      notes: stockForm.notes,
    });
    setShowStockModal(false);
    loadData();
  };

  const handleExport = () => {
    exportToCSV(filtered.map(p => ({
      sku: p.sku, name: p.name, category: p.category, unit: p.unit,
      purchase_price: p.purchase_price, selling_price: p.selling_price,
      stock_quantity: p.stock_quantity, low_stock_alert: p.low_stock_alert,
    })), 'products');
  };

  const totalValuation = products.reduce((s, p) => s + p.stock_quantity * p.purchase_price, 0);
  const lowStockCount = products.filter(p => p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_alert).length;

  const getStockBar = (p: Product) => {
    const ratio = p.low_stock_alert > 0 ? p.stock_quantity / (p.low_stock_alert * 3) : 1;
    const pct = Math.min(100, ratio * 100);
    const color = p.stock_quantity <= 0 ? 'bg-error-500' : p.stock_quantity <= p.low_stock_alert ? 'bg-warning-500' : 'bg-success-500';
    return { pct, color };
  };

  const getCategoryColor = (cat: string) => {
    const map: Record<string, string> = {
      'Astro Products': 'bg-primary-100 text-primary-700',
      'Vastu Items': 'bg-blue-100 text-blue-700',
      'Healing Items': 'bg-green-100 text-green-700',
    };
    return map[cat] || 'bg-neutral-100 text-neutral-600';
  };

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="bg-white border-b border-neutral-100 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-neutral-900">Products</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Curating divine inventory for earthly prosperity.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="btn-secondary">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={openAdd} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Product
          </button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 card">
            <div className="flex items-center gap-6 flex-wrap">
              <div>
                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">Category</p>
                <div className="flex gap-1.5 flex-wrap">
                  {CATEGORIES.map(c => (
                    <button key={c} onClick={() => setCategory(c)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${category === c ? 'bg-primary-600 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">Stock</p>
                <div className="flex gap-1.5">
                  {['All', 'In Stock', 'Low Alert', 'Out of Stock'].map(s => (
                    <button key={s} onClick={() => setStockStatus(s)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${stockStatus === s ? 'bg-neutral-800 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ml-auto">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="input pl-8 w-44 text-xs" />
                </div>
              </div>
            </div>
          </div>
          <div className="card flex flex-col justify-center">
            <p className="text-[10px] font-semibold text-primary-600 uppercase tracking-wider">{isAdmin ? 'Inventory Valuation' : 'Total Products'}</p>
            <p className="text-3xl font-bold text-neutral-900 mt-1">{isAdmin ? formatCurrency(totalValuation) : products.length}</p>
            <div className="flex items-center gap-2 mt-1.5">
              {lowStockCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-warning-600 bg-warning-50 px-2 py-0.5 rounded-full">
                  <AlertTriangle className="w-3 h-3" /> {lowStockCount} low
                </span>
              )}
              <span className="text-xs text-neutral-400">{products.length} products</span>
            </div>
          </div>
        </div>

        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-neutral-50 border-b border-neutral-100">
              <tr>
                <th className="table-header text-left">Product</th>
                <th className="table-header text-left">Category</th>
                <th className="table-header text-left">Unit</th>
                <th className="table-header text-left">Price</th>
                <th className="table-header text-left">Stock</th>
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const bar = getStockBar(p);
                return (
                  <tr key={p.id} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors cursor-pointer" onClick={() => setViewProduct(p)}>
                    <td className="table-cell">
                      <div className="flex items-center gap-2.5">
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} className="w-8 h-8 rounded-lg object-cover flex-shrink-0 border border-neutral-100" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center flex-shrink-0">
                            <ImagePlus className="w-3.5 h-3.5 text-neutral-300" />
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-neutral-900 text-sm leading-tight">{p.name}</p>
                          <p className="text-[10px] text-neutral-400">{p.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="table-cell">
                      <span className={`badge text-[10px] font-semibold uppercase tracking-wider ${getCategoryColor(p.category)}`}>{p.category}</span>
                      {p.company_id && companies.find(c => c.id === p.company_id) && (
                        <span className="badge text-[10px] bg-blue-50 text-blue-700 ml-1">{companies.find(c => c.id === p.company_id)!.name}</span>
                      )}
                    </td>
                    <td className="table-cell text-xs text-neutral-500">{p.unit}</td>
                    <td className="table-cell">
                      {isAdmin && <p className="text-[10px] text-neutral-400">P: {formatCurrency(p.purchase_price)}</p>}
                      <p className="text-xs font-semibold text-primary-700">S: {formatCurrency(p.selling_price)}</p>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${bar.color}`} style={{ width: `${bar.pct}%` }} />
                        </div>
                        <span className={`text-xs font-medium ${p.stock_quantity <= 0 ? 'text-error-600' : p.stock_quantity <= p.low_stock_alert ? 'text-warning-600' : 'text-neutral-700'}`}>
                          {p.stock_quantity}
                        </span>
                      </div>
                    </td>
                    <td className="table-cell text-right" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(p)} title="Edit" className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openStockModal(p)} title="Stock In/Out" className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-primary-600 transition-colors">
                          <ArrowUpDown className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openLedgerModal(p)} title="Movement Ledger" className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-blue-600 transition-colors">
                          <History className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setConfirmProduct(p)} title="Delete" className="p-1.5 rounded-lg hover:bg-error-50 text-neutral-400 hover:text-error-600 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && !loading && (
            <EmptyState icon={BarChart2} title="No products found" description="Add your first product or adjust filters." />
          )}
        </div>

        {lowStockCount > 0 && (
          <div className="card border-l-4 border-warning-500 py-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 text-warning-600" />
              <p className="text-xs font-semibold text-warning-700">Low Stock Alerts</p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {products.filter(p => p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_alert).map(p => (
                <div key={p.id} className="flex items-center justify-between bg-warning-50 px-2.5 py-1.5 rounded-lg">
                  <span className="text-xs text-neutral-700 truncate">{p.name}</span>
                  <span className="text-xs font-bold text-warning-700 ml-2 shrink-0">{p.stock_quantity}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? 'Edit Product' : 'Add Product'}
        size="lg"
        footer={
          <>
            <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSave} disabled={imageUploading} className="btn-primary">
              {imageUploading ? 'Uploading...' : editing ? 'Update Product' : 'Add Product'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-16 h-16 rounded-xl border-2 border-dashed border-neutral-200 flex items-center justify-center cursor-pointer hover:border-primary-400 transition-colors overflow-hidden flex-shrink-0"
            >
              {imagePreview ? (
                <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
              ) : (
                <ImagePlus className="w-5 h-5 text-neutral-300" />
              )}
            </div>
            <div className="flex-1 grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <label className="label">Product Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input" placeholder="e.g., Natural Citrine Point" />
              </div>
              <div>
                <label className="label">SKU</label>
                <input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} className="input text-xs" placeholder="SKU..." />
              </div>
              <div>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="btn-secondary text-xs mt-4 w-full">
                  {imagePreview ? 'Change Image' : 'Upload Image'}
                </button>
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value as Product['category'] }))} className="input text-xs">
                <option>Astro Products</option>
                <option>Vastu Items</option>
                <option>Healing Items</option>
              </select>
            </div>
            <div>
              <label className="label">Unit</label>
              <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className="input text-xs">
                {UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Vastu Direction</label>
              <input value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value }))} className="input text-xs" placeholder="N, S, NE..." />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 items-end">
            <div className="flex items-center gap-2 pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <div onClick={() => setForm(f => ({ ...f, is_gemstone: !f.is_gemstone }))}
                  className={`w-8 h-4 rounded-full transition-colors cursor-pointer ${form.is_gemstone ? 'bg-primary-600' : 'bg-neutral-200'}`}>
                  <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform border border-neutral-200 ${form.is_gemstone ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
                <span className="text-xs text-neutral-600">Gemstone</span>
              </label>
            </div>
            <div className="flex items-center gap-2 pb-1">
              <div onClick={() => setForm(f => ({ ...f, low_stock_enabled: !f.low_stock_enabled }))}
                className={`w-8 h-4 rounded-full transition-colors cursor-pointer flex-shrink-0 ${form.low_stock_enabled ? 'bg-primary-600' : 'bg-neutral-200'}`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform border border-neutral-200 ${form.low_stock_enabled ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
              <span className="text-xs text-neutral-600">Low stock alert</span>
            </div>
            {form.low_stock_enabled && (
              <div>
                <label className="label">Alert at qty</label>
                <input type="number" value={form.low_stock_alert} onChange={e => setForm(f => ({ ...f, low_stock_alert: e.target.value }))} className="input text-xs" />
              </div>
            )}
          </div>

          {form.is_gemstone && (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="label">Weight Unit</label>
                <select value={form.weight_unit} onChange={e => setForm(f => ({ ...f, weight_unit: e.target.value as 'grams' | 'carats' }))} className="input text-xs">
                  <option value="grams">Grams (g)</option>
                  <option value="carats">Carats (ct)</option>
                </select>
              </div>
              <div>
                <label className="label">Total Weight</label>
                <input type="number" step="0.01" value={form.total_weight} onChange={e => setForm(f => ({ ...f, total_weight: e.target.value }))} className="input text-xs" placeholder="0" />
              </div>
              <div>
                <label className="label">Weight/piece</label>
                <input type="number" step="0.01" value={form.weight_grams} onChange={e => setForm(f => ({ ...f, weight_grams: e.target.value }))} className="input text-xs" placeholder="0" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            {isAdmin && (
              <div>
                <label className="label">Purchase Price (₹)</label>
                <input type="number" value={form.purchase_price} onChange={e => setForm(f => ({ ...f, purchase_price: e.target.value }))} className="input" placeholder="0" />
              </div>
            )}
            <div>
              <label className="label">Selling Price (₹)</label>
              <input type="number" value={form.selling_price} onChange={e => setForm(f => ({ ...f, selling_price: e.target.value }))} className="input" placeholder="0" />
            </div>
          </div>
          {godowns.length > 0 && (
            <div className="col-span-2">
              <label className="label">{editing ? 'Stock per Godown' : 'Opening Stock per Godown'}</label>
              <div className="grid grid-cols-2 gap-2">
                {godowns.map(g => (
                  <div key={g.id} className="flex items-center gap-2">
                    <span className="text-xs text-neutral-600 flex-1 truncate">{g.name}</span>
                    <input
                      type="number"
                      min="0"
                      value={editing ? (editGodownStocks[g.id] || '0') : (openingStocks[g.id] || '0')}
                      onChange={e => editing
                        ? setEditGodownStocks(s => ({ ...s, [g.id]: e.target.value }))
                        : setOpeningStocks(s => ({ ...s, [g.id]: e.target.value }))
                      }
                      className="input text-xs py-1.5 w-20 shrink-0"
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
              {editing && (
                <p className="text-[10px] text-neutral-400 mt-1">Updating these values will directly set the stock quantity per godown</p>
              )}
            </div>
          )}
          <div className="col-span-2">
            <label className="label">Billing Entity (for invoices)</label>
            <select value={form.company_id} onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))} className="input text-xs">
              <option value="">-- Select Company --</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <p className="text-[10px] text-neutral-400 mt-0.5">Which entity's name appears on invoices for this product?</p>
          </div>
          <div className="col-span-2">
            <label className="label">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input resize-none h-16" placeholder="Optional description..." />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showStockModal && !!selectedProduct}
        onClose={() => setShowStockModal(false)}
        title={`Update Stock — ${selectedProduct?.name || ''}`}
        size="sm"
        footer={
          <>
            <button onClick={() => setShowStockModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleStockUpdate} className="btn-primary">Update Stock</button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="label">Movement Type</label>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { value: 'purchase', label: 'Purchase (In)' },
                { value: 'sale', label: 'Sale (Out)' },
                { value: 'return', label: 'Return (In)' },
                { value: 'adjustment', label: 'Adjustment' },
              ].map(t => (
                <button key={t.value} onClick={() => setStockForm(f => ({ ...f, movement_label: t.value, type: ['purchase', 'return'].includes(t.value) ? 'in' : t.value === 'sale' ? 'out' : 'adjustment' }))}
                  className={`py-1.5 px-3 rounded-lg text-xs font-medium transition-colors text-left ${stockForm.movement_label === t.value ? 'bg-primary-600 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Quantity</label>
            <input type="number" step={selectedProduct?.is_gemstone ? '0.01' : '1'} min={0} value={stockForm.quantity} onChange={e => setStockForm(f => ({ ...f, quantity: e.target.value }))} className="input" placeholder="0" />
          </div>
          <div>
            <label className="label">Notes / Reference</label>
            <input value={stockForm.notes} onChange={e => setStockForm(f => ({ ...f, notes: e.target.value }))} className="input" placeholder="Invoice #, supplier name, reason..." />
          </div>
          {selectedProduct && (
            <div className="bg-neutral-50 px-3 py-2 rounded-lg">
              <p className="text-xs text-neutral-500">Current stock: <strong>{selectedProduct.stock_quantity} {selectedProduct.unit}</strong></p>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showLedgerModal}
        onClose={() => setShowLedgerModal(false)}
        title={`Stock Ledger — ${ledgerProduct?.name || ''}`}
        size="lg"
        footer={<button onClick={() => setShowLedgerModal(false)} className="btn-secondary">Close</button>}
      >
        <div>
          {ledgerProduct && (
            <div className="flex items-center gap-4 mb-3 p-3 bg-neutral-50 rounded-xl">
              <div>
                <p className="text-xs text-neutral-400">Current Stock</p>
                <p className="text-lg font-bold text-neutral-800">{ledgerProduct.stock_quantity} {ledgerProduct.unit}</p>
              </div>
            </div>
          )}
          {stockMovements.length === 0 ? (
            <EmptyState icon={History} title="No movements yet" description="Stock movements will appear here after purchases, sales, and adjustments." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100">
                    <th className="table-header text-left">Date</th>
                    <th className="table-header text-left">Type</th>
                    <th className="table-header text-right">Qty In</th>
                    <th className="table-header text-right">Qty Out</th>
                    <th className="table-header text-left">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {stockMovements.map(mv => {
                    const isIn = ['in', 'purchase', 'return'].includes(mv.movement_type);
                    const typeColors: Record<string, string> = {
                      purchase: 'bg-success-50 text-success-700',
                      sale: 'bg-error-50 text-error-700',
                      return: 'bg-blue-50 text-blue-700',
                      adjustment: 'bg-neutral-100 text-neutral-600',
                      in: 'bg-success-50 text-success-700',
                      out: 'bg-error-50 text-error-700',
                    };
                    return (
                      <tr key={mv.id} className="hover:bg-neutral-50 transition-colors">
                        <td className="table-cell text-xs text-neutral-500">{formatDate(mv.created_at)}</td>
                        <td className="table-cell">
                          <span className={`badge text-[10px] capitalize ${typeColors[mv.movement_type] || 'bg-neutral-100 text-neutral-600'}`}>{mv.movement_type}</span>
                        </td>
                        <td className="table-cell text-right font-medium text-success-600 text-xs">
                          {isIn ? `+${mv.quantity}` : '—'}
                        </td>
                        <td className="table-cell text-right font-medium text-error-600 text-xs">
                          {!isIn && mv.movement_type !== 'adjustment' ? `-${mv.quantity}` : mv.movement_type === 'adjustment' ? `=${mv.quantity}` : '—'}
                        </td>
                        <td className="table-cell text-xs text-neutral-500 max-w-[160px] truncate">{mv.notes || mv.reference_number || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      {/* Product Detail View */}
      {viewProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setViewProduct(null)} />
          <div className="relative bg-white rounded-xl shadow-card-lg w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
              <p className="text-sm font-semibold text-neutral-900">{viewProduct.name}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => { setViewProduct(null); openEdit(viewProduct); }} className="btn-secondary text-xs">
                  <Pencil className="w-3 h-3" /> Edit
                </button>
                <button onClick={() => setViewProduct(null)} className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-neutral-100">
                  <X className="w-3.5 h-3.5 text-neutral-500" />
                </button>
              </div>
            </div>
            <div className="p-5 space-y-4">
              {/* Image */}
              <div className="flex gap-4 items-start">
                {viewProduct.image_url ? (
                  <img src={viewProduct.image_url} alt={viewProduct.name} className="w-28 h-28 rounded-xl object-cover border border-neutral-100 shrink-0" />
                ) : (
                  <div className="w-28 h-28 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
                    <ImagePlus className="w-8 h-8 text-neutral-300" />
                  </div>
                )}
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`badge text-[10px] font-semibold uppercase tracking-wider ${viewProduct.category === 'Astro Products' ? 'bg-primary-50 text-primary-700' : viewProduct.category === 'Vastu Items' ? 'bg-accent-50 text-accent-700' : 'bg-blue-50 text-blue-700'}`}>{viewProduct.category}</span>
                  </div>
                  <p className="text-sm font-bold text-neutral-900">{viewProduct.name}</p>
                  {viewProduct.description && <p className="text-xs text-neutral-500">{viewProduct.description}</p>}
                  <p className="text-[10px] text-neutral-400 font-mono">{viewProduct.sku}</p>
                </div>
              </div>
              {/* Details grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-neutral-50 rounded-lg p-3">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 mb-1">Sell Price</p>
                  <p className="text-sm font-bold text-primary-700">{formatCurrency(viewProduct.selling_price)}</p>
                </div>
                {isAdmin && (
                  <div className="bg-neutral-50 rounded-lg p-3">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 mb-1">Buy Price</p>
                    <p className="text-sm font-bold text-neutral-700">{formatCurrency(viewProduct.purchase_price)}</p>
                  </div>
                )}
                <div className={`rounded-lg p-3 ${viewProduct.stock_quantity <= 0 ? 'bg-error-50' : viewProduct.stock_quantity <= viewProduct.low_stock_alert ? 'bg-warning-50' : 'bg-success-50'}`}>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 mb-1">In Stock</p>
                  <p className={`text-sm font-bold ${viewProduct.stock_quantity <= 0 ? 'text-error-700' : viewProduct.stock_quantity <= viewProduct.low_stock_alert ? 'text-warning-700' : 'text-success-700'}`}>
                    {viewProduct.stock_quantity} {viewProduct.unit}
                  </p>
                </div>
                <div className="bg-neutral-50 rounded-lg p-3">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 mb-1">Unit</p>
                  <p className="text-xs font-semibold text-neutral-700">{viewProduct.unit}</p>
                </div>
                <div className="bg-neutral-50 rounded-lg p-3">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 mb-1">Low Stock Alert</p>
                  <p className="text-xs font-semibold text-neutral-700">{viewProduct.low_stock_alert}</p>
                </div>
                <div className={`rounded-lg p-3 ${viewProduct.is_active ? 'bg-success-50' : 'bg-neutral-100'}`}>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-400 mb-1">Status</p>
                  <p className={`text-xs font-bold ${viewProduct.is_active ? 'text-success-700' : 'text-neutral-500'}`}>{viewProduct.is_active ? 'Active' : 'Inactive'}</p>
                </div>
              </div>
              {/* Quick actions */}
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setViewProduct(null); openStockModal(viewProduct); }} className="btn-secondary text-xs flex-1 justify-center">
                  <ArrowUpDown className="w-3 h-3" /> Stock In/Out
                </button>
                <button onClick={() => { setViewProduct(null); openLedgerModal(viewProduct); }} className="btn-secondary text-xs flex-1 justify-center">
                  <History className="w-3 h-3" /> View Movements
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!confirmProduct}
        onClose={() => setConfirmProduct(null)}
        onConfirm={() => confirmProduct && handleDelete(confirmProduct)}
        title="Delete Product"
        message={`Delete "${confirmProduct?.name}"? This product will be removed from the inventory.`}
        confirmLabel="Delete"
        isDanger
      />
    </div>
  );
}
