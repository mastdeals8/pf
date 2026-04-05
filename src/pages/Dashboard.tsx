import { useState, useEffect } from 'react';
import {
  Bell, Package, AlertTriangle, ArrowRight, Clock, TrendingUp, Truck, FileText,
  CheckCircle, Users, Send, Receipt, BarChart2, CalendarDays, ShoppingCart, Zap,
  IndianRupee, AlertCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatCurrency, formatDate } from '../lib/utils';
import { useDateRange } from '../contexts/DateRangeContext';
import { useAuth } from '../contexts/AuthContext';
import type { ActivePage, Customer, Appointment } from '../types';
import type { PageState } from '../App';

interface DashboardProps {
  onNavigate: (page: ActivePage, state?: PageState) => void;
}

interface PendingAction {
  type: 'followup' | 'dispatch' | 'payment' | 'stock';
  priority: 'high' | 'medium' | 'low';
  label: string;
  detail: string;
  action: () => void;
}

const APPT_COLORS: Record<string, string> = {
  'Astro Reading': 'bg-primary-100 text-primary-700 border-primary-200',
  'Vastu Audit': 'bg-accent-100 text-accent-700 border-accent-200',
  'Consultation': 'bg-blue-100 text-blue-700 border-blue-200',
  'Follow Up': 'bg-green-100 text-green-700 border-green-200',
  'Site Visit': 'bg-orange-100 text-orange-700 border-orange-200',
  'Video Call': 'bg-teal-100 text-teal-700 border-teal-200',
  'Phone Call': 'bg-neutral-100 text-neutral-600 border-neutral-200',
};

export default function Dashboard({ onNavigate }: DashboardProps) {
  const { dateRange } = useDateRange();
  const { isAdmin, canAccessFinance, canAccessSales, canAccessInventory } = useAuth();

  const [followupsToday, setFollowupsToday] = useState<Customer[]>([]);
  const [todayAppts, setTodayAppts] = useState<Appointment[]>([]);
  const [pendingDispatches, setPendingDispatches] = useState(0);
  const [pendingPayments, setPendingPayments] = useState(0);
  const [totalReceivable, setTotalReceivable] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [lowStockItems, setLowStockItems] = useState<{ name: string; stock_quantity: number; low_stock_alert: number }[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<{ id: string; invoice_number: string; customer_name: string; total_amount: number; status: string; invoice_date: string }[]>([]);
  const [pendingOrders, setPendingOrders] = useState(0);
  const [monthRevenue, setMonthRevenue] = useState(0);
  const [monthCollected, setMonthCollected] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadDashboardData(); }, [dateRange]);

  const toLocalDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  const loadDashboardData = async () => {
    setLoading(true);
    const today = toLocalDateStr(new Date());
    const { from: fromDate, to: toDate } = dateRange;

    const [
      followupRes, todayApptRes, dispatchRes, invoicesRes, recentRes,
      lowStockRes, ordersRes, paymentsRes,
    ] = await Promise.all([
      supabase.from('customers').select('id, name, phone, next_followup_date, city').eq('next_followup_date', today).eq('is_active', true),
      supabase.from('appointments').select('*').gte('start_time', today).lte('start_time', today + 'T23:59:59').order('start_time'),
      supabase.from('courier_entries').select('id', { count: 'exact', head: true }).in('status', ['booked', 'in_transit']),
      supabase.from('invoices').select('id, total_amount, outstanding_amount, status, invoice_number, customer_name, invoice_date').gte('invoice_date', fromDate).lte('invoice_date', toDate).neq('status', 'cancelled'),
      supabase.from('invoices').select('id, invoice_number, customer_name, total_amount, status, invoice_date').order('created_at', { ascending: false }).limit(5),
      supabase.from('products').select('name, stock_quantity, low_stock_alert').eq('is_active', true),
      supabase.from('sales_orders').select('id', { count: 'exact', head: true }).in('status', ['confirmed', 'draft']),
      supabase.from('payments').select('amount').gte('payment_date', fromDate).lte('payment_date', toDate).eq('payment_type', 'receipt'),
    ]);

    setFollowupsToday((followupRes.data || []) as Customer[]);
    setTodayAppts((todayApptRes.data || []) as Appointment[]);
    setPendingDispatches(dispatchRes.count || 0);

    const allInvoices = invoicesRes.data || [];
    const receivable = allInvoices.reduce((s, i) => s + (i.outstanding_amount || 0), 0);
    setTotalReceivable(receivable);
    setMonthRevenue(allInvoices.reduce((s, i) => s + i.total_amount, 0));
    setPendingPayments(allInvoices.filter(i => !['paid', 'cancelled'].includes(i.status)).length);
    setOverdueCount(allInvoices.filter(i => i.status === 'overdue').length);

    setRecentInvoices(recentRes.data || []);

    const lowStock = (lowStockRes.data || []).filter((p: { stock_quantity: number; low_stock_alert: number }) => p.stock_quantity <= p.low_stock_alert);
    setLowStockItems(lowStock.slice(0, 5));

    setPendingOrders(ordersRes.count || 0);
    const collected = (paymentsRes.data || []).reduce((s: number, p: { amount: number }) => s + p.amount, 0);
    setMonthCollected(collected);

    setLoading(false);
  };

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      paid: 'text-success-600 bg-success-50',
      partial: 'text-warning-600 bg-warning-50',
      overdue: 'text-error-600 bg-error-50',
      sent: 'text-blue-700 bg-blue-50',
      draft: 'text-neutral-600 bg-neutral-100',
    };
    return map[status] || 'text-neutral-600 bg-neutral-100';
  };

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  const pendingActions: PendingAction[] = [
    ...followupsToday.map(c => ({
      type: 'followup' as const,
      priority: 'high' as const,
      label: `Follow up: ${c.name}`,
      detail: c.city ? `Call or message — ${c.city}` : 'Follow-up due today',
      action: () => onNavigate('crm'),
    })),
    ...(overdueCount > 0 ? [{
      type: 'payment' as const,
      priority: 'high' as const,
      label: `${overdueCount} overdue invoice${overdueCount > 1 ? 's' : ''}`,
      detail: `${formatCurrency(totalReceivable)} total outstanding`,
      action: () => onNavigate('invoices'),
    }] : []),
    ...(pendingDispatches > 0 ? [{
      type: 'dispatch' as const,
      priority: 'medium' as const,
      label: `${pendingDispatches} pending dispatch${pendingDispatches > 1 ? 'es' : ''}`,
      detail: 'Orders awaiting shipment',
      action: () => onNavigate('courier'),
    }] : []),
    ...(pendingOrders > 0 ? [{
      type: 'dispatch' as const,
      priority: 'medium' as const,
      label: `${pendingOrders} confirmed order${pendingOrders > 1 ? 's' : ''} to dispatch`,
      detail: 'Sales orders ready for dispatch',
      action: () => onNavigate('sales-orders'),
    }] : []),
  ];

  const actionTypeIcon = (type: string) => {
    if (type === 'followup') return Bell;
    if (type === 'dispatch') return Send;
    if (type === 'payment') return IndianRupee;
    return Package;
  };

  const actionTypeBg = (priority: string) => {
    if (priority === 'high') return 'bg-error-50 border-error-200';
    if (priority === 'medium') return 'bg-warning-50 border-warning-200';
    return 'bg-blue-50 border-blue-200';
  };

  const actionTypeIconColor = (priority: string) => {
    if (priority === 'high') return 'text-error-600 bg-error-100';
    if (priority === 'medium') return 'text-warning-600 bg-warning-100';
    return 'text-blue-600 bg-blue-100';
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-neutral-50">
        <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50">
      <div className="p-5 space-y-5">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-neutral-900">Operations Dashboard</h1>
            <p className="text-xs text-neutral-400 mt-0.5">{new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
          <div className="flex items-center gap-2">
            {canAccessSales && (
              <button onClick={() => onNavigate('sales-orders')} className="btn-primary text-xs flex items-center gap-1.5">
                <ShoppingCart className="w-3.5 h-3.5" /> New Order
              </button>
            )}
            {canAccessSales && (
              <button onClick={() => onNavigate('invoices')} className="btn-secondary text-xs flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5" /> New Invoice
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <button onClick={() => onNavigate('sales-orders')} className="card text-left hover:shadow-md transition-all group">
            <div className="flex items-start justify-between mb-3">
              <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Pending Orders</p>
              <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                <FileText className="w-3.5 h-3.5 text-blue-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-neutral-900">{pendingOrders}</p>
            <p className="text-xs mt-1 text-neutral-400">Confirmed, needs dispatch</p>
          </button>

          <button onClick={() => onNavigate('courier')} className="card text-left hover:shadow-md transition-all group">
            <div className="flex items-start justify-between mb-3">
              <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Pending Dispatches</p>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${pendingDispatches > 0 ? 'bg-warning-50' : 'bg-success-50'}`}>
                <Send className={`w-3.5 h-3.5 ${pendingDispatches > 0 ? 'text-warning-600' : 'text-success-600'}`} />
              </div>
            </div>
            <p className={`text-2xl font-bold ${pendingDispatches > 0 ? 'text-warning-700' : 'text-success-700'}`}>{pendingDispatches}</p>
            <p className="text-xs mt-1 text-neutral-400">In transit / dispatched</p>
          </button>

          <button onClick={() => onNavigate('invoices')} className="card text-left hover:shadow-md transition-all group">
            <div className="flex items-start justify-between mb-3">
              <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Payment Follow-up</p>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${pendingPayments > 0 ? 'bg-error-50' : 'bg-success-50'}`}>
                <TrendingUp className={`w-3.5 h-3.5 ${pendingPayments > 0 ? 'text-error-600' : 'text-success-600'}`} />
              </div>
            </div>
            <p className={`text-xl font-bold ${pendingPayments > 0 ? 'text-error-700' : 'text-success-700'}`}>{formatCurrency(totalReceivable)}</p>
            <p className="text-xs mt-1 text-neutral-400">{pendingPayments} unpaid invoice{pendingPayments !== 1 ? 's' : ''}</p>
          </button>

          <button onClick={() => onNavigate('inventory')} className="card text-left hover:shadow-md transition-all group">
            <div className="flex items-start justify-between mb-3">
              <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Low Stock Alerts</p>
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${lowStockItems.length > 0 ? 'bg-warning-50' : 'bg-success-50'}`}>
                <Package className={`w-3.5 h-3.5 ${lowStockItems.length > 0 ? 'text-warning-600' : 'text-success-600'}`} />
              </div>
            </div>
            <p className={`text-2xl font-bold ${lowStockItems.length > 0 ? 'text-warning-700' : 'text-success-700'}`}>{lowStockItems.length}</p>
            <p className="text-xs mt-1 text-neutral-400">Products need restocking</p>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-5">
          <div className="col-span-2 space-y-5">
            {pendingActions.length > 0 && (
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-neutral-800 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary-500" /> Pending Actions
                    <span className="text-[10px] bg-error-100 text-error-700 px-1.5 py-0.5 rounded-full font-bold">{pendingActions.length}</span>
                  </p>
                </div>
                <div className="space-y-2">
                  {pendingActions.slice(0, 6).map((action, i) => {
                    const Icon = actionTypeIcon(action.type);
                    return (
                      <button key={i} onClick={action.action}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all hover:opacity-80 text-left ${actionTypeBg(action.priority)}`}>
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${actionTypeIconColor(action.priority)}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-neutral-800 truncate">{action.label}</p>
                          <p className="text-[10px] text-neutral-500">{action.detail}</p>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-semibold text-neutral-800 flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-primary-500" />
                    Today's Schedule
                  </p>
                  <p className="text-[10px] text-neutral-400 mt-0.5">
                    {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                </div>
                <button onClick={() => onNavigate('calendar')} className="text-xs text-primary-600 hover:underline flex items-center gap-1">
                  Full Calendar <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              {todayAppts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-neutral-300">
                  <CalendarDays className="w-10 h-10 mb-2" />
                  <p className="text-xs text-neutral-400">No appointments today</p>
                  <button onClick={() => onNavigate('calendar')} className="mt-2 text-xs text-primary-500 hover:underline">Add to schedule</button>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-[52px] top-0 bottom-0 w-px bg-neutral-100" />
                  <div className="space-y-1">
                    {todayAppts.map((a, idx) => {
                      const startTime = formatTime(a.start_time);
                      const endTime = a.end_time ? formatTime(a.end_time) : null;
                      const colorClass = APPT_COLORS[a.appointment_type] || 'bg-blue-50 text-blue-700 border-blue-200';
                      const dotColors: Record<string, string> = {
                        'Astro Reading': 'bg-primary-500',
                        'Vastu Audit': 'bg-accent-500',
                        'Consultation': 'bg-blue-500',
                        'Follow Up': 'bg-green-500',
                        'Site Visit': 'bg-orange-500',
                        'Video Call': 'bg-teal-500',
                        'Phone Call': 'bg-neutral-400',
                      };
                      const dotColor = dotColors[a.appointment_type] || 'bg-blue-500';
                      return (
                        <div key={a.id} className={`flex items-stretch gap-0 ${idx < todayAppts.length - 1 ? 'pb-1' : ''}`}>
                          <div className="w-[52px] shrink-0 flex flex-col items-end pr-3 pt-2">
                            <span className="text-[10px] font-semibold text-neutral-500 leading-none whitespace-nowrap">{startTime}</span>
                            {endTime && <span className="text-[9px] text-neutral-300 leading-none mt-0.5 whitespace-nowrap">{endTime}</span>}
                          </div>
                          <div className="flex items-start pt-2.5 mr-3 shrink-0 relative z-10">
                            <div className={`w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm ${dotColor}`} />
                          </div>
                          <div className={`flex-1 rounded-xl border px-3 py-2.5 mb-1 ${colorClass}`}>
                            <p className="text-xs font-semibold leading-tight truncate">{a.title}</p>
                            {a.customer_name && (
                              <p className="text-[10px] opacity-75 mt-0.5 truncate">{a.customer_name}</p>
                            )}
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[9px] font-medium opacity-60 uppercase tracking-wide">{a.appointment_type}</span>
                              {a.location && <span className="text-[9px] opacity-50">· {a.location}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-neutral-800">Recent Invoices</p>
                <button onClick={() => onNavigate('invoices')} className="text-xs text-primary-600 hover:underline flex items-center gap-1">
                  View All <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              {recentInvoices.length === 0 ? (
                <p className="text-xs text-neutral-400 text-center py-6">No invoices yet</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-neutral-100">
                      <th className="table-header text-left">Invoice #</th>
                      <th className="table-header text-left">Customer</th>
                      <th className="table-header text-left">Date</th>
                      <th className="table-header text-right">Amount</th>
                      <th className="table-header text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentInvoices.map(inv => (
                      <tr key={inv.id} className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors">
                        <td className="table-cell font-medium text-primary-700">{inv.invoice_number}</td>
                        <td className="table-cell">{inv.customer_name}</td>
                        <td className="table-cell text-neutral-500">{formatDate(inv.invoice_date)}</td>
                        <td className="table-cell text-right font-semibold">{formatCurrency(inv.total_amount)}</td>
                        <td className="table-cell">
                          <span className={`badge capitalize ${getStatusColor(inv.status)}`}>{inv.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {canAccessFinance && (
              <div className="card">
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">Period Summary</p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-600">Revenue</span>
                    <span className="text-sm font-bold text-neutral-900">{formatCurrency(monthRevenue)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-600">Collected</span>
                    <span className="text-sm font-bold text-success-700">{formatCurrency(monthCollected)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-neutral-600">Outstanding</span>
                    <span className={`text-sm font-bold ${totalReceivable > 0 ? 'text-error-700' : 'text-neutral-400'}`}>{formatCurrency(totalReceivable)}</span>
                  </div>
                  {overdueCount > 0 && (
                    <div className="flex items-center gap-2 p-2 bg-error-50 rounded-lg mt-1">
                      <AlertCircle className="w-3.5 h-3.5 text-error-600 shrink-0" />
                      <p className="text-xs text-error-700">{overdueCount} overdue invoice{overdueCount > 1 ? 's' : ''}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {followupsToday.length > 0 && (
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Follow-ups Today</p>
                  <button onClick={() => onNavigate('crm')} className="text-xs text-primary-600 hover:underline">View CRM</button>
                </div>
                <div className="space-y-2">
                  {followupsToday.slice(0, 4).map(c => (
                    <div key={c.id} className="flex items-center gap-2 p-2 bg-warning-50 rounded-lg">
                      <Bell className="w-3.5 h-3.5 text-warning-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-neutral-800 truncate">{c.name}</p>
                        {c.city && <p className="text-[10px] text-neutral-500">{c.city}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {lowStockItems.length > 0 && (
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Low Stock</p>
                  <button onClick={() => onNavigate('inventory')} className="text-xs text-primary-600 hover:underline">Inventory</button>
                </div>
                <div className="space-y-2">
                  {lowStockItems.map((p, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-warning-50 rounded-lg">
                      <div className="flex items-center gap-2 min-w-0">
                        <AlertTriangle className="w-3.5 h-3.5 text-warning-600 shrink-0" />
                        <p className="text-xs text-neutral-700 truncate">{p.name}</p>
                      </div>
                      <span className="text-xs font-bold text-warning-700 shrink-0 ml-2">{p.stock_quantity} left</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="card">
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">Quick Actions</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'New Invoice', page: 'invoices' as ActivePage, icon: Receipt, color: 'text-primary-600 bg-primary-50', show: canAccessSales },
                  { label: 'Sales Order', page: 'sales-orders' as ActivePage, icon: ShoppingCart, color: 'text-blue-600 bg-blue-50', show: canAccessSales },
                  { label: 'Delivery Challan', page: 'challans' as ActivePage, icon: Send, color: 'text-orange-600 bg-orange-50', show: canAccessSales },
                  { label: 'Add Client', page: 'crm' as ActivePage, icon: Users, color: 'text-green-600 bg-green-50', show: true },
                  { label: 'Stock', page: 'godown-stock' as ActivePage, icon: Package, color: 'text-teal-600 bg-teal-50', show: canAccessInventory },
                  { label: 'Reports', page: 'reports' as ActivePage, icon: BarChart2, color: 'text-neutral-600 bg-neutral-100', show: true },
                ].filter(a => a.show).map(action => (
                  <button key={action.label} onClick={() => onNavigate(action.page)}
                    className="flex items-center gap-2 p-2.5 rounded-xl border border-neutral-100 hover:bg-neutral-50 hover:border-neutral-200 transition-all text-left group">
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${action.color}`}>
                      <action.icon className="w-3 h-3" />
                    </div>
                    <span className="text-[11px] font-medium text-neutral-700 group-hover:text-neutral-900 leading-tight">{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
