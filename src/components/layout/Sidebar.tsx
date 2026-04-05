import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Package, ShoppingCart, FileText, BarChart2,
  Truck, BookOpen, Receipt, Zap, LogOut, Moon, RotateCcw,
  CalendarDays, CircleUser as UserCircle2, Settings,
  CreditCard, PackageCheck
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type { ActivePage } from '../../types';

interface SidebarProps {
  activePage: ActivePage;
  onNavigate: (page: ActivePage) => void;
}

export default function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const { profile, isAdmin, canAccessFinance, canAccessSales, canAccessInventory, signOut } = useAuth();
  const [unpaidInvoices, setUnpaidInvoices] = useState(0);

  useEffect(() => {
    const loadBadges = async () => {
      const { count } = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .in('status', ['sent', 'partial', 'overdue']);
      setUnpaidInvoices(count || 0);
    };
    loadBadges();
  }, []);

  const roleLabel = () => {
    const r = profile?.role;
    if (r === 'admin') return 'Administrator';
    if (r === 'accountant') return 'Accountant';
    if (r === 'staff') return 'Staff';
    return 'User';
  };

  const NavItem = ({
    id, label, icon: Icon, badge,
  }: {
    id: ActivePage; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number;
  }) => {
    const isActive = activePage === id;
    return (
      <button
        onClick={() => onNavigate(id)}
        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 text-left group ${isActive ? 'bg-primary-600 text-white' : 'text-neutral-500 hover:bg-orange-50 hover:text-primary-700'}`}
      >
        <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-neutral-400 group-hover:text-primary-600'}`} />
        <span className="truncate leading-none flex-1">{label}</span>
        {badge != null && badge > 0 && (
          <span className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold leading-none ${isActive ? 'bg-white/30 text-white' : 'bg-error-600 text-white'}`}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>
    );
  };

  const SectionLabel = ({ label }: { label: string }) => (
    <p className="px-2.5 pt-2 pb-0.5 text-[9px] font-bold text-neutral-400 uppercase tracking-widest">{label}</p>
  );

  return (
    <aside className="w-48 bg-white border-r border-neutral-200 flex flex-col h-screen sticky top-0 shrink-0">
      <div className="px-3 py-3 border-b border-neutral-100">
        <div className="flex items-center gap-2.5">
          <img src="/pflogo.png" alt="Prachi Fulfagar" className="h-9 w-9 object-contain shrink-0" />
          <div>
            <p className="text-xs font-bold text-neutral-800 leading-tight">Prachi Fulfagar</p>
            <div className="flex items-center gap-1 mt-0.5">
              <Moon className="w-2.5 h-2.5 text-primary-500 shrink-0" />
              <p className="text-[9px] text-neutral-400 font-medium tracking-wide">Vastu · Palmist · Astrologer</p>
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-2 py-1.5 overflow-y-auto space-y-0">
        <div className="space-y-0.5">
          <NavItem id="dashboard" label="Dashboard" icon={LayoutDashboard} />
        </div>

        <SectionLabel label="CRM" />
        <div className="space-y-0.5">
          <NavItem id="crm" label="Clients" icon={UserCircle2} />
          <NavItem id="calendar" label="Schedule" icon={CalendarDays} />
        </div>

        {canAccessSales && (
          <>
            <SectionLabel label="Sales" />
            <div className="space-y-0.5">
              <NavItem id="sales-orders" label="Sales Orders" icon={FileText} />
              <NavItem id="challans" label="Delivery Challans" icon={Truck} />
              <NavItem id="invoices" label="Invoices" icon={Receipt} badge={unpaidInvoices} />
              <NavItem id="sales-returns" label="Returns" icon={RotateCcw} />
              <NavItem id="courier" label="Shipments" icon={PackageCheck} />
            </div>
          </>
        )}

        {canAccessInventory && (
          <>
            <SectionLabel label="Inventory" />
            <div className="space-y-0.5">
              {isAdmin && <NavItem id="purchase" label="Purchases" icon={ShoppingCart} />}
              <NavItem id="inventory" label="Products" icon={Package} />
              <NavItem id="godown-stock" label="Stock" icon={BarChart2} />
            </div>
          </>
        )}

        {canAccessFinance && (
          <>
            <SectionLabel label="Finance" />
            <div className="space-y-0.5">
              <NavItem id="ledger" label="Ledger" icon={BookOpen} />
              <NavItem id="expenses" label="Expenses" icon={CreditCard} />
              <NavItem id="journal" label="Journal" icon={FileText} />
            </div>
          </>
        )}

        <SectionLabel label="Analytics" />
        <div className="space-y-0.5">
          <NavItem id="reports" label="Reports" icon={BarChart2} />
          {isAdmin && <NavItem id="automation" label="Automation" icon={Zap} />}
        </div>

        {isAdmin && (
          <>
            <SectionLabel label="Admin" />
            <div className="space-y-0.5">
              <NavItem id="settings" label="Settings" icon={Settings} />
            </div>
          </>
        )}
      </nav>

      <div className="p-2 border-t border-neutral-100">
        <div className="flex items-center gap-2 mb-1 px-1">
          <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-primary-700">
              {(profile?.display_name || profile?.email || 'U')[0].toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-neutral-800 truncate leading-tight">{profile?.display_name || profile?.email || 'User'}</p>
            <p className={`text-[9px] leading-tight ${isAdmin ? 'text-primary-600' : 'text-neutral-400'}`}>
              {roleLabel()}
            </p>
          </div>
        </div>
        <button onClick={signOut}
          className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] text-neutral-500 hover:bg-red-50 hover:text-red-600 transition-colors">
          <LogOut className="w-3 h-3" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
