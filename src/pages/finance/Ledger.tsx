import { useState, useEffect } from 'react';
import { Search, BookOpen, TrendingUp, TrendingDown, Download, CreditCard, Filter, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatDate } from '../../lib/utils';
import { useDateRange } from '../../contexts/DateRangeContext';
import Modal from '../../components/ui/Modal';

interface CustomerLedger {
  id: string;
  name: string;
  phone?: string;
  balance: number;
  total_revenue: number;
  invoice_count: number;
}

interface SupplierLedger {
  id: string;
  name: string;
  phone?: string;
  balance: number;
  entry_count: number;
}

interface LedgerLine {
  date: string;
  type: string;
  ref: string;
  debit: number;
  credit: number;
  balance: number;
  status?: string;
  mode?: string;
  invoice_id?: string;
  entry_id?: string;
}

type LedgerMode = 'customer' | 'supplier';
type FilterMode = 'all' | 'unpaid' | 'paid';

export default function Ledger() {
  const { dateRange } = useDateRange();

  const [mode, setMode] = useState<LedgerMode>('customer');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  const [customers, setCustomers] = useState<CustomerLedger[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);

  const [suppliers, setSuppliers] = useState<SupplierLedger[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);

  const [ledgerLines, setLedgerLines] = useState<LedgerLine[]>([]);

  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleAmount, setSettleAmount] = useState('');
  const [settleMode, setSettleMode] = useState<'Cash' | 'Bank Transfer' | 'UPI' | 'Cheque' | 'Card'>('UPI');
  const [settleRef, setSettleRef] = useState('');

  useEffect(() => {
    loadCustomerList();
    loadSupplierList();
  }, []);

  useEffect(() => {
    if (selectedCustomer && mode === 'customer') loadCustomerLedger(selectedCustomer);
  }, [dateRange, selectedCustomer]);

  useEffect(() => {
    if (selectedSupplier && mode === 'supplier') loadSupplierLedger(selectedSupplier);
  }, [dateRange, selectedSupplier]);

  const loadCustomerList = async () => {
    const { data: customersData } = await supabase
      .from('customers')
      .select('id, name, phone, balance, total_revenue')
      .eq('is_active', true)
      .order('name');

    const customerIds = (customersData || []).map(c => c.id);
    const { data: invoiceCount } = await supabase
      .from('invoices')
      .select('customer_id')
      .in('customer_id', customerIds);

    const countMap: Record<string, number> = {};
    (invoiceCount || []).forEach((i: { customer_id: string }) => {
      countMap[i.customer_id] = (countMap[i.customer_id] || 0) + 1;
    });

    setCustomers((customersData || []).map(c => ({
      ...c,
      invoice_count: countMap[c.id] || 0,
    })));
  };

  const loadSupplierList = async () => {
    const { data: suppliersData } = await supabase
      .from('suppliers')
      .select('id, name, phone')
      .eq('is_active', true)
      .order('name');

    const supplierIds = (suppliersData || []).map(s => s.id);

    const { data: entryData } = await supabase
      .from('purchase_entries')
      .select('supplier_id, outstanding_amount')
      .in('supplier_id', supplierIds);

    const countMap: Record<string, number> = {};
    const balanceMap: Record<string, number> = {};
    (entryData || []).forEach((e: { supplier_id: string; outstanding_amount: number }) => {
      countMap[e.supplier_id] = (countMap[e.supplier_id] || 0) + 1;
      balanceMap[e.supplier_id] = (balanceMap[e.supplier_id] || 0) + (e.outstanding_amount || 0);
    });

    setSuppliers((suppliersData || []).map(s => ({
      ...s,
      balance: balanceMap[s.id] || 0,
      entry_count: countMap[s.id] || 0,
    })));
  };

  const loadCustomerLedger = async (customerId: string) => {
    setSelectedCustomer(customerId);
    setLedgerLines([]);

    const fromDate = dateRange.from;
    const toDate = dateRange.to;

    const [invoicesRes, paymentsRes, returnsRes] = await Promise.all([
      supabase
        .from('invoices')
        .select('id, invoice_number, invoice_date, total_amount, paid_amount, outstanding_amount, status')
        .eq('customer_id', customerId)
        .gte('invoice_date', fromDate)
        .lte('invoice_date', toDate)
        .order('invoice_date'),
      supabase
        .from('payments')
        .select('payment_number, payment_date, amount, payment_mode')
        .eq('customer_id', customerId)
        .eq('payment_type', 'receipt')
        .gte('payment_date', fromDate)
        .lte('payment_date', toDate)
        .order('payment_date'),
      supabase
        .from('sales_returns')
        .select('return_number, return_date, total_amount')
        .eq('customer_id', customerId)
        .gte('return_date', fromDate)
        .lte('return_date', toDate)
        .order('return_date'),
    ]);

    const invLines: LedgerLine[] = (invoicesRes.data || []).map(inv => ({
      date: inv.invoice_date,
      type: 'Invoice',
      ref: inv.invoice_number,
      debit: inv.total_amount,
      credit: 0,
      balance: 0,
      status: inv.status,
      invoice_id: inv.id,
    }));

    const payLines: LedgerLine[] = (paymentsRes.data || []).map(pay => ({
      date: pay.payment_date,
      type: 'Payment',
      ref: pay.payment_number,
      debit: 0,
      credit: pay.amount,
      balance: 0,
      mode: pay.payment_mode,
    }));

    const returnLines: LedgerLine[] = (returnsRes.data || []).map(ret => ({
      date: ret.return_date,
      type: 'Return',
      ref: ret.return_number,
      debit: 0,
      credit: ret.total_amount,
      balance: 0,
    }));

    const combined = [...invLines, ...payLines, ...returnLines].sort((a, b) => a.date.localeCompare(b.date));
    let balance = 0;
    const lines = combined.map(line => {
      balance = balance + line.debit - line.credit;
      return { ...line, balance };
    });

    setLedgerLines(lines);
  };

  const loadSupplierLedger = async (supplierId: string) => {
    setSelectedSupplier(supplierId);
    setLedgerLines([]);

    const fromDate = dateRange.from;
    const toDate = dateRange.to;

    const [entriesRes, paymentsRes] = await Promise.all([
      supabase
        .from('purchase_entries')
        .select('id, entry_number, entry_date, total_amount, paid_amount, outstanding_amount, status')
        .eq('supplier_id', supplierId)
        .gte('entry_date', fromDate)
        .lte('entry_date', toDate)
        .order('entry_date'),
      supabase
        .from('payments')
        .select('payment_number, payment_date, amount, payment_mode')
        .eq('supplier_id', supplierId)
        .eq('payment_type', 'payment')
        .gte('payment_date', fromDate)
        .lte('payment_date', toDate)
        .order('payment_date'),
    ]);

    const entryLines: LedgerLine[] = (entriesRes.data || []).map(entry => ({
      date: entry.entry_date,
      type: 'Purchase',
      ref: entry.entry_number,
      debit: entry.total_amount,
      credit: 0,
      balance: 0,
      status: entry.status,
      entry_id: entry.id,
    }));

    const payLines: LedgerLine[] = (paymentsRes.data || []).map(pay => ({
      date: pay.payment_date,
      type: 'Payment',
      ref: pay.payment_number,
      debit: 0,
      credit: pay.amount,
      balance: 0,
      mode: pay.payment_mode,
    }));

    const combined = [...entryLines, ...payLines].sort((a, b) => a.date.localeCompare(b.date));
    let balance = 0;
    const lines = combined.map(line => {
      balance = balance + line.debit - line.credit;
      return { ...line, balance };
    });

    setLedgerLines(lines);
  };

  const handleSelectCustomer = (customerId: string) => {
    setLedgerLines([]);
    loadCustomerLedger(customerId);
  };

  const handleSelectSupplier = (supplierId: string) => {
    setLedgerLines([]);
    loadSupplierLedger(supplierId);
  };

  const handleModeSwitch = (newMode: LedgerMode) => {
    setMode(newMode);
    setLedgerLines([]);
    setFilterMode('all');
    if (newMode === 'customer') {
      setSelectedSupplier(null);
    } else {
      setSelectedCustomer(null);
    }
  };

  const handleSettle = async () => {
    const amount = parseFloat(settleAmount);
    if (!amount || amount <= 0) return;

    const payNum = `PAY-${Date.now().toString().slice(-6)}`;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

    if (mode === 'customer' && selectedCustomer) {
      const customer = customers.find(c => c.id === selectedCustomer);
      await supabase.from('payments').insert({
        payment_number: payNum,
        payment_type: 'receipt',
        reference_type: 'advance',
        customer_id: selectedCustomer,
        party_name: customer?.name || '',
        payment_date: todayStr,
        amount,
        payment_mode: settleMode,
        reference_number: settleRef || null,
        notes: 'Settled from Ledger',
      });
      await supabase.from('customers').update({ balance: (customer?.balance || 0) - amount }).eq('id', selectedCustomer);
      setShowSettleModal(false);
      setSettleAmount('');
      setSettleRef('');
      loadCustomerLedger(selectedCustomer);
      loadCustomerList();
    } else if (mode === 'supplier' && selectedSupplier) {
      const supplier = suppliers.find(s => s.id === selectedSupplier);
      await supabase.from('payments').insert({
        payment_number: payNum,
        payment_type: 'payment',
        reference_type: 'advance',
        supplier_id: selectedSupplier,
        party_name: supplier?.name || '',
        payment_date: todayStr,
        amount,
        payment_mode: settleMode,
        reference_number: settleRef || null,
        notes: 'Settled from Ledger',
      });
      setShowSettleModal(false);
      setSettleAmount('');
      setSettleRef('');
      loadSupplierLedger(selectedSupplier);
      loadSupplierList();
    }
  };

  const handlePrintStatement = () => {
    const partyName = mode === 'customer'
      ? customers.find(c => c.id === selectedCustomer)?.name || 'Customer'
      : suppliers.find(s => s.id === selectedSupplier)?.name || 'Supplier';

    const balance = mode === 'customer'
      ? customers.find(c => c.id === selectedCustomer)?.balance || 0
      : suppliers.find(s => s.id === selectedSupplier)?.balance || 0;

    const rows = filteredLines.map(line =>
      `<tr style="border-bottom:1px solid #eee">
        <td style="padding:6px 8px;color:#555">${formatDate(line.date)}</td>
        <td style="padding:6px 8px"><span style="background:#f0f0f0;padding:2px 8px;border-radius:4px;font-size:11px">${line.type}</span></td>
        <td style="padding:6px 8px;font-weight:500">${line.ref}</td>
        <td style="padding:6px 8px;text-align:right;color:${line.debit > 0 ? '#dc2626' : '#ccc'}">${line.debit > 0 ? formatCurrency(line.debit) : '-'}</td>
        <td style="padding:6px 8px;text-align:right;color:${line.credit > 0 ? '#16a34a' : '#ccc'}">${line.credit > 0 ? formatCurrency(line.credit) : '-'}</td>
        <td style="padding:6px 8px;text-align:right;font-weight:600;color:${line.balance > 0 ? '#dc2626' : '#16a34a'}">${formatCurrency(Math.abs(line.balance))}</td>
      </tr>`
    ).join('');

    const html = `<!DOCTYPE html><html><head><title>Account Statement - ${partyName}</title>
    <style>body{font-family:Arial,sans-serif;padding:32px;color:#111}table{width:100%;border-collapse:collapse}th{background:#f8f8f8;padding:8px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #ddd}</style>
    </head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px">
      <div><h2 style="margin:0;font-size:20px">Account Statement</h2><p style="margin:4px 0;color:#555;font-size:14px">${partyName}</p><p style="margin:0;color:#888;font-size:12px">Period: ${formatDate(dateRange.from)} to ${formatDate(dateRange.to)}</p></div>
      <div style="text-align:right"><p style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin:0">Balance Due</p><p style="font-size:22px;font-weight:bold;color:${balance > 0 ? '#dc2626' : '#16a34a'};margin:4px 0">${formatCurrency(Math.abs(balance))}</p><p style="font-size:12px;color:${balance > 0 ? '#dc2626' : '#16a34a'};margin:0">${balance > 0 ? (mode === 'customer' ? 'Receivable' : 'Payable') : 'Settled'}</p></div>
    </div>
    <table><thead><tr><th>Date</th><th>Type</th><th>Reference</th><th style="text-align:right">Debit (Dr)</th><th style="text-align:right">Credit (Cr)</th><th style="text-align:right">Balance</th></tr></thead><tbody>${rows}</tbody></table>
    <p style="margin-top:32px;font-size:10px;color:#aaa;text-align:center">Generated on ${new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' })}</p>
    </body></html>`;

    // Use hidden iframe to avoid blank popup (window.open blocked by browsers)
    const existingFrame = document.getElementById('ledger-print-frame');
    if (existingFrame) existingFrame.remove();
    const iframe = document.createElement('iframe');
    iframe.id = 'ledger-print-frame';
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none;';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (doc) { doc.open(); doc.write(html); doc.close(); }
    setTimeout(() => { iframe.contentWindow?.print(); }, 300);
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) || (c.phone || '').includes(customerSearch)
  );

  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase()) || (s.phone || '').includes(supplierSearch)
  );

  const filteredLines = ledgerLines.filter(line => {
    if (filterMode === 'all') return true;
    if (filterMode === 'unpaid') return line.type === 'Invoice' && line.status !== 'paid' && line.status !== 'cancelled';
    if (filterMode === 'paid') return line.type === 'Payment';
    return true;
  });

  const selectedCustomerData = customers.find(c => c.id === selectedCustomer);
  const selectedSupplierData = suppliers.find(s => s.id === selectedSupplier);

  const getTypeBadgeClass = (type: string) => {
    if (type === 'Invoice' || type === 'Purchase') return 'bg-primary-100 text-primary-700';
    if (type === 'Return') return 'bg-orange-100 text-orange-700';
    return 'bg-success-50 text-success-600';
  };

  const selectedPartyName = mode === 'customer'
    ? selectedCustomerData?.name
    : selectedSupplierData?.name;

  const selectedPartyBalance = mode === 'customer'
    ? selectedCustomerData?.balance
    : selectedSupplierData?.balance;

  const hasSelection = mode === 'customer' ? !!selectedCustomer : !!selectedSupplier;

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="bg-white border-b border-neutral-100 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-neutral-900">Party Ledger</h1>
            <p className="text-xs text-neutral-500 mt-0.5">
              {mode === 'customer' ? 'Customer-wise account statements' : 'Supplier-wise purchase statements'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {hasSelection && (
              <>
                <div className="flex items-center bg-neutral-100 rounded-lg p-0.5">
                  {(['all', 'unpaid', 'paid'] as FilterMode[]).map(f => (
                    <button key={f} onClick={() => setFilterMode(f)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all capitalize ${filterMode === f ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}>
                      {f === 'unpaid' ? 'Outstanding' : f === 'paid' ? 'Payments' : 'All'}
                    </button>
                  ))}
                </div>
                <button onClick={handlePrintStatement}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 transition-colors">
                  <Download className="w-3.5 h-3.5" /> Statement
                </button>
                {(selectedPartyBalance || 0) > 0 && (
                  <button onClick={() => { setSettleAmount(String(selectedPartyBalance)); setShowSettleModal(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors">
                    <CreditCard className="w-3.5 h-3.5" /> Settle Payment
                  </button>
                )}
              </>
            )}
            <div className="flex bg-neutral-100 rounded-lg p-0.5">
              <button onClick={() => handleModeSwitch('customer')}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${mode === 'customer' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}>
                Customer Ledger
              </button>
              <button onClick={() => handleModeSwitch('supplier')}
                className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${mode === 'supplier' ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}>
                Supplier Ledger
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 grid grid-cols-3 gap-5">
        {mode === 'customer' ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
              <input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="Search customers..." className="input pl-8 text-xs" />
            </div>
            <div className="space-y-1.5">
              {filteredCustomers.map(c => (
                <button key={c.id} onClick={() => handleSelectCustomer(c.id)}
                  className={`w-full text-left p-3 rounded-xl transition-all border ${selectedCustomer === c.id ? 'bg-primary-50 border-primary-200' : 'bg-white border-neutral-100 hover:border-neutral-200'}`}>
                  <div className="flex items-center justify-between">
                    <p className={`text-sm font-semibold ${selectedCustomer === c.id ? 'text-primary-700' : 'text-neutral-900'}`}>{c.name}</p>
                    <p className={`text-xs font-bold ${c.balance > 0 ? 'text-error-600' : 'text-success-600'}`}>
                      {formatCurrency(Math.abs(c.balance))}
                    </p>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-xs text-neutral-400">{c.invoice_count} invoices</p>
                    <p className={`text-[10px] ${c.balance > 0 ? 'text-error-500' : 'text-success-500'}`}>
                      {c.balance > 0 ? 'Receivable' : c.balance < 0 ? 'Credit' : 'Settled'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
              <input value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)} placeholder="Search suppliers..." className="input pl-8 text-xs" />
            </div>
            <div className="space-y-1.5">
              {filteredSuppliers.map(s => (
                <button key={s.id} onClick={() => handleSelectSupplier(s.id)}
                  className={`w-full text-left p-3 rounded-xl transition-all border ${selectedSupplier === s.id ? 'bg-primary-50 border-primary-200' : 'bg-white border-neutral-100 hover:border-neutral-200'}`}>
                  <div className="flex items-center justify-between">
                    <p className={`text-sm font-semibold ${selectedSupplier === s.id ? 'text-primary-700' : 'text-neutral-900'}`}>{s.name}</p>
                    <p className={`text-xs font-bold ${s.balance > 0 ? 'text-error-600' : 'text-success-600'}`}>
                      {formatCurrency(Math.abs(s.balance))}
                    </p>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-xs text-neutral-400">{s.entry_count} purchases</p>
                    <p className={`text-[10px] ${s.balance > 0 ? 'text-error-500' : 'text-success-500'}`}>
                      {s.balance > 0 ? 'Payable' : s.balance < 0 ? 'Advance' : 'Settled'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="col-span-2">
          {!hasSelection && (
            <div className="card flex flex-col items-center justify-center py-16">
              <BookOpen className="w-10 h-10 text-neutral-300 mb-3" />
              <p className="text-sm text-neutral-500">Select a {mode} to view their ledger</p>
            </div>
          )}

          {hasSelection && (
            <div className="space-y-3">
              <div className="card">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-base font-bold text-neutral-900">{selectedPartyName}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {mode === 'customer' ? selectedCustomerData?.phone : selectedSupplierData?.phone}
                    </p>
                  </div>
                  <div className="flex items-center gap-6">
                    {mode === 'customer' && (
                      <div className="text-right">
                        <p className="text-[10px] text-neutral-400 uppercase tracking-wider">Total Revenue</p>
                        <p className="text-base font-bold text-neutral-800">{formatCurrency(selectedCustomerData?.total_revenue || 0)}</p>
                      </div>
                    )}
                    <div className="text-right">
                      <p className="text-[10px] text-neutral-400 uppercase tracking-wider">{mode === 'customer' ? 'Balance Due' : 'Amount Payable'}</p>
                      <p className={`text-xl font-bold ${(selectedPartyBalance || 0) > 0 ? 'text-error-600' : 'text-success-600'}`}>
                        {formatCurrency(Math.abs(selectedPartyBalance || 0))}
                      </p>
                      <p className={`text-xs ${(selectedPartyBalance || 0) > 0 ? 'text-error-500' : 'text-success-500'}`}>
                        {(selectedPartyBalance || 0) > 0
                          ? (mode === 'customer' ? 'Receivable' : 'Payable')
                          : (selectedPartyBalance || 0) < 0
                          ? (mode === 'customer' ? 'Credit Balance' : 'Advance Paid')
                          : 'Settled'}
                      </p>
                    </div>
                    {(selectedPartyBalance || 0) === 0 && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-success-50 rounded-lg">
                        <CheckCircle className="w-4 h-4 text-success-600" />
                        <span className="text-xs font-semibold text-success-700">Cleared</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="card p-0 overflow-hidden">
                {filterMode !== 'all' && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-neutral-50 border-b border-neutral-100">
                    <Filter className="w-3.5 h-3.5 text-neutral-400" />
                    <span className="text-xs text-neutral-500">
                      Showing {filterMode === 'unpaid' ? 'outstanding invoices only' : 'payment entries only'}
                    </span>
                    <button onClick={() => setFilterMode('all')} className="ml-auto text-xs text-primary-600 hover:underline">Clear filter</button>
                  </div>
                )}
                <table className="w-full">
                  <thead className="bg-neutral-50 border-b border-neutral-100">
                    <tr>
                      <th className="table-header text-left">Date</th>
                      <th className="table-header text-left">Type</th>
                      <th className="table-header text-left">Reference</th>
                      <th className="table-header text-right">Dr</th>
                      <th className="table-header text-right">Cr</th>
                      <th className="table-header text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLines.map((line, i) => (
                      <tr key={i} className={`border-b border-neutral-50 hover:bg-neutral-50 ${line.type === 'Payment' ? 'bg-success-50/30' : ''}`}>
                        <td className="table-cell text-neutral-500">{formatDate(line.date)}</td>
                        <td className="table-cell">
                          <span className={`badge text-[10px] ${getTypeBadgeClass(line.type)}`}>{line.type}</span>
                          {line.mode && <span className="ml-1 text-[9px] text-neutral-400">{line.mode}</span>}
                        </td>
                        <td className="table-cell font-medium text-neutral-700">{line.ref}</td>
                        <td className="table-cell text-right">
                          {line.debit > 0 ? (
                            <span className="flex items-center justify-end gap-1 text-error-600 font-medium">
                              <TrendingUp className="w-3 h-3" />{formatCurrency(line.debit)}
                            </span>
                          ) : <span className="text-neutral-300">—</span>}
                        </td>
                        <td className="table-cell text-right">
                          {line.credit > 0 ? (
                            <span className="flex items-center justify-end gap-1 text-success-600 font-medium">
                              <TrendingDown className="w-3 h-3" />{formatCurrency(line.credit)}
                            </span>
                          ) : <span className="text-neutral-300">—</span>}
                        </td>
                        <td className="table-cell text-right font-semibold">
                          <span className={line.balance > 0 ? 'text-error-600' : 'text-success-600'}>
                            {formatCurrency(Math.abs(line.balance))}
                          </span>
                          <span className="text-[9px] ml-1 text-neutral-400">{line.balance > 0 ? 'Dr' : 'Cr'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredLines.length === 0 && (
                  <div className="text-center py-8 text-xs text-neutral-400">No transactions found for selected period</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={showSettleModal} onClose={() => setShowSettleModal(false)} title="Settle Payment" size="sm"
        footer={
          <>
            <button onClick={() => setShowSettleModal(false)} className="btn-secondary">Cancel</button>
            <button onClick={handleSettle} className="btn-primary">Record Payment</button>
          </>
        }>
        <div className="space-y-3">
          <div>
            <label className="label">Amount</label>
            <input type="number" value={settleAmount} onChange={e => setSettleAmount(e.target.value)} className="input" placeholder="0.00" />
          </div>
          <div>
            <label className="label">Payment Mode</label>
            <select value={settleMode} onChange={e => setSettleMode(e.target.value as typeof settleMode)} className="input">
              {['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card'].map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Reference / UTR (optional)</label>
            <input value={settleRef} onChange={e => setSettleRef(e.target.value)} className="input" placeholder="Transaction reference" />
          </div>
          <div className="p-3 bg-warning-50 rounded-lg border border-warning-100">
            <p className="text-xs text-warning-700">
              Settling <span className="font-bold">{selectedPartyName}</span> — Balance: <span className="font-bold">{formatCurrency(Math.abs(selectedPartyBalance || 0))}</span>
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
