import { useState } from 'react';

function App() {
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [status, setStatus] = useState(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [user, setUser] = useState(null);
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
      setStatus({ type: 'success', message: `User created: ${data.user.username}` });
      setForm({ username: '', email: '', password: '' });
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
    <div style={{ maxWidth: 900, margin: '48px auto', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1>{user ? `Hello ${user.username}` : 'Welcome'}</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <section>
          <h2 style={{ marginTop: 0 }}>Create Account</h2>
      <form onSubmit={onSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label>
            Username
            <input
              name="username"
              value={form.username}
              onChange={onChange}
              required
              style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
            />
          </label>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>
            Email
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={onChange}
              placeholder="optional"
              style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
            />
          </label>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>
            Password
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={onChange}
              required
              minLength={6}
              style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
            />
          </label>
        </div>
        <button type="submit" style={{ padding: '8px 12px' }}>Create Account</button>
      </form>
        </section>

        <section>
          <h2 style={{ marginTop: 0 }}>Sign In</h2>
          <form onSubmit={onLogin}>
            <div style={{ marginBottom: 12 }}>
              <label>
                Username
                <input
                  name="username"
                  value={loginForm.username}
                  onChange={onLoginChange}
                  required
                  style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
                />
              </label>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label>
                Password
                <input
                  type="password"
                  name="password"
                  value={loginForm.password}
                  onChange={onLoginChange}
                  required
                  style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
                />
              </label>
            </div>
            <button type="submit" style={{ padding: '8px 12px' }}>Sign In</button>
          </form>
        </section>
      </div>

      {user && (
        <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <section>
            <h2 style={{ marginTop: 0 }}>Create Group</h2>
            <form onSubmit={createGroup}>
              <div style={{ marginBottom: 8 }}>
                <label>
                  Group Name
                  <input
                    name="name"
                    value={groupForm.name}
                    onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))}
                    required
                    style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
                  />
                </label>
              </div>
              <div style={{ marginBottom: 8 }}>
                <label>
                  Group Sport
                  <input
                    name="sport"
                    value={groupForm.sport}
                    onChange={(e) => setGroupForm((f) => ({ ...f, sport: e.target.value }))}
                    required
                    style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
                  />
                </label>
              </div>
              <div style={{ marginBottom: 8 }}>
                <label>
                  Invite by username
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <input value={inviteInput} onChange={(e) => setInviteInput(e.target.value)} style={{ flex: 1, padding: 8 }} />
                    <button type="button" onClick={addPendingInvite}>Add</button>
                  </div>
                </label>
                {pendingInvites.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 14 }}>
                    To invite: {pendingInvites.join(', ')}
                  </div>
                )}
              </div>
              <button type="submit" style={{ padding: '8px 12px' }}>Create Group</button>
            </form>
          </section>

          <section>
            <h2 style={{ marginTop: 0 }}>Invites Inbox</h2>
            {inbox.length === 0 ? (
              <p>No pending invites</p>
            ) : (
              <ul>
                {inbox.map((inv) => (
                  <li key={inv.id} style={{ marginBottom: 8 }}>
                    {inv.group?.name} ({inv.group?.sport}) — invited by {inv.inviter?.username}
                    <div style={{ display: 'inline-flex', gap: 8, marginLeft: 8 }}>
                      <button onClick={() => respondInvite(inv.id, 'accept')}>Accept</button>
                      <button onClick={() => respondInvite(inv.id, 'decline')}>Decline</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {user && (
        <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <section>
            <h2 style={{ marginTop: 0 }}>My Groups</h2>
            {myGroups.length === 0 ? <p>No groups yet</p> : (
              <ul>
                {myGroups.map((g) => (
                  <li key={g.id}>
                    <button onClick={() => { setSelectedGroup(g.id); fetchGroup(user.id, g.id); }} style={{ padding: 0, border: 'none', background: 'none', color: 'blue', cursor: 'pointer' }}>
                      {g.name} ({g.sport}) — {g.role}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 style={{ marginTop: 0 }}>Group Info</h2>
            {!selectedGroup || !groupDetails ? (
              <p>Select a group to view details</p>
            ) : (
              <div>
                <div style={{ marginBottom: 8 }}>
                  <label>
                    Name
                    <input value={groupDetails.name} onChange={(e) => setGroupDetails((gd) => ({ ...gd, name: e.target.value }))} disabled={groupDetails.my_role !== 'owner'} style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }} />
                  </label>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label>
                    Sport
                    <input value={groupDetails.sport} onChange={(e) => setGroupDetails((gd) => ({ ...gd, sport: e.target.value }))} disabled={groupDetails.my_role !== 'owner'} style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }} />
                  </label>
                </div>
                {groupDetails.my_role === 'owner' && (
                  <button onClick={updateGroup} style={{ marginBottom: 12 }}>Save</button>
                )}

                <h3>Members</h3>
                {groupDetails.members?.length ? (
                  <ul>
                    {groupDetails.members.map((m) => (
                      <li key={m.id}>{m.username} — {m.role}</li>
                    ))}
                  </ul>
                ) : <p>No members</p>}

                {groupDetails.my_role === 'owner' && (
                  <div style={{ marginTop: 12 }}>
                    <h4>Invite Friend</h4>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input value={inviteInput} onChange={(e) => setInviteInput(e.target.value)} style={{ flex: 1, padding: 8 }} />
                      <button onClick={inviteToGroup}>Invite</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {status && (
        <p style={{ marginTop: 12, color: status.type === 'error' ? 'crimson' : status.type === 'success' ? 'green' : 'inherit' }}>
          {status.message}
        </p>
      )}
    </div>
  );
}

export default App;
