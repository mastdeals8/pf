import { useState, useEffect } from 'react';
import { Plus, Pencil, CheckCircle, Save, RefreshCw, Shield, User, Users as UsersIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { UserRole } from '../../contexts/AuthContext';

interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  last_sign_in?: string;
}

const ROLES: { value: UserRole; label: string; desc: string; color: string }[] = [
  { value: 'admin',      label: 'Admin',      desc: 'Full access — all settings, purchases, finance', color: 'bg-error-50 text-error-700 border-error-200' },
  { value: 'accountant', label: 'Accountant', desc: 'Finance, ledger, expenses, sales view',           color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'staff',      label: 'Staff',      desc: 'Sales, expenses, inventory — no finance/purchase prices', color: 'bg-green-50 text-green-700 border-green-200' },
];

const ROLE_COLOR: Record<UserRole, string> = {
  admin:      'bg-error-50 text-error-700',
  accountant: 'bg-blue-50 text-blue-700',
  staff:      'bg-green-50 text-green-700',
  user:       'bg-neutral-100 text-neutral-600',
};

export default function UsersTab() {
  const { profile: myProfile, signUp } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('staff');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', email: '', password: '', role: 'staff' as UserRole });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  const [resetEmail, setResetEmail] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [changePwdId, setChangePwdId] = useState<string | null>(null);
  const [newPwd, setNewPwd] = useState('');
  const [changingPwd, setChangingPwd] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdDone, setPwdDone] = useState<string | null>(null);

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    const { data } = await supabase.from('user_profiles').select('*').order('created_at');
    setUsers((data || []) as UserProfile[]);
    setLoading(false);
  };

  const saveRole = async (userId: string) => {
    setSavingId(userId);
    await supabase.from('user_profiles').update({ role: editRole }).eq('id', userId);
    await loadUsers();
    setSavingId(null);
    setSavedId(userId);
    setEditId(null);
    setTimeout(() => setSavedId(s => s === userId ? null : s), 2000);
  };

  const handleAdd = async () => {
    setAddError('');
    if (!addForm.name.trim() || !addForm.email.trim() || addForm.password.length < 6) {
      setAddError('Name, email, and a password (min 6 chars) are required.');
      return;
    }
    setAdding(true);
    const { error } = await signUp(addForm.email.trim(), addForm.password, addForm.name.trim(), addForm.role);
    setAdding(false);
    if (error) { setAddError(error); return; }
    setAddSuccess(`${addForm.name} added successfully!`);
    setAddForm({ name: '', email: '', password: '', role: 'staff' });
    setShowAdd(false);
    await loadUsers();
    setTimeout(() => setAddSuccess(''), 4000);
  };

  const sendReset = async (email: string) => {
    setResetEmail(email);
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password',
    });
    setResetSent(true);
    setTimeout(() => { setResetEmail(null); setResetSent(false); }, 4000);
  };

  const changePassword = async (userId: string) => {
    if (newPwd.length < 6) { setPwdError('Password must be at least 6 characters.'); return; }
    setChangingPwd(true);
    setPwdError('');
    try {
      const isSelf = userId === myProfile?.id;
      if (isSelf) {
        const { error } = await supabase.auth.updateUser({ password: newPwd });
        if (error) { setPwdError(error.message || 'Failed to update password.'); return; }
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) { setPwdError('Not authenticated. Please reload.'); return; }
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-set-password`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ userId, newPassword: newPwd }),
          }
        );
        if (!res.ok) {
          let errMsg = 'Failed to update password.';
          try { const j = await res.json(); errMsg = j.error || errMsg; } catch { /* ignore */ }
          setPwdError(errMsg);
          return;
        }
      }
      setPwdDone(userId);
      setChangePwdId(null);
      setNewPwd('');
      setTimeout(() => setPwdDone(p => p === userId ? null : p), 3000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unexpected error. Try again.';
      setPwdError(msg);
    }
    finally { setChangingPwd(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-5 max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-neutral-800">App Users</p>
          <p className="text-xs text-neutral-400 mt-0.5">Manage who can access the app and what they can see</p>
        </div>
        <button onClick={() => { setShowAdd(true); setAddError(''); }} className="btn-primary text-xs">
          <Plus className="w-3.5 h-3.5" /> Add User
        </button>
      </div>

      {/* Success banner */}
      {addSuccess && (
        <div className="flex items-center gap-2 bg-success-50 border border-success-100 rounded-lg px-3 py-2">
          <CheckCircle className="w-4 h-4 text-success-600 shrink-0" />
          <p className="text-xs text-success-700 font-medium">{addSuccess}</p>
        </div>
      )}

      {/* Add user form */}
      {showAdd && (
        <div className="bg-white border-2 border-primary-200 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-neutral-700 flex items-center gap-1.5"><Plus className="w-3.5 h-3.5 text-primary-600" /> New User</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Display Name *</label>
              <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} className="input" placeholder="Nikhil" />
            </div>
            <div>
              <label className="label">Email *</label>
              <input type="email" value={addForm.email} onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))} className="input" placeholder="nikhil@example.com" />
            </div>
            <div>
              <label className="label">Password *</label>
              <input type="password" value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} className="input" placeholder="Min 6 characters" />
            </div>
            <div>
              <label className="label">Role</label>
              <select value={addForm.role} onChange={e => setAddForm(f => ({ ...f, role: e.target.value as UserRole }))} className="input">
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label} — {r.desc.split(' ').slice(0, 3).join(' ')}...</option>)}
              </select>
            </div>
          </div>
          {addError && <p className="text-xs text-error-600 font-medium">{addError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => { setShowAdd(false); setAddError(''); }} className="btn-secondary text-xs">Cancel</button>
            <button onClick={handleAdd} disabled={adding} className="btn-primary text-xs">
              {adding ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </div>
      )}

      {/* User list */}
      <div className="space-y-2">
        {users.map(u => (
          <div key={u.id} className="bg-white rounded-xl border border-neutral-100 shadow-card px-4 py-3">
            <div className="flex items-center gap-3">
              {/* Avatar */}
              <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-primary-700">
                  {(u.display_name || u.email || 'U')[0].toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-neutral-900">{u.display_name || '—'}</p>
                  {u.id === myProfile?.id && <span className="text-[9px] bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded font-bold">You</span>}
                </div>
                <p className="text-xs text-neutral-400">{u.email}</p>
              </div>

              {/* Role badge or edit */}
              {editId === u.id ? (
                <div className="flex items-center gap-2 shrink-0">
                  <select value={editRole} onChange={e => setEditRole(e.target.value as UserRole)} className="input text-xs w-32 py-1">
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <button onClick={() => saveRole(u.id)} disabled={savingId === u.id} className="btn-primary text-xs py-1 px-2">
                    {savingId === u.id ? '...' : <Save className="w-3 h-3" />}
                  </button>
                  <button onClick={() => setEditId(null)} className="btn-secondary text-xs py-1 px-2">✕</button>
                </div>
              ) : (
                <div className="flex items-center gap-2 shrink-0">
                  {savedId === u.id && <CheckCircle className="w-4 h-4 text-success-500" />}
                  <span className={`badge border text-[10px] ${ROLE_COLOR[u.role] || ROLE_COLOR.user}`}>{u.role}</span>
                  {u.id !== myProfile?.id && (
                    <button onClick={() => { setEditId(u.id); setEditRole(u.role); }} className="p-1.5 rounded-lg text-neutral-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={() => sendReset(u.email)}
                    disabled={resetEmail === u.email}
                    title="Send password reset email"
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                  >
                    {resetEmail === u.email && resetSent ? <CheckCircle className="w-3 h-3 text-success-500" /> : <RefreshCw className="w-3 h-3" />}
                  </button>
                  {/* Direct password change */}
                  {pwdDone === u.id
                    ? <CheckCircle className="w-4 h-4 text-success-500" />
                    : <button onClick={() => { setChangePwdId(u.id); setNewPwd(''); setPwdError(''); }}
                        title="Set new password"
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-warning-600 hover:bg-warning-50 transition-colors">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                      </button>
                  }
                </div>
              )}

            {/* Inline password change form */}
            {changePwdId === u.id && (
              <div className="mt-3 border-t border-neutral-100 pt-3">
                <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide mb-2">
                  {u.id === myProfile?.id ? 'Change Your Password' : `Set Password for ${u.display_name}`}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={newPwd}
                    onChange={e => { setNewPwd(e.target.value); setPwdError(''); }}
                    placeholder="New password (min 6 chars)"
                    className="input text-xs flex-1"
                    autoFocus
                  />
                  <button onClick={() => changePassword(u.id)} disabled={changingPwd}
                    className="btn-primary text-xs py-1.5 px-3 shrink-0">
                    {changingPwd ? 'Saving...' : 'Set Password'}
                  </button>
                  <button onClick={() => { setChangePwdId(null); setNewPwd(''); setPwdError(''); }}
                    className="btn-secondary text-xs py-1.5 px-2 shrink-0">Cancel</button>
                </div>
                {pwdError && <p className="text-xs text-error-600 mt-1.5 font-medium">{pwdError}</p>}
              </div>
            )}
            </div>

            {/* Role description shown when editing */}
            {editId === u.id && (
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {ROLES.map(r => (
                  <button key={r.value} onClick={() => setEditRole(r.value)}
                    className={`text-left px-2 py-1.5 rounded-lg border text-xs transition-colors ${editRole === r.value ? r.color + ' border-current' : 'border-neutral-100 hover:border-neutral-200 bg-neutral-50'}`}>
                    <p className="font-semibold">{r.label}</p>
                    <p className="text-[10px] opacity-70 mt-0.5">{r.desc}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Role legend */}
      <div className="bg-white rounded-xl border border-neutral-100 shadow-card p-4 mt-2">
        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Shield className="w-3 h-3" /> Permission Summary
        </p>
        <div className="space-y-2">
          {ROLES.map(r => (
            <div key={r.value} className="flex items-start gap-2">
              <span className={`badge border text-[10px] shrink-0 mt-0.5 ${r.color}`}>{r.label}</span>
              <p className="text-xs text-neutral-500">{r.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-neutral-400 mt-3 pt-3 border-t border-neutral-100">
          ⚠️ Purchase prices are only visible to Admin. Staff can see stock, manage sales, record payments, and add expenses.
        </p>
      </div>
    </div>
  );
}
