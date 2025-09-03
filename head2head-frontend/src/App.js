import { useState } from 'react';

function App() {
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [status, setStatus] = useState(null);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
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

  return (
    <div style={{ maxWidth: 420, margin: '48px auto', padding: 16 }}>
      <h1>Create Account</h1>
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

      {status && (
        <p style={{ marginTop: 12, color: status.type === 'error' ? 'crimson' : status.type === 'success' ? 'green' : 'inherit' }}>
          {status.message}
        </p>
      )}
    </div>
  );
}

export default App;
