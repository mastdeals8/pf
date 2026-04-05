import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { DateRangeProvider } from './contexts/DateRangeContext';
import DateRangeBar from './components/layout/DateRangeBar';
import Sidebar from './components/layout/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import GodownStock from './pages/inventory/GodownStock';
import Purchase from './pages/Purchase';
import SalesOrders from './pages/sales/SalesOrders';
import Invoices from './pages/sales/Invoices';
import DeliveryChallan from './pages/sales/DeliveryChallan';
import CRM from './pages/CRM';
import CalendarPage from './pages/Calendar';
import SalesReturns from './pages/sales/SalesReturns';
import Ledger from './pages/finance/Ledger';
import Expenses from './pages/finance/Expenses';
import Journal from './pages/finance/Journal';
import Courier from './pages/Courier';
import Reports from './pages/Reports';
import Automation from './pages/Automation';
import Settings from './pages/Settings';
import type { ActivePage, DeliveryChallan as DCType } from './types';

export interface PageState {
  prefillDCForShipment?: DCType;
  prefillDCForInvoice?: DCType;
}

const PAGE_TITLES: Partial<Record<ActivePage, string>> = {
  dashboard: 'Dashboard',
  crm: 'Clients',
  calendar: 'Schedule',
  'sales-orders': 'Sales Orders',
  invoices: 'Invoices',
  challans: 'Delivery Challans',
  'sales-returns': 'Returns',
  courier: 'Shipments',
  inventory: 'Products',
  'godown-stock': 'Godown Stock',
  purchase: 'Purchases',
  finance: 'Finance',
  ledger: 'Ledger',
  expenses: 'Expenses',
  journal: 'Journal',
  reports: 'Reports',
  automation: 'Automation',
  settings: 'Settings',
};

function AppShell() {
  const { user, loading, isAdmin, canAccessFinance, canAccessSales, canAccessInventory } = useAuth();
  const [activePage, setActivePage] = useState<ActivePage>('dashboard');
  const [pageState, setPageState] = useState<PageState>({});

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary-600 border-t-transparent animate-spin" />
          <p className="text-xs text-neutral-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Login />;

  const navigate = (page: ActivePage, state?: PageState) => {
    setPageState(state || {});
    setActivePage(page);
  };

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard': return <Dashboard onNavigate={navigate} />;
      case 'crm': return <CRM />;
      case 'calendar': return <CalendarPage />;
      case 'sales-orders': return canAccessSales ? <SalesOrders onNavigate={navigate} /> : <Dashboard onNavigate={navigate} />;
      case 'invoices': return canAccessSales ? <Invoices onNavigate={navigate} prefillFromDC={pageState.prefillDCForInvoice} /> : <Dashboard onNavigate={navigate} />;
      case 'challans': return canAccessSales ? <DeliveryChallan onNavigate={navigate} /> : <Dashboard onNavigate={navigate} />;
      case 'sales-returns': return canAccessSales ? <SalesReturns /> : <Dashboard onNavigate={navigate} />;
      case 'inventory': return canAccessInventory ? <Inventory /> : <Dashboard onNavigate={navigate} />;
      case 'godown-stock': return canAccessInventory ? <GodownStock /> : <Dashboard onNavigate={navigate} />;
      case 'purchase': return isAdmin ? <Purchase /> : <Dashboard onNavigate={navigate} />;
      case 'finance':
      case 'ledger': return canAccessFinance ? <Ledger /> : <Dashboard onNavigate={navigate} />;
      case 'expenses': return canAccessFinance ? <Expenses /> : <Dashboard onNavigate={navigate} />;
      case 'journal': return canAccessFinance ? <Journal /> : <Dashboard onNavigate={navigate} />;
      case 'courier': return <Courier prefillFromDC={pageState.prefillDCForShipment} />;
      case 'reports': return <Reports />;
      case 'automation': return isAdmin ? <Automation /> : <Dashboard onNavigate={navigate} />;
      case 'settings': return isAdmin ? <Settings /> : <Dashboard onNavigate={navigate} />;
      default: return <Dashboard onNavigate={navigate} />;
    }
  };

  return (
    <div className="flex h-screen bg-neutral-50 overflow-hidden">
      <div className="no-print">
        <Sidebar activePage={activePage} onNavigate={navigate} />
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-white border-b border-neutral-100 px-4 py-2 flex items-center justify-between no-print">
          <p className="text-xs font-semibold text-neutral-400 tracking-wide">
            {PAGE_TITLES[activePage] || ''}
          </p>
          <DateRangeBar />
        </div>
        <main className="flex-1 flex flex-col overflow-hidden">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <DateRangeProvider>
        <AppShell />
      </DateRangeProvider>
    </AuthProvider>
  );
}
