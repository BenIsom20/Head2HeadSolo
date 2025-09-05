import { useState, useEffect } from 'react';
import { Tabs } from './components';
import logo from './logo-head2head.svg';

function App() {
  const SPORT_OPTIONS = [
    { label: '🏀 Basketball', value: 'Basketball' },
    { label: '⚽ Soccer (Football)', value: 'Soccer (Football)' },
    { label: '⚾ Baseball / Softball', value: 'Baseball / Softball' },
    { label: '🏈 American Football', value: 'American Football' },
    { label: '🏒 Hockey (Ice, Field, Roller)', value: 'Hockey (Ice, Field, Roller)' },
    { label: '🏐 Volleyball', value: 'Volleyball' },
    { label: '🎾 Tennis', value: 'Tennis' },
    { label: '🏓 Table Tennis (Ping Pong)', value: 'Table Tennis (Ping Pong)' },
    { label: '⛳ Golf', value: 'Golf' },
    { label: '🏸 Badminton', value: 'Badminton' },
    { label: '✏️ Other (Custom)', value: 'other' },
  ];
  const SPORT_DEFAULT_SIZES = {
    'Basketball': 5,
    'Soccer (Football)': 11,
    'Baseball / Softball': 9,
    'American Football': 11,
    'Hockey (Ice, Field, Roller)': 6,
    'Volleyball': 6,
    'Tennis': 1,
    'Table Tennis (Ping Pong)': 1,
    'Golf': 1,
    'Badminton': 1,
  };

  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [status, setStatus] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token') || '');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [user, setUser] = useState(null);
  const [showSignup, setShowSignup] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: '' });
  const [createSportSelect, setCreateSportSelect] = useState('');
  const [createSportCustom, setCreateSportCustom] = useState('');
  const [createCustomFormat, setCreateCustomFormat] = useState('team'); // 'team' | 'ffa'
  const [inviteInput, setInviteInput] = useState('');
  const [pendingInvites, setPendingInvites] = useState([]); // usernames to invite when creating
  const [myGroups, setMyGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupDetails, setGroupDetails] = useState(null);
  const [editSportSelect, setEditSportSelect] = useState('');
  const [editCustomSport, setEditCustomSport] = useState('');
  const [createTeamSize, setCreateTeamSize] = useState(1);
  const [editTeamSize, setEditTeamSize] = useState(1);
  const [winnerId, setWinnerId] = useState('');
  const [loserId, setLoserId] = useState('');
  const [isTie, setIsTie] = useState(false);
  const [transferToId, setTransferToId] = useState('');
  const [teamSize, setTeamSize] = useState(1);
  const [teamAIds, setTeamAIds] = useState([]);
  const [teamBIds, setTeamBIds] = useState([]);
  const [winnerTeam, setWinnerTeam] = useState(1); // 1 or 2
  const [groupTab, setGroupTab] = useState('overview'); // overview | matches | members | settings
  const [teamAScore, setTeamAScore] = useState('');
  const [teamBScore, setTeamBScore] = useState('');
  // FFA state
  const [isFFA, setIsFFA] = useState(false);
  const [ffaParticipantCount, setFfaParticipantCount] = useState(4);
  const [ffaParticipants, setFfaParticipants] = useState([]); // array of user ids (strings)
  const [ffaSingleWinner, setFfaSingleWinner] = useState(false);
  const [ffaWinnerId, setFfaWinnerId] = useState('');
  const [ffaRanks, setFfaRanks] = useState({}); // userId -> place
  const [matchHistory, setMatchHistory] = useState([]);

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
      if (data.token) { localStorage.setItem('token', data.token); setToken(data.token); }
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
      if (data.token) { localStorage.setItem('token', data.token); setToken(data.token); }
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
    setGroupForm({ name: '' });
    setCreateSportSelect('');
    setCreateSportCustom('');
    setCreateCustomFormat('team');
    setCreateTeamSize(1);
    setPendingInvites([]);
    setInviteInput('');
    setStatus(null);
    setShowSignup(false);
    setToken('');
    localStorage.removeItem('token');
  };

  const headersWithUser = (uid) => ({ 'Content-Type': 'application/json', 'X-User-Id': String(uid) });
  const headersAuth = () => {
    const h = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  };

  const fetchMyGroups = async (uid) => {
    try {
      const res = await fetch('/api/my/groups', { headers: headersAuth() });
      const data = await res.json();
      if (res.ok) setMyGroups(data.groups);
    } catch {}
  };

  const fetchGroup = async (uid, groupId) => {
    try {
      const res = await fetch(`/api/groups/${groupId}`, { headers: headersAuth() });
      const data = await res.json();
      if (res.ok) setGroupDetails(data.group);
    } catch {}
  };

  const fetchHistory = async (uid, groupId) => {
    try {
      const res = await fetch(`/api/groups/${groupId}/matches?limit=20`, { headers: headersAuth() });
      const data = await res.json();
      if (res.ok) setMatchHistory(data.matches || []);
    } catch {}
  };

  // Sync edit sport dropdown with loaded group details
  useEffect(() => {
    if (!groupDetails) return;
    const known = SPORT_OPTIONS.some((o) => o.value !== 'other' && o.value === groupDetails.sport);
    if (known) {
      setEditSportSelect(groupDetails.sport);
      setEditCustomSport('');
    } else {
      setEditSportSelect('other');
      setEditCustomSport(groupDetails.sport || '');
    }
    // sync default team size
    setEditTeamSize(Number(groupDetails.default_team_size || 1));
    // set record match team size and reset picks
    const ts = Number(groupDetails.default_team_size || 1);
    setTeamSize(ts);
    setTeamAIds(Array.from({ length: ts }, () => ''));
    setTeamBIds(Array.from({ length: ts }, () => ''));
    setWinnerTeam(1);
    setTeamAScore('');
    setTeamBScore('');
    // initialize FFA participants with a reasonable default
    const defaultFFA = Math.max(2, Math.min(6, ts * 2));
    setFfaParticipantCount(defaultFFA);
    setFfaParticipants(Array.from({ length: defaultFFA }, () => ''));
    setFfaSingleWinner(false);
    setFfaWinnerId('');
    setFfaRanks({});
    if (user && selectedGroup) {
      fetchHistory(user.id, selectedGroup);
    }
  }, [groupDetails]);

  // Auto-suggest default team size on create when sport changes (and not other)
  useEffect(() => {
    if (!createSportSelect || createSportSelect === 'other') return;
    const d = SPORT_DEFAULT_SIZES[createSportSelect] || 1;
    setCreateTeamSize(d);
  }, [createSportSelect]);

  // Auto sign-in from JWT on load
  useEffect(() => {
    const init = async () => {
      if (!token) return;
      try {
        const res = await fetch('/api/auth/me', { headers: headersAuth() });
        const data = await res.json();
        if (res.ok) {
          setUser(data.user);
          fetchMyGroups(data.user.id);
          fetchInbox(data.user.id);
        } else {
          // invalid/expired token
          localStorage.removeItem('token');
          setToken('');
        }
      } catch {}
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchInbox = async (uid) => {
    try {
      const res = await fetch('/api/invites?status=pending', { headers: headersAuth() });
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
        headers: headersAuth(),
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
    // Resolve sport value from dropdown/custom
    const sport = createSportSelect === 'other' ? createSportCustom.trim() : createSportSelect;
    if (!sport) {
      setStatus({ type: 'error', message: 'Please select or enter a sport' });
      return;
    }
    let dts = 1;
    if (!(createSportSelect === 'other' && createCustomFormat === 'ffa')) {
      dts = Number(createTeamSize);
      if (!Number.isInteger(dts) || dts < 1) {
        setStatus({ type: 'error', message: 'Enter a valid default team size (>=1)' });
        return;
      }
    }
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: headersAuth(),
        body: JSON.stringify({ name: groupForm.name, sport, default_team_size: dts, invitees: pendingInvites }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: 'error', message: data.error || 'Failed to create group' });
        return;
      }
      setStatus({ type: 'success', message: `Created group ${data.group.name}` });
      setGroupForm({ name: '' });
      setCreateSportSelect('');
      setCreateSportCustom('');
      setCreateCustomFormat('team');
      setCreateTeamSize(1);
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
        headers: headersAuth(),
        body: JSON.stringify({ name: groupDetails.name, sport: groupDetails.sport, default_team_size: editTeamSize }),
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
        headers: headersAuth(),
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

  const recordMatch = async (e) => {
    e.preventDefault();
    if (!user || !selectedGroup) return;
    let body;
    if (isFFA) {
      // FFA validation
      const parts = ffaParticipants.map((x) => Number(x)).filter((x) => !!x);
      if (parts.length !== ffaParticipantCount) {
        setStatus({ type: 'error', message: 'Select all FFA participants' });
        return;
      }
      const uniq = new Set(parts);
      if (uniq.size !== parts.length) {
        setStatus({ type: 'error', message: 'Duplicate participants in FFA' });
        return;
      }
      if (ffaSingleWinner) {
        const w = Number(ffaWinnerId);
        if (!w || !parts.includes(w)) {
          setStatus({ type: 'error', message: 'Select the FFA winner from participants' });
          return;
        }
        body = { ffa: true, players: parts, winner_id: w };
      } else {
        // placements required for each participant
        const rankMap = {};
        for (const uid of parts) {
          const r = Number(ffaRanks[uid]);
          if (!Number.isInteger(r) || r < 1) {
            setStatus({ type: 'error', message: 'Enter a valid place (>=1) for each participant' });
            return;
          }
          rankMap[uid] = r;
        }
        body = { ffa: true, players: parts, ranks: rankMap };
      }
    } else {
      // Team validation
      const a = teamAIds.map((x) => Number(x)).filter((x) => !!x);
      const b = teamBIds.map((x) => Number(x)).filter((x) => !!x);
      if (a.length !== teamSize || b.length !== teamSize) {
        setStatus({ type: 'error', message: 'Select all players for both teams' });
        return;
      }
      const overlap = a.filter((id) => b.includes(id));
      if (overlap.length > 0) {
        setStatus({ type: 'error', message: 'A player cannot be on both teams' });
        return;
      }
      body = isTie ? { is_tie: true, playersA: a, playersB: b } : { playersA: a, playersB: b, winner_team: Number(winnerTeam) };
      const sa = teamAScore !== '' ? Number(teamAScore) : undefined;
      const sb = teamBScore !== '' ? Number(teamBScore) : undefined;
      if (sa !== undefined) body.score_a = sa;
      if (sb !== undefined) body.score_b = sb;
    }
    try {
      const res = await fetch(`/api/groups/${selectedGroup}/matches`, {
        method: 'POST',
        headers: headersAuth(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: 'error', message: data.error || 'Failed to record match' });
        return;
      }
      setStatus({ type: 'success', message: isFFA ? 'FFA recorded and ELO updated' : (isTie ? 'Tie recorded and ELO updated' : 'Match recorded and ELO updated') });
      if (isFFA) {
        setFfaParticipants(Array.from({ length: ffaParticipantCount }, () => ''));
        setFfaSingleWinner(false);
        setFfaWinnerId('');
        setFfaRanks({});
      } else {
        setTeamAIds(Array.from({ length: teamSize }, () => ''));
        setTeamBIds(Array.from({ length: teamSize }, () => ''));
        setIsTie(false);
        setWinnerTeam(1);
        setTeamAScore('');
        setTeamBScore('');
      }
      fetchGroup(user.id, selectedGroup);
      fetchHistory(user.id, selectedGroup);
      fetchMyGroups(user.id);
    } catch (e1) {
      setStatus({ type: 'error', message: 'Network error recording match' });
    }
  };

  const transferOwnership = async () => {
    if (!user || !selectedGroup) return;
    const id = Number(transferToId);
    if (!id) {
      setStatus({ type: 'error', message: 'Select a member to transfer to' });
      return;
    }
    if (!window.confirm('Transfer ownership?')) return;
    try {
      const res = await fetch(`/api/groups/${selectedGroup}/transfer-ownership`, {
        method: 'POST',
        headers: headersAuth(),
        body: JSON.stringify({ new_owner_id: id }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ type: 'success', message: 'Ownership transferred' });
        setTransferToId('');
        fetchGroup(user.id, selectedGroup);
        fetchMyGroups(user.id);
      } else {
        setStatus({ type: 'error', message: data.error || 'Failed to transfer ownership' });
      }
    } catch {
      setStatus({ type: 'error', message: 'Network error' });
    }
  };

  const leaveGroup = async () => {
    if (!user || !selectedGroup) return;
    if (!window.confirm('Leave this group?')) return;
    try {
      const res = await fetch(`/api/groups/${selectedGroup}/leave`, {
        method: 'POST',
        headers: headersAuth(),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ type: 'success', message: 'Left group' });
        setSelectedGroup(null);
        setGroupDetails(null);
        fetchMyGroups(user.id);
      } else {
        setStatus({ type: 'error', message: data.error || 'Failed to leave group' });
      }
    } catch {
      setStatus({ type: 'error', message: 'Network error' });
    }
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
                    <div className="mt-1 grid grid-cols-1 gap-2">
                      <select value={createSportSelect} onChange={(e) => setCreateSportSelect(e.target.value)} required className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500">
                        <option value="">Select a sport</option>
                        {SPORT_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      {createSportSelect === 'other' && (
                        <>
                          <input placeholder="Enter custom sport" value={createSportCustom} onChange={(e) => setCreateSportCustom(e.target.value)} className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                          <div className="text-slate-300">
                            <label className="block text-sm mt-3">Competition Format</label>
                            <div className="mt-1 flex flex-col sm:flex-row gap-3">
                              <label className="inline-flex items-center gap-2">
                                <input type="radio" name="createCustomFormat" value="team" checked={createCustomFormat === 'team'} onChange={() => setCreateCustomFormat('team')} />
                                Team-based (uses team size)
                              </label>
                              <label className="inline-flex items-center gap-2">
                                <input type="radio" name="createCustomFormat" value="ffa" checked={createCustomFormat === 'ffa'} onChange={() => setCreateCustomFormat('ffa')} />
                                Free For All
                              </label>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  {!(createSportSelect === 'other' && createCustomFormat === 'ffa') && (
                    <div>
                      <label className="block text-sm text-slate-300">Default Team Size</label>
                      <input type="number" min={1} value={createTeamSize} onChange={(e) => setCreateTeamSize(e.target.value)} className="mt-1 w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500" />
                      <p className="text-xs text-slate-500 mt-1">Auto-filled from sport; you can adjust.</p>
                    </div>
                  )}
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
                {selectedGroup && groupDetails && (
                  <div className="mb-2">
                    <Tabs
                      value={groupTab}
                      onChange={setGroupTab}
                      tabs={[
                        { value: 'overview', label: 'Overview' },
                        { value: 'matches', label: 'Matches' },
                        { value: 'members', label: 'Members' },
                        { value: 'settings', label: 'Settings' },
                      ]}
                    />
                  </div>
                )}
                {!selectedGroup || !groupDetails ? (
                  <p className="text-slate-400">Select a group to view details</p>
                ) : (
                  <div className="space-y-4">
                    {groupTab === 'overview' && (
                      <div className="space-y-2 text-slate-300">
                        <div>Name: <span className="text-slate-100 font-medium">{groupDetails.name}</span></div>
                        <div>Sport: <span className="text-slate-100 font-medium">{groupDetails.sport}</span></div>
                        <div>Members: <span className="text-slate-100 font-medium">{groupDetails.members?.length || 0}</span></div>
                      </div>
                    )}

                    {groupTab === 'settings' && (
                    <>
                    <div>
                      <label className="block text-sm text-slate-300">Name</label>
                      <input value={groupDetails.name} onChange={(e) => setGroupDetails((gd) => ({ ...gd, name: e.target.value }))} disabled={groupDetails.my_role !== 'owner'} className="mt-1 w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100 disabled:opacity-60" />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-300">Sport</label>
                      <div className="mt-1 grid grid-cols-1 gap-2">
                        <select
                          value={editSportSelect}
                          onChange={(e) => {
                            const v = e.target.value;
                            setEditSportSelect(v);
                            if (v !== 'other') {
                              setGroupDetails((gd) => ({ ...gd, sport: v }));
                              setEditCustomSport('');
                            } else {
                              // keep current custom value
                              setGroupDetails((gd) => ({ ...gd, sport: editCustomSport }));
                            }
                          }}
                          disabled={groupDetails.my_role !== 'owner'}
                          className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100 disabled:opacity-60"
                        >
                          {SPORT_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        {editSportSelect === 'other' && (
                          <input
                            placeholder="Enter custom sport"
                            value={editCustomSport}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditCustomSport(val);
                              setGroupDetails((gd) => ({ ...gd, sport: val }));
                            }}
                            disabled={groupDetails.my_role !== 'owner'}
                            className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100 disabled:opacity-60"
                          />
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-slate-300">Default Team Size</label>
                      <input
                        type="number"
                        min={1}
                        value={editTeamSize}
                        onChange={(e) => setEditTeamSize(e.target.value)}
                        disabled={groupDetails.my_role !== 'owner'}
                        className="mt-1 w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100 disabled:opacity-60"
                      />
                    </div>
                    {groupDetails.my_role === 'owner' && (
                      <button onClick={updateGroup} className="px-4 py-2 rounded-md bg-brand-600 hover:bg-brand-500 text-white">Save</button>
                    )}
                    </>
                    )}

                    {groupTab === 'members' && (
                      <div>
                        <h3 className="font-semibold">Members</h3>
                      {groupDetails.members?.length ? (
                        <ul className="mt-2 space-y-1">
                          {groupDetails.members.map((m) => (
                            <li key={m.id} className="text-slate-300 flex justify-between">
                              <span>{m.username} <span className="text-slate-500">— {m.role}</span></span>
                              <span className="text-brand-400 font-semibold">ELO {m.elo}</span>
                            </li>
                          ))}
                        </ul>
                      ) : <p className="text-slate-400">No members</p>}
                      </div>
                    )}

                    {groupDetails.my_role === 'owner' && groupTab === 'settings' && (
                      <div>
                        <h4 className="font-semibold">Invite Friend</h4>
                        <div className="mt-2 flex gap-2">
                          <input value={inviteInput} onChange={(e) => setInviteInput(e.target.value)} className="flex-1 rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100" />
                          <button onClick={inviteToGroup} className="px-3 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100">Invite</button>
                        </div>
                      </div>
                    )}

                    {/* Record Match / Tie with Teams */}
                    {selectedGroup && groupTab === 'matches' && (
                      <div>
                        <h4 className="font-semibold">Record Match</h4>
                        <form onSubmit={recordMatch} className="mt-2 space-y-3">
                          <div className="flex items-center gap-4 text-slate-300">
                            <label className="inline-flex items-center gap-2">
                              <input type="checkbox" checked={isFFA} onChange={(e) => setIsFFA(e.target.checked)} />
                              Free For All
                            </label>
                          </div>
                          {!isFFA && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                            <div>
                              <label className="block text-sm text-slate-300">Team Size</label>
                              <input type="number" min={1} value={teamSize} onChange={(e) => {
                                const ts = Math.max(1, Number(e.target.value || 1));
                                setTeamSize(ts);
                                setTeamAIds(Array.from({ length: ts }, (_, i) => teamAIds[i] || ''));
                                setTeamBIds(Array.from({ length: ts }, (_, i) => teamBIds[i] || ''));
                              }} className="mt-1 w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100" />
                              <p className="text-xs text-slate-500 mt-1">Defaults to group setting.</p>
                            </div>
                            <div className="sm:col-span-2 flex items-center gap-4">
                              <label className="inline-flex items-center gap-2 text-slate-300">
                                <input type="checkbox" checked={isTie} onChange={(e) => setIsTie(e.target.checked)} />
                                Tie
                              </label>
                              {!isTie && (
                                <div className="flex items-center gap-3 text-slate-300">
                                  <span>Winner:</span>
                                  <label className="inline-flex items-center gap-1">
                                    <input type="radio" name="winnerTeam" value="1" checked={winnerTeam === 1} onChange={() => setWinnerTeam(1)} /> Team A
                                  </label>
                                  <label className="inline-flex items-center gap-1">
                                    <input type="radio" name="winnerTeam" value="2" checked={winnerTeam === 2} onChange={() => setWinnerTeam(2)} /> Team B
                                  </label>
                                </div>
                              )}
                            </div>
                          </div>
                          )}
                          {!isFFA && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <h5 className="font-medium">Team A</h5>
                              <div className="mt-2 space-y-2">
                                {Array.from({ length: teamSize }).map((_, idx) => (
                                  <select key={idx} value={teamAIds[idx] || ''} onChange={(e) => setTeamAIds((arr) => { const cp = [...arr]; cp[idx] = e.target.value; return cp; })} className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100">
                                    <option value="">Select player {idx + 1}</option>
                                    {groupDetails.members?.map((m) => (
                                      <option key={m.id} value={m.id}>{m.username}</option>
                                    ))}
                                  </select>
                                ))}
                              </div>
                            </div>
                            <div>
                              <h5 className="font-medium">Team B</h5>
                              <div className="mt-2 space-y-2">
                                {Array.from({ length: teamSize }).map((_, idx) => (
                                  <select key={idx} value={teamBIds[idx] || ''} onChange={(e) => setTeamBIds((arr) => { const cp = [...arr]; cp[idx] = e.target.value; return cp; })} className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100">
                                    <option value="">Select player {idx + 1}</option>
                                    {groupDetails.members?.map((m) => (
                                      <option key={m.id} value={m.id}>{m.username}</option>
                                    ))}
                                  </select>
                                ))}
                              </div>
                            </div>
                          </div>
                          )}
                          {!isFFA && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm text-slate-300">Team A score (optional)</label>
                                <input type="number" min={0} value={teamAScore} onChange={(e) => setTeamAScore(e.target.value)} className="mt-1 w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100" />
                              </div>
                              <div>
                                <label className="block text-sm text-slate-300">Team B score (optional)</label>
                                <input type="number" min={0} value={teamBScore} onChange={(e) => setTeamBScore(e.target.value)} className="mt-1 w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100" />
                              </div>
                            </div>
                          )}
                          {isFFA && (
                            <div className="space-y-3">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                                <div>
                                  <label className="block text-sm text-slate-300">Participants</label>
                                  <input type="number" min={2} value={ffaParticipantCount} onChange={(e) => {
                                    const n = Math.max(2, Number(e.target.value || 2));
                                    setFfaParticipantCount(n);
                                    setFfaParticipants((arr) => Array.from({ length: n }, (_, i) => arr[i] || ''));
                                  }} className="mt-1 w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100" />
                                </div>
                                <div className="sm:col-span-2 flex items-center gap-4 text-slate-300">
                                  <label className="inline-flex items-center gap-2">
                                    <input type="checkbox" checked={ffaSingleWinner} onChange={(e) => setFfaSingleWinner(e.target.checked)} />
                                    Single winner (others tie)
                                  </label>
                                  {ffaSingleWinner && (
                                    <select value={ffaWinnerId} onChange={(e) => setFfaWinnerId(e.target.value)} className="rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100">
                                      <option value="">Select winner</option>
                                      {ffaParticipants
                                        .map((pid) => groupDetails.members?.find((m) => String(m.id) === String(pid)))
                                        .filter(Boolean)
                                        .map((m) => (
                                          <option key={m.id} value={m.id}>{m.username}</option>
                                        ))}
                                    </select>
                                  )}
                                </div>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <h5 className="font-medium">Participants</h5>
                                  <div className="mt-2 space-y-2">
                                    {Array.from({ length: ffaParticipantCount }).map((_, idx) => (
                                      <div key={idx} className="flex gap-2 items-center">
                                        <select value={ffaParticipants[idx] || ''} onChange={(e) => setFfaParticipants((arr) => { const cp = [...arr]; cp[idx] = e.target.value; return cp; })} className="flex-1 rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100">
                                          <option value="">Select participant {idx + 1}</option>
                                          {groupDetails.members?.map((m) => (
                                            <option key={m.id} value={m.id}>{m.username}</option>
                                          ))}
                                        </select>
                                        {!ffaSingleWinner && (
                                          <input type="number" min={1} placeholder="Place" value={ffaRanks[ffaParticipants[idx]] || ''} onChange={(e) => {
                                            const uid = ffaParticipants[idx];
                                            const val = e.target.value;
                                            setFfaRanks((r) => ({ ...r, [uid]: val }));
                                          }} className="w-24 rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100" />
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                          <div>
                            <button type="submit" className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white">Record</button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* Ownership / Leave Controls */}
                    {selectedGroup && groupDetails?.members?.length > 0 && groupTab === 'settings' && (
                      <div className="mt-6 space-y-3">
                        {groupDetails.my_role === 'owner' && (
                          <div className="flex flex-col sm:flex-row gap-2 items-end">
                            <div className="flex-1">
                              <label className="block text-sm text-slate-300">Transfer ownership to</label>
                              <select value={transferToId} onChange={(e) => setTransferToId(e.target.value)} className="mt-1 w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-slate-100">
                                <option value="">Select member</option>
                                {groupDetails.members
                                  .filter((m) => m.id !== user.id)
                                  .map((m) => (
                                    <option key={m.id} value={m.id}>{m.username}</option>
                                  ))}
                              </select>
                            </div>
                            <button onClick={transferOwnership} className="px-4 py-2 rounded-md bg-amber-600 hover:bg-amber-500 text-white">Transfer Ownership</button>
                          </div>
                        )}
                        <div>
                          <button onClick={leaveGroup} className="px-4 py-2 rounded-md bg-rose-700 hover:bg-rose-600 text-white">Leave Group</button>
                        </div>
                      </div>
                    )}

                    {/* Match History */}
                    {selectedGroup && (
                      <div className="mt-8">
                        <h4 className="font-semibold">Match History</h4>
                        {matchHistory.length === 0 ? (
                          <p className="text-slate-400 mt-2">No matches yet</p>
                        ) : (
                          <ul className="mt-2 space-y-2">
                            {matchHistory.map((m) => (
                              <li key={m.id} className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 text-slate-200">
                                <div className="text-sm text-slate-400">{new Date(m.created_at).toLocaleString()}</div>
                                {m.kind === 'ffa' ? (
                                  <div className="mt-1">
                                    <div className="text-sm">FFA{m.is_tie ? ' (tie in placements)' : ''}</div>
                                    <div className="text-slate-300 text-sm mt-1">
                                      {m.participants
                                        .slice()
                                        .sort((a, b) => (a.place ?? 999) - (b.place ?? 999))
                                        .map((p) => `${p.place || '-'}: ${p.user.username}`)
                                        .join('  |  ')}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="mt-1">
                                    <div className="text-sm">{m.is_tie ? 'Tie' : 'Match'}</div>
                                    <div className="text-slate-300 text-sm mt-1">
                                      {/* Group participants by team */}
                                      {(() => {
                                        const a = m.participants.filter((p) => p.team === 1).map((p) => p.user.username).join(', ') || '—';
                                        const b = m.participants.filter((p) => p.team === 2).map((p) => p.user.username).join(', ') || '—';
                                        const sa = m.team_a_score != null ? m.team_a_score : '—';
                                        const sb = m.team_b_score != null ? m.team_b_score : '—';
                                        return `${a} ${sa} - ${sb} ${b}`;
                                      })()}
                                    </div>
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
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
