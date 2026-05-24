import { useState } from 'react';
import { Table2, CheckCircle } from 'lucide-react';
import { bulkCreateTables } from '../../../lib/api';

interface Props {
  restaurantId: string;
  onNext: () => void;
  onSkip: () => void;
}

export default function TableSetupStep({ restaurantId, onNext, onSkip }: Props) {
  const [count, setCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (count < 1 || count > 50) return;
    setLoading(true);
    setError('');
    try {
      await bulkCreateTables(restaurantId, count);
      setCreated(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create tables. You can add them later in Settings.');
    } finally {
      setLoading(false);
    }
  };

  if (created) {
    return (
      <div className="space-y-6 max-w-md">
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <CheckCircle className="w-16 h-16 text-emerald-500" />
          <div>
            <h2 className="text-2xl font-display font-bold text-foreground">{count} tables created</h2>
            <p className="text-sm text-muted-foreground mt-1">Named Table 1 through Table {count}. Rename them anytime in Settings.</p>
          </div>
          <button
            onClick={onNext}
            className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-md">
      <div>
        <h2 className="text-2xl font-display font-bold text-foreground">Set up your tables</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Tables are used for table ordering, QR codes, and live status tracking. You can add, rename, or delete them at any time.
        </p>
      </div>

      <div className="glass-panel rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Table2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Auto-create tables</p>
            <p className="text-xs text-muted-foreground">Creates Table 1, Table 2, … Table N</p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">Number of tables</label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCount((c) => Math.max(1, c - 1))}
              className="w-9 h-9 rounded-xl border border-border bg-card hover:bg-muted text-foreground font-bold text-lg flex items-center justify-center transition-all"
            >
              −
            </button>
            <input
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(e) => setCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
              className="w-20 text-center px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              onClick={() => setCount((c) => Math.min(50, c + 1))}
              className="w-9 h-9 rounded-xl border border-border bg-card hover:bg-muted text-foreground font-bold text-lg flex items-center justify-center transition-all"
            >
              +
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all disabled:opacity-50"
        >
          {loading ? 'Creating tables…' : `Create ${count} table${count !== 1 ? 's' : ''}`}
        </button>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onSkip}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
