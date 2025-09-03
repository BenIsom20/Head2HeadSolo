import { useState } from 'react';
import logo from './logo-head2head.svg';

function App() {
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [status, setStatus] = useState(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [user, setUser] = useState(null);
  const [showSignup, setShowSignup] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: '', sport: '' });
  const [inviteInput, setInviteInput] = useState('');
  const [pendingInvites, setPendingInvites] = useState([]); // usernames to invite when creating
  const [myGroups, setMyGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupDetails, setGroupDetails] = useState(null);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const onLoginChange = (e) => {
    const { name, value } = e.target;
    setLoginForm((f) => ({ ...f, [name]: value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setStatus({ type: 'loading', message: 'Creating user…' });
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.errors
          ? Object.entries(data.errors)
              .map(([k, v]) => `${k}: ${v}`)
              .join(' | ')
          : data?.message || 'Failed to create user';
        setStatus({ type: 'error', message: msg });
        return;
      }
      setStatus({ type: 'success', message: `Welcome, ${data.user.username}` });
      setUser(data.user); // auto sign-in after account creation
      setForm({ username: '', email: '', password: '' });
      fetchMyGroups(data.user.id);
      fetchInbox(data.user.id);
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Network error creating user' });
    }
  };

  const onLogin = async (e) => {
    e.preventDefault();
    setStatus({ type: 'loading', message: 'Signing in…' });
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: 'error', message: data?.error || 'Failed to sign in' });
        return;
      }
      setUser(data.user);
      setStatus({ type: 'success', message: `Signed in as ${data.user.username}` });
      setLoginForm({ username: '', password: '' });
      // Load my groups and invites after login
      fetchMyGroups(data.user.id);
      fetchInbox(data.user.id);
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', message: 'Network error signing in' });
    }
  };

  const signOut = () => {
    setUser(null);
    setMyGroups([]);
    setInbox([]);
    setSelectedGroup(null);
    setGroupDetails(null);
    setGroupForm({ name: '', sport: '' });
    setPendingInvites([]);
    setInviteInput('');
    setStatus(null);
    setShowSignup(false);
  };

  const headersWithUser = (uid) => ({ 'Content-Type': 'application/json', 'X-User-Id': String(uid) });

  const fetchMyGroups = async (uid) => {
    try {
      const res = await fetch('/api/my/groups', { headers: headersWithUser(uid) });
      const data = await res.json();
      if (res.ok) setMyGroups(data.groups);
    } catch {}
  };

  const fetchGroup = async (uid, groupId) => {
    try {
      const res = await fetch(`/api/groups/${groupId}`, { headers: headersWithUser(uid) });
      const data = await res.json();
      if (res.ok) setGroupDetails(data.group);
    } catch {}
  };

  const fetchInbox = async (uid) => {
    try {
      const res = await fetch('/api/invites?status=pending', { headers: headersWithUser(uid) });
      const data = await res.json();
      if (res.ok) setInbox(data.invites);
    } catch {}
  };

  const [inbox, setInbox] = useState([]);

  const respondInvite = async (inviteId, action) => {
    if (!user) return;
    try {
      const res = await fetch(`/api/invites/${inviteId}/respond`, {
        method: 'POST',
        headers: headersWithUser(user.id),
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ type: 'success', message: `Invite ${action}ed` });
        fetchInbox(user.id);
        fetchMyGroups(user.id);
      } else {
        setStatus({ type: 'error', message: data.error || 'Failed to respond' });
      }
    } catch {
      setStatus({ type: 'error', message: 'Network error' });
    }
  };

  const addPendingInvite = () => {
    const u = inviteInput.trim();
    if (!u) return;
    if (!window.confirm(`Invite ${u}?`)) return; // confirmation before adding
    setPendingInvites((list) => Array.from(new Set([...list, u])));
    setInviteInput('');
  };

  const createGroup = async (e) => {
    e.preventDefault();
    if (!user) {
      setStatus({ type: 'error', message: 'Sign in first' });
      return;
    }
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: headersWithUser(user.id),
        body: JSON.stringify({ ...groupForm, invitees: pendingInvites }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: 'error', message: data.error || 'Failed to create group' });
        return;
      }
      setStatus({ type: 'success', message: `Created group ${data.group.name}` });
      setGroupForm({ name: '', sport: '' });
      setPendingInvites([]);
      fetchMyGroups(user.id);
    } catch (e1) {
      setStatus({ type: 'error', message: 'Network error creating group' });
    }
  };

  const updateGroup = async (e) => {
    e.preventDefault();
    if (!user || !selectedGroup) return;
    try {
      const res = await fetch(`/api/groups/${selectedGroup}`, {
        method: 'PATCH',
        headers: headersWithUser(user.id),
        body: JSON.stringify({ name: groupDetails.name, sport: groupDetails.sport }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ type: 'success', message: 'Group updated' });
        fetchGroup(user.id, selectedGroup);
        fetchMyGroups(user.id);
      } else {
        setStatus({ type: 'error', message: data.error || 'Update failed' });
      }
    } catch {}
  };

  const inviteToGroup = async () => {
    if (!user || !selectedGroup) return;
    const u = inviteInput.trim();
    if (!u) return;
    if (!window.confirm(`Invite ${u} to group?`)) return;
    try {
      const res = await fetch(`/api/groups/${selectedGroup}/invites`, {
        method: 'POST',
        headers: headersWithUser(user.id),
        body: JSON.stringify({ username: u }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ type: 'success', message: `Invited ${u}` });
        setInviteInput('');
      } else {
        setStatus({ type: 'error', message: data.error || 'Invite failed' });
      }
    } catch {}
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-slate-900/70 backdrop-blur sticky top-0 z-10 border-b border-slate-800">
        <div className="container-narrow py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Head2Head" className="h-10 w-auto" />
            <span className="text-xl font-semibold text-slate-100">Head2Head</span>
          </div>
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-slate-300 hidden sm:block">Hello {user.username}</span>
              <button className="px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-sm" onClick={signOut}>
                Sign Out
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {/* Content */}
      <main className="container-narrow py-8">
        {!user ? (
          <div className="max-w-md mx-auto">
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow-lg">
              <h1 className="text-2xl font-bold text-slate-100 mb-4">{showSignup ? 'Create Account' : 'Sign In'}</h1>
              {!showSignup ? (
                <form onSubmit={onLogin} className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-300">Username</label>
                    <input name="username" value={loginForm.username} onChange={onLoginChange} required className="mt-1 w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300">Password</label>
                    <input type="password" name="password" value={loginForm.password} onChange={onLoginChange} required className="mt-1 w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <button type="submit" className="w-full py-2 rounded-md bg-brand-600 hover:bg-brand-500 text-white font-medium">Sign In</button>
                </form>
              ) : (
                <form onSubmit={onSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-300">Username</label>
                    <input name="username" value={form.username} onChange={onChange} required className="mt-1 w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300">Email</label>
                    <input type="email" name="email" value={form.email} onChange={onChange} placeholder="optional" className="mt-1 w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300">Password</label>
                    <input type="password" name="password" value={form.password} onChange={onChange} required minLength={6} className="mt-1 w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <button type="submit" className="w-full py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-medium">Create Account</button>
                </form>
              )}
              <div className="mt-4 text-center">
                {!showSignup ? (
                  <button type="button" onClick={() => setShowSignup(true)} className="text-brand-400 hover:text-brand-300 text-sm">
                    Don’t have an account? Create one here
                  </button>
                ) : (
                  <button type="button" onClick={() => setShowSignup(false)} className="text-brand-400 hover:text-brand-300 text-sm">
                    Already have an account? Sign in
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow">
                <h2 className="text-lg font-semibold mb-4">Create Group</h2>
                <form onSubmit={createGroup} className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-300">Group Name</label>
                    <input name="name" value={groupForm.name} onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))} required className="mt-1 w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300">Group Sport</label>
                    <input name="sport" value={groupForm.sport} onChange={(e) => setGroupForm((f) => ({ ...f, sport: e.target.value }))} required className="mt-1 w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300">Invite by username</label>
                    <div className="mt-1 flex gap-2">
                      <input value={inviteInput} onChange={(e) => setInviteInput(e.target.value)} className="flex-1 rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                      <button type="button" onClick={addPendingInvite} className="px-3 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100">Add</button>
                    </div>
                    {pendingInvites.length > 0 && (
                      <p className="mt-2 text-sm text-slate-400">To invite: {pendingInvites.join(', ')}</p>
                    )}
                  </div>
                  <button type="submit" className="px-4 py-2 rounded-md bg-brand-600 hover:bg-brand-500 text-white">Create Group</button>
                </form>
              </section>

              <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow">
                <h2 className="text-lg font-semibold mb-4">Invites Inbox</h2>
                {inbox.length === 0 ? (
                  <p className="text-slate-400">No pending invites</p>
                ) : (
                  <ul className="space-y-2">
                    {inbox.map((inv) => (
                      <li key={inv.id} className="flex items-center justify-between bg-slate-800/60 border border-slate-700 rounded-lg p-3">
                        <div>
                          <div className="font-medium">{inv.group?.name} <span className="text-slate-400">({inv.group?.sport})</span></div>
                          <div className="text-slate-400 text-sm">invited by {inv.inviter?.username}</div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => respondInvite(inv.id, 'accept')} className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-sm">Accept</button>
                          <button onClick={() => respondInvite(inv.id, 'decline')} className="px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-sm">Decline</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
              <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow">
                <h2 className="text-lg font-semibold mb-4">My Groups</h2>
                {myGroups.length === 0 ? (
                  <p className="text-slate-400">No groups yet</p>
                ) : (
                  <ul className="space-y-2">
                    {myGroups.map((g) => (
                      <li key={g.id}>
                        <button onClick={() => { setSelectedGroup(g.id); fetchGroup(user.id, g.id); }} className="text-left w-full px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700 hover:bg-slate-800">
                          <div className="font-medium">{g.name} <span className="text-slate-400">({g.sport})</span></div>
                          <div className="text-slate-400 text-sm">{g.role}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow">
                <h2 className="text-lg font-semibold mb-4">Group Info</h2>
                {!selectedGroup || !groupDetails ? (
                  <p className="text-slate-400">Select a group to view details</p>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-slate-300">Name</label>
                      <input value={groupDetails.name} onChange={(e) => setGroupDetails((gd) => ({ ...gd, name: e.target.value }))} disabled={groupDetails.my_role !== 'owner'} className="mt-1 w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100 disabled:opacity-60" />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-300">Sport</label>
                      <input value={groupDetails.sport} onChange={(e) => setGroupDetails((gd) => ({ ...gd, sport: e.target.value }))} disabled={groupDetails.my_role !== 'owner'} className="mt-1 w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100 disabled:opacity-60" />
                    </div>
                    {groupDetails.my_role === 'owner' && (
                      <button onClick={updateGroup} className="px-4 py-2 rounded-md bg-brand-600 hover:bg-brand-500 text-white">Save</button>
                    )}

                    <div>
                      <h3 className="font-semibold">Members</h3>
                      {groupDetails.members?.length ? (
                        <ul className="mt-2 space-y-1">
                          {groupDetails.members.map((m) => (
                            <li key={m.id} className="text-slate-300">{m.username} <span className="text-slate-500">— {m.role}</span></li>
                          ))}
                        </ul>
                      ) : <p className="text-slate-400">No members</p>}
                    </div>

                    {groupDetails.my_role === 'owner' && (
                      <div>
                        <h4 className="font-semibold">Invite Friend</h4>
                        <div className="mt-2 flex gap-2">
                          <input value={inviteInput} onChange={(e) => setInviteInput(e.target.value)} className="flex-1 rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100" />
                          <button onClick={inviteToGroup} className="px-3 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100">Invite</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>

            {status && (
              <p className={`mt-4 ${status.type === 'error' ? 'text-rose-400' : status.type === 'success' ? 'text-emerald-400' : 'text-slate-300'}`}>
                {status.message}
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
