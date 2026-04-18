import { formatCurrency, formatDate, numberToWords } from '../../lib/utils';
import { useCompanySettings } from '../../lib/useCompanySettings';
import type { Invoice, Customer } from '../../types';
import type { Company } from '../../lib/companiesService';

function joinAddress(parts: (string | undefined | null)[]) {
  return parts.filter(Boolean).join(', ');
}

interface InvoicePrintProps {
  invoice: Invoice;
  companyOverride?: Company;
  printMode?: 'normal' | 'b2b';
  shipToCustomer?: Customer;
}

export default function InvoicePrint({ invoice, companyOverride, printMode = 'normal', shipToCustomer }: InvoicePrintProps) {
  const { company: defaultCompany } = useCompanySettings();
  const isB2B = printMode === 'b2b';

  const co = companyOverride ? {
    name: companyOverride.name,
    tagline: companyOverride.tagline || '',
    address1: companyOverride.address1 || '',
    address2: companyOverride.address2 || '',
    city: companyOverride.city || '',
    state: companyOverride.state || '',
    pincode: companyOverride.pincode || '',
    phone: companyOverride.phone || '',
    email: companyOverride.email || '',
    gstin: companyOverride.gstin || '',
    pan: companyOverride.pan || '',
    bank_name: companyOverride.bank_name || '',
    account_number: companyOverride.account_number || '',
    ifsc_code: companyOverride.ifsc_code || '',
    account_holder: companyOverride.account_holder || '',
    upi_id: companyOverride.upi_id || '',
    footer_note: companyOverride.footer_note || '',
    logo_url: companyOverride.logo_url || '',
  } : defaultCompany;

  const companyAddress = joinAddress([co.address1, co.address2, co.city, co.state, co.pincode]);
  const customerAddress = joinAddress([
    invoice.customer_address, invoice.customer_address2,
    invoice.customer_city, invoice.customer_state, invoice.customer_pincode,
  ]);
  const shipToAddress = shipToCustomer
    ? joinAddress([shipToCustomer.address, (shipToCustomer as Customer & { address2?: string }).address2, shipToCustomer.city, shipToCustomer.state, shipToCustomer.pincode])
    : '';

  // In B2B mode: seller = invoice customer (Bill To), buyer = ship_to_customer (Ship To)
  const sellerName = isB2B ? invoice.customer_name : co.name;
  const sellerAddress = isB2B ? customerAddress : companyAddress;
  const sellerPhone = isB2B ? invoice.customer_phone : co.phone;

  return (
    <div id="invoice-print" className="bg-white p-8 max-w-[800px] mx-auto text-neutral-900 font-sans">
      <div className="border-b-2 border-primary-600 pb-5 mb-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            {!isB2B && co.logo_url && (
              <img src={co.logo_url} alt={co.name} className="h-14 w-auto object-contain" />
            )}
            <div>
              <h1 className="text-2xl font-bold text-primary-700 tracking-wide">{sellerName.toUpperCase()}</h1>
              {!isB2B && co.tagline && <p className="text-sm text-neutral-600 mt-0.5 font-medium">{co.tagline}</p>}
              {sellerAddress && <p className="text-xs text-neutral-500 mt-1">{sellerAddress}</p>}
              <div className="flex flex-wrap gap-3 mt-1">
                {sellerPhone && <p className="text-xs text-neutral-500">{sellerPhone}</p>}
                {!isB2B && co.email && <p className="text-xs text-neutral-500">{co.email}</p>}
                {!isB2B && co.gstin && <p className="text-xs text-neutral-500">GSTIN: {co.gstin}</p>}
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-neutral-700 uppercase tracking-widest">
              {isB2B ? 'B2B INVOICE' : 'INVOICE'}
            </p>
            <p className="text-sm font-semibold text-primary-600 mt-1">#{invoice.invoice_number}</p>
            <p className="text-xs text-neutral-500 mt-0.5">Date: {formatDate(invoice.invoice_date)}</p>
            {invoice.due_date && <p className="text-xs text-neutral-500">Due: {formatDate(invoice.due_date)}</p>}
          </div>
        </div>
      </div>

      <div className={`grid gap-6 mb-6 ${isB2B && shipToCustomer ? 'grid-cols-3' : 'grid-cols-2'}`}>
        <div>
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2">
            {isB2B ? 'Seller (Bill To)' : 'Bill From'}
          </p>
          <div className="bg-neutral-50 rounded-lg p-3">
            <p className="font-semibold text-neutral-900">{sellerName}</p>
            {!isB2B && co.tagline && <p className="text-xs text-neutral-600 mt-1">{co.tagline}</p>}
            {sellerAddress && <p className="text-xs text-neutral-500 mt-0.5">{sellerAddress}</p>}
            {sellerPhone && <p className="text-xs text-neutral-500">{sellerPhone}</p>}
            {!isB2B && co.email && <p className="text-xs text-neutral-500">{co.email}</p>}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2">
            {isB2B ? 'Buyer (Ship To)' : 'Bill To'}
          </p>
          {isB2B ? (
            <div className="bg-blue-50 rounded-lg p-3">
              {shipToCustomer ? (
                <>
                  <p className="font-semibold text-neutral-900">{shipToCustomer.name}</p>
                  {shipToCustomer.phone && <p className="text-xs text-neutral-600 mt-1">{shipToCustomer.phone}</p>}
                  {shipToAddress && <p className="text-xs text-neutral-500 mt-0.5">{shipToAddress}</p>}
                </>
              ) : (
                <p className="text-xs text-neutral-400 italic">Ship To not specified</p>
              )}
            </div>
          ) : (
            <div className="bg-primary-50 rounded-lg p-3">
              <p className="font-semibold text-neutral-900">{invoice.customer_name}</p>
              {invoice.customer_phone && <p className="text-xs text-neutral-600 mt-1">{invoice.customer_phone}</p>}
              {customerAddress && <p className="text-xs text-neutral-500 mt-0.5">{customerAddress}</p>}
            </div>
          )}
        </div>
        {isB2B && shipToCustomer && (
          <div>
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Invoiced To</p>
            <div className="bg-primary-50 rounded-lg p-3">
              <p className="font-semibold text-neutral-900">{invoice.customer_name}</p>
              {invoice.customer_phone && <p className="text-xs text-neutral-600 mt-1">{invoice.customer_phone}</p>}
              {customerAddress && <p className="text-xs text-neutral-500 mt-0.5">{customerAddress}</p>}
            </div>
          </div>
        )}
      </div>

      <div className="mb-5">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-neutral-800 text-white">
              <th className="px-3 py-2 text-left text-xs font-semibold w-8">#</th>
              <th className="px-3 py-2 text-left text-xs font-semibold">Item Description</th>
              <th className="px-3 py-2 text-center text-xs font-semibold w-16">Unit</th>
              <th className="px-3 py-2 text-right text-xs font-semibold w-16">Qty</th>
              <th className="px-3 py-2 text-right text-xs font-semibold w-24">Rate</th>
              {invoice.items?.some(i => i.discount_pct > 0) && (
                <th className="px-3 py-2 text-right text-xs font-semibold w-16">Disc%</th>
              )}
              <th className="px-3 py-2 text-right text-xs font-semibold w-24">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.items || []).map((item, idx) => (
              <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}>
                <td className="px-3 py-2.5 text-xs text-neutral-500 border-b border-neutral-100">{idx + 1}</td>
                <td className="px-3 py-2.5 border-b border-neutral-100">
                  <p className="text-sm font-medium text-neutral-900">{item.product_name}</p>
                  {item.description && <p className="text-xs text-neutral-500">{item.description}</p>}
                </td>
                <td className="px-3 py-2.5 text-xs text-center text-neutral-600 border-b border-neutral-100">{item.unit}</td>
                <td className="px-3 py-2.5 text-xs text-right text-neutral-700 border-b border-neutral-100">{item.quantity}</td>
                <td className="px-3 py-2.5 text-xs text-right text-neutral-700 border-b border-neutral-100">{formatCurrency(item.unit_price)}</td>
                {invoice.items?.some(i => i.discount_pct > 0) && (
                  <td className="px-3 py-2.5 text-xs text-right text-neutral-500 border-b border-neutral-100">{item.discount_pct > 0 ? `${item.discount_pct}%` : '-'}</td>
                )}
                <td className="px-3 py-2.5 text-sm text-right font-medium text-neutral-900 border-b border-neutral-100">{formatCurrency(item.total_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end mb-5">
        <div className="w-64 space-y-1">
          <div className="flex justify-between text-sm text-neutral-600"><span>Subtotal</span><span>{formatCurrency(invoice.subtotal)}</span></div>
          {invoice.discount_amount > 0 && <div className="flex justify-between text-sm text-success-600"><span>Discount</span><span>-{formatCurrency(invoice.discount_amount)}</span></div>}
          {invoice.tax_amount > 0 && <div className="flex justify-between text-sm text-neutral-600"><span>Tax</span><span>{formatCurrency(invoice.tax_amount)}</span></div>}
          {invoice.courier_charges > 0 && <div className="flex justify-between text-sm text-neutral-600"><span>Courier</span><span>{formatCurrency(invoice.courier_charges)}</span></div>}
          <div className="flex justify-between text-base font-bold bg-primary-600 text-white px-3 py-2 rounded-lg mt-1"><span>Total Amount</span><span>{formatCurrency(invoice.total_amount)}</span></div>
          {invoice.paid_amount > 0 && <div className="flex justify-between text-sm text-success-600"><span>Paid</span><span>-{formatCurrency(invoice.paid_amount)}</span></div>}
          {invoice.outstanding_amount > 0 && <div className="flex justify-between text-sm font-semibold text-error-600 border-t border-neutral-200 pt-1"><span>Balance Due</span><span>{formatCurrency(invoice.outstanding_amount)}</span></div>}
        </div>
      </div>

      <div className="bg-accent-50 border border-accent-200 rounded-lg px-4 py-2 mb-5">
        <p className="text-xs text-accent-700 font-medium">
          <span className="font-bold">Amount in Words: </span>{numberToWords(invoice.total_amount)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="border border-neutral-200 rounded-lg p-3">
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Bank Details</p>
          <div className="space-y-1">
            <div className="flex justify-between text-xs"><span className="text-neutral-500">Bank</span><span className="font-medium">{invoice.bank_name || co.bank_name}</span></div>
            {(invoice.account_number || co.account_number) && <div className="flex justify-between text-xs"><span className="text-neutral-500">Account No.</span><span className="font-medium">{invoice.account_number || co.account_number}</span></div>}
            {(invoice.ifsc_code || co.ifsc_code) && <div className="flex justify-between text-xs"><span className="text-neutral-500">IFSC Code</span><span className="font-medium">{invoice.ifsc_code || co.ifsc_code}</span></div>}
            {co.upi_id && <div className="flex justify-between text-xs"><span className="text-neutral-500">UPI</span><span className="font-medium">{co.upi_id}</span></div>}
            <div className="flex justify-between text-xs"><span className="text-neutral-500">Payment Terms</span><span className="font-medium">{invoice.payment_terms || 'Due on receipt'}</span></div>
          </div>
        </div>
        <div className="border border-neutral-200 rounded-lg p-3 flex flex-col justify-between">
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Authorized Signature</p>
          <div className="mt-6 pt-3 border-t border-neutral-300">
            <p className="text-xs font-semibold text-neutral-700">{co.name}</p>
            {co.tagline && <p className="text-[10px] text-neutral-400">{co.tagline}</p>}
          </div>
        </div>
      </div>

      {invoice.notes && <div className="mt-4 text-xs text-neutral-500 border-t border-neutral-100 pt-3"><span className="font-medium text-neutral-700">Notes: </span>{invoice.notes}</div>}
      <div className="mt-4 text-center text-[10px] text-neutral-400 border-t border-neutral-100 pt-3">{co.footer_note}</div>
    </div>
  );
}
