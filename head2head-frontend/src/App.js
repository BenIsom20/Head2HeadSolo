import { useState } from 'react';

function App() {
  const [msg, setMsg] = useState('');

  const handleClick = async () => {
    try {
      const res = await fetch('/api/hello');
      const data = await res.json();
      setMsg(data.message);
    } catch (err) {
      console.error(err);
      setMsg('Error fetching hello');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center">
      <button
        onClick={handleClick}
        className="px-4 py-2 bg-blue-600 text-white rounded"
      >
        Say Hello
      </button>
      {msg && <p className="mt-4 text-xl">{msg}</p>}
    </div>
  );
}

export default App;