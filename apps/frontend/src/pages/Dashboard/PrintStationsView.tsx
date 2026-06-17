import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Wifi, WifiOff, AlertTriangle, Settings } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useToast } from '../../components/ui/toast';
import {
  getPrintStations,
  getPrintStationHealth,
  createPrintStation,
  updatePrintStation,
  deletePrintStation,
  generateAgentToken,
  revokeAgentToken,
} from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';

// ── Types ──────────────────────────────────────────────────────────────

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

interface ReceiptTemplate {
  showTable?: boolean;
  showOrderId?: boolean;
  showStaff?: boolean;
  showSessionOpened?: boolean;
  showOrderTime?: boolean;
  showPrintedAt?: boolean;
  showPrices?: boolean;
  showCustomerName?: boolean;
  showSource?: boolean;
  headerText?: string;
  footerText?: string;
  [key: string]: unknown;
}

interface PrintStation {
  id: string;
  name: string;
  printerIp: string;
  printerPort: number;
  isActive: boolean;
  receiptTemplate?: ReceiptTemplate | null;
  agentTokens: AgentToken[];
}

// ── Helpers ────────────────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
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
    ? Date.now() - new Date(health.lastSeen).getTime() < 300_000
    : false;
  const base = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium';
  if (!agentOnline) {
    return (
      <span className={`${base} border-amber-400 text-amber-600`}>
        <WifiOff className="w-3 h-3" /> Offline{health.pending > 0 ? ` · ${health.pending} pending` : ''}
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

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-muted-foreground/30'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
          }`}
        />
      </button>
    </label>
  );
}

// ── Component ──────────────────────────────────────────────────────────

export default function PrintStationsView() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { showToast, ToastComponent } = useToast();
  const [newName, setNewName] = useState('');
  const [newIp, setNewIp] = useState('');
  const [newPort, setNewPort] = useState('9100');
  const [tokenModal, setTokenModal] = useState<{ token: string; station: PrintStation } | null>(null);
  const [templateModal, setTemplateModal] = useState<PrintStation | null>(null);
  const [draftTemplate, setDraftTemplate] = useState<ReceiptTemplate>({});

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
      setNewName(''); setNewIp(''); setNewPort('9100');
    },
    onError: () => showToast('Failed to create station', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePrintStation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['print-stations'] }),
    onError: () => showToast('Failed to delete station', 'error'),
  });

  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, template }: { id: string; template: ReceiptTemplate }) =>
      updatePrintStation(id, { receiptTemplate: template }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['print-stations'] });
      setTemplateModal(null);
    },
    onError: () => showToast('Failed to save template', 'error'),
  });

  const generateTokenMutation = useMutation({
    mutationFn: ({ stationId }: { stationId: string; station: PrintStation }) =>
      generateAgentToken(stationId),
    onSuccess: (data: { token: string }, { station }) => {
      qc.invalidateQueries({ queryKey: ['print-stations'] });
      setTokenModal({ token: data.token, station });
    },
    onError: () => showToast('Failed to generate token', 'error'),
  });

  const revokeTokenMutation = useMutation({
    mutationFn: (tokenId: string) => revokeAgentToken(tokenId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['print-stations'] }),
    onError: () => showToast('Failed to revoke token', 'error'),
  });

  if (isLoading) return <div className="p-6 text-sm">Loading...</div>;

  return (
    <div className="space-y-6">
      {ToastComponent}

      {/* ── Token setup modal ──────────────────────────────────────── */}
      {tokenModal && (() => {
        const serverUrl = `${window.location.protocol}//${window.location.hostname}:3000`;
        const params = new URLSearchParams({
          serverUrl, token: tokenModal.token,
          printerIp: tokenModal.station.printerIp,
          printerPort: String(tokenModal.station.printerPort),
          stationName: tokenModal.station.name,
        });
        const qrPayload = `printagent://setup?${params.toString()}`;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-background border rounded-lg shadow-xl p-6 w-full max-w-sm mx-4 space-y-4">
              <h3 className="text-lg font-semibold">{tokenModal.station.name} — Agent Setup</h3>
              <p className="text-sm text-muted-foreground">Scan from the printer agent app to auto-fill all fields.</p>
              <div className="flex justify-center p-4 bg-white rounded-lg">
                <QRCodeSVG value={qrPayload} size={220} />
              </div>
              <div className="rounded border bg-muted px-3 py-2 space-y-1">
                <p className="text-xs text-muted-foreground">Server: {serverUrl}</p>
                <p className="text-xs text-muted-foreground">Printer: {tokenModal.station.printerIp}:{tokenModal.station.printerPort}</p>
                <code className="text-xs break-all select-all block">{tokenModal.token}</code>
              </div>
              <div className="flex justify-end"><Button onClick={() => setTokenModal(null)}>Done</Button></div>
            </div>
          </div>
        );
      })()}

      {/* ── Receipt template modal ─────────────────────────────────── */}
      {templateModal && (() => {
        const tpl = draftTemplate;
        const set = (k: keyof ReceiptTemplate, v: unknown) => setDraftTemplate((p) => ({ ...p, [k]: v }));
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-background border rounded-lg shadow-xl p-6 w-full max-w-sm mx-4 space-y-4 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold">{templateModal.name} — {t('printStations.templateTitle')}</h3>
              <p className="text-xs text-muted-foreground">{t('printStations.templateDescription')}</p>

              <div className="space-y-1 divide-y divide-border">
                <div className="space-y-1 pb-2">
                  <Toggle label={t('printStations.showTable')} checked={tpl.showTable !== false} onChange={(v) => set('showTable', v)} />
                  <Toggle label={t('printStations.showOrderId')} checked={tpl.showOrderId !== false} onChange={(v) => set('showOrderId', v)} />
                  <Toggle label={t('printStations.showStaffName')} checked={tpl.showStaff !== false} onChange={(v) => set('showStaff', v)} />
                  <Toggle label={t('printStations.showSessionOpened')} checked={tpl.showSessionOpened === true} onChange={(v) => set('showSessionOpened', v)} />
                  <Toggle label={t('printStations.showOrderTime')} checked={tpl.showOrderTime === true} onChange={(v) => set('showOrderTime', v)} />
                  <Toggle label={t('printStations.showPrintedAt')} checked={tpl.showPrintedAt !== false} onChange={(v) => set('showPrintedAt', v)} />
                  <Toggle label={t('printStations.showPrices')} checked={tpl.showPrices === true} onChange={(v) => set('showPrices', v)} />
                  <Toggle label={t('printStations.showCustomerName')} checked={tpl.showCustomerName === true} onChange={(v) => set('showCustomerName', v)} />
                  <Toggle label={t('printStations.showSource')} checked={tpl.showSource === true} onChange={(v) => set('showSource', v)} />
                </div>

                <div className="space-y-2 pt-2">
                  <label className="block text-xs font-medium">{t('printStations.headerTextLabel')} <span className="text-muted-foreground">({t('printStations.headerTextHint')})</span></label>
                  <Input placeholder={templateModal.name} value={tpl.headerText ?? ''} onChange={(e) => set('headerText', e.target.value)} />

                  <label className="block text-xs font-medium">{t('printStations.footerTextLabel')} <span className="text-muted-foreground">({t('printStations.footerTextHint')})</span></label>
                  <Input placeholder="Thank you!" value={tpl.footerText ?? ''} onChange={(e) => set('footerText', e.target.value)} />
                </div>

                {/* Live preview */}
                <div className="pt-2">
                  <p className="text-xs font-medium mb-1">{t('printStations.templatePreview')}</p>
                  <pre className="text-[10px] leading-tight bg-muted rounded px-2 py-2 overflow-x-auto font-mono whitespace-pre">
{[
  (tpl.headerText || templateModal.name).toUpperCase(),
  tpl.showSource && '[POS]',
  tpl.showTable !== false && 'Table 5',
  tpl.showOrderId !== false && '#ABC123',
  [tpl.showStaff !== false && 'Server: Ivan', tpl.showCustomerName && 'Guest: Petar'].filter(Boolean).join('  ') || null,
  [tpl.showSessionOpened && 'Opened: 19:45', tpl.showOrderTime && 'Order: 20:12'].filter(Boolean).join('  ') || null,
  '---',
  tpl.showPrices ? '2x  Steak         24.50' : '2x  Steak',
  '   + Doneness: Medium Rare',
  '   >> No onions',
  '1x  Cola',
  '---',
  tpl.showPrintedAt !== false && '20:13',
  tpl.footerText || '',
].filter(Boolean).join('\n')}
                  </pre>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setTemplateModal(null)}>{t('auto.cancel')}</Button>
                <Button onClick={() => updateTemplateMutation.mutate({ id: templateModal.id, template: draftTemplate })}
                        disabled={updateTemplateMutation.isPending}>
                  {t('auto.save')}
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      <div>
        <h2 className="text-xl font-semibold">{t('printStations.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('printStations.description')}</p>
      </div>

      {/* ── Create form ────────────────────────────────────────────── */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t('printStations.addStation')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input placeholder={t('printStations.namePlaceholder')} value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Input placeholder={t('printStations.ipPlaceholder')} value={newIp} onChange={(e) => setNewIp(e.target.value)} />
            <Input placeholder="9100" value={newPort} onChange={(e) => setNewPort(e.target.value)} type="number" />
          </div>
          <Button
            onClick={() => {
              const port = parseInt(newPort, 10);
              if (!newPort || isNaN(port) || port < 1 || port > 65535) { showToast('Port must be 1-65535', 'error'); return; }
              createMutation.mutate();
            }}
            disabled={!newName || !newIp || createMutation.isPending}
          >
            <Plus className="w-4 h-4 mr-2" />{t('printStations.addStation')}
          </Button>
        </CardContent>
      </Card>

      {stations.length === 0 && <p className="text-muted-foreground text-sm">{t('printStations.noStations')}</p>}

      {/* ── Station list ───────────────────────────────────────────── */}
      {stations.map((station) => (
        <Card key={station.id}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-3">
              <CardTitle className="text-base">{station.name}</CardTitle>
              <HealthBadge health={healthMap[station.id]} />
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span>{station.printerIp}:{station.printerPort}</span>
              <Button variant="ghost" size="icon"
                onClick={() => { setDraftTemplate(station.receiptTemplate ?? {}); setTemplateModal(station); }}
                title="Receipt template"
              >
                <Settings className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon"
                onClick={() => { if (!window.confirm(`Delete "${station.name}"?`)) return; deleteMutation.mutate(station.id); }}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button size="sm" variant="outline"
              onClick={() => generateTokenMutation.mutate({ stationId: station.id, station })}
              disabled={generateTokenMutation.isPending}
            >
              <Plus className="w-3 h-3 mr-1" />{t('printStations.generateToken')}
            </Button>
            {station.agentTokens.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('printStations.agentTokens')}</p>
                {station.agentTokens.map((tok) => (
                  <div key={tok.id} className="flex items-center justify-between rounded border px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium">{tok.label ?? 'Agent'}</span>
                      <span className="ml-3 text-muted-foreground text-xs">
                        {tok.lastSeenAt ? timeAgo(tok.lastSeenAt) : t('printStations.neverConnected')}
                      </span>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => revokeTokenMutation.mutate(tok.id)} disabled={revokeTokenMutation.isPending}>
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
