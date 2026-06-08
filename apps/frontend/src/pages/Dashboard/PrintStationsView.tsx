import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Wifi, WifiOff, AlertTriangle, Copy, Check } from 'lucide-react';
import { useToast } from '../../components/ui/toast';
import {
  getPrintStations,
  getPrintStationHealth,
  createPrintStation,
  deletePrintStation,
  generateAgentToken,
  revokeAgentToken,
} from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';

interface StationHealth {
  id: string;
  name: string;
  isActive: boolean;
  pending: number;
  failed: number;
  lastPrinted: string | null;
  lastSeen: string | null;
}

interface AgentToken {
  id: string;
  label: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

interface PrintStation {
  id: string;
  name: string;
  printerIp: string;
  printerPort: number;
  isActive: boolean;
  agentTokens: AgentToken[];
}

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function HealthBadge({ health }: { health: StationHealth | undefined }) {
  if (!health) return null;

  const agentOnline = health.lastSeen
    ? Date.now() - new Date(health.lastSeen).getTime() < 60_000
    : false;

  const base = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium';

  if (!agentOnline) {
    return (
      <span className={`${base} border-amber-400 text-amber-600`}>
        <WifiOff className="w-3 h-3" />
        Offline{health.pending > 0 ? ` · ${health.pending} pending` : ''}
      </span>
    );
  }
  if (health.failed > 0) {
    return (
      <span className={`${base} border-red-400 text-red-600`}>
        <AlertTriangle className="w-3 h-3" /> {health.failed} failed
      </span>
    );
  }
  if (health.pending > 0) {
    return (
      <span className={`${base} border-amber-400 text-amber-600`}>
        <Wifi className="w-3 h-3" /> {health.pending} pending
      </span>
    );
  }
  return (
    <span className={`${base} border-green-400 text-green-600`}>
      <Wifi className="w-3 h-3" /> Online
    </span>
  );
}

export default function PrintStationsView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { showToast, ToastComponent } = useToast();
  const [newName, setNewName] = useState('');
  const [newIp, setNewIp] = useState('');
  const [newPort, setNewPort] = useState('9100');
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: stations = [], isLoading } = useQuery<PrintStation[]>({
    queryKey: ['print-stations'],
    queryFn: getPrintStations,
  });

  const { data: health = [] } = useQuery<StationHealth[]>({
    queryKey: ['print-stations-health'],
    queryFn: getPrintStationHealth,
    refetchInterval: 15_000,
  });

  const healthMap = Object.fromEntries(health.map((h) => [h.id, h]));

  const createMutation = useMutation({
    mutationFn: () =>
      createPrintStation({ name: newName, printerIp: newIp, printerPort: parseInt(newPort, 10) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['print-stations'] });
      setNewName('');
      setNewIp('');
      setNewPort('9100');
    },
    onError: () => showToast('Failed to create station', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePrintStation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['print-stations'] }),
    onError: () => showToast('Failed to delete station', 'error'),
  });

  const generateTokenMutation = useMutation({
    mutationFn: (stationId: string) => generateAgentToken(stationId),
    onSuccess: (data: { token: string }) => {
      qc.invalidateQueries({ queryKey: ['print-stations'] });
      setGeneratedToken(data.token);
      setCopied(false);
    },
    onError: () => showToast('Failed to generate token', 'error'),
  });

  function copyToken() {
    if (!generatedToken) return;
    navigator.clipboard.writeText(generatedToken).catch(() => undefined);
    const el = document.createElement('textarea');
    el.value = generatedToken;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    setCopied(true);
  }

  const revokeTokenMutation = useMutation({
    mutationFn: (tokenId: string) => revokeAgentToken(tokenId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['print-stations'] }),
    onError: () => showToast('Failed to revoke token', 'error'),
  });

  if (isLoading) return <div className="p-6 text-sm">Loading...</div>;

  return (
    <div className="space-y-6">
      {ToastComponent}

      {generatedToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border rounded-lg shadow-xl p-6 w-full max-w-md mx-4 space-y-4">
            <h3 className="text-lg font-semibold">Agent Token</h3>
            <p className="text-sm text-muted-foreground">
              Copy this token now — it won't be shown again. Paste it into the printer agent app.
            </p>
            <div className="flex items-center gap-2 rounded border bg-muted px-3 py-2">
              <code className="flex-1 text-xs break-all select-all">{generatedToken}</code>
              <button
                onClick={copyToken}
                className="shrink-0 p-1 rounded hover:bg-accent"
                title="Copy"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setGeneratedToken(null)}>Done</Button>
            </div>
          </div>
        </div>
      )}
      <div>
        <h2 className="text-xl font-semibold">{t('printStations.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('printStations.description')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('printStations.addStation')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              placeholder={t('printStations.namePlaceholder')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Input
              placeholder={t('printStations.ipPlaceholder')}
              value={newIp}
              onChange={(e) => setNewIp(e.target.value)}
            />
            <Input
              placeholder="9100"
              value={newPort}
              onChange={(e) => setNewPort(e.target.value)}
              type="number"
            />
          </div>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!newName || !newIp || createMutation.isPending}
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('printStations.addStation')}
          </Button>
        </CardContent>
      </Card>

      {stations.length === 0 && (
        <p className="text-muted-foreground text-sm">{t('printStations.noStations')}</p>
      )}

      {stations.map((station) => (
        <Card key={station.id}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-3">
              <CardTitle className="text-base">{station.name}</CardTitle>
              <HealthBadge health={healthMap[station.id]} />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                {station.printerIp}:{station.printerPort}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteMutation.mutate(station.id)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => generateTokenMutation.mutate(station.id)}
              disabled={generateTokenMutation.isPending}
            >
              <Plus className="w-3 h-3 mr-1" />
              {t('printStations.generateToken')}
            </Button>

            {station.agentTokens.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t('printStations.agentTokens')}
                </p>
                {station.agentTokens.map((tok) => (
                  <div
                    key={tok.id}
                    className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                  >
                    <div>
                      <span className="font-medium">{tok.label ?? 'Agent'}</span>
                      <span className="ml-3 text-muted-foreground text-xs">
                        {tok.lastSeenAt
                          ? timeAgo(tok.lastSeenAt)
                          : t('printStations.neverConnected')}
                      </span>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => revokeTokenMutation.mutate(tok.id)}
                      disabled={revokeTokenMutation.isPending}
                    >
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
