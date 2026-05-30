import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, GripVertical, BookOpen, Utensils, QrCode, CreditCard, Award, Monitor, ShieldAlert, Settings, Users, Star, ShoppingBag, Info, HelpCircle, Coffee, Pizza, Beer, Wine, IceCream, MapPin, Phone, Mail, FileText, Image, Layout, Globe, Tag, Ticket, Zap, Clock, Calendar, MessageSquare, Lightbulb, GraduationCap, Video, Book, Bookmark, Compass, LifeBuoy, Wrench, PlayCircle, FileQuestion } from 'lucide-react';
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  getAdminHelpContent,
  createHelpContent,
  updateHelpContent,
  deleteHelpContent,
  reorderHelpContent,
  type HelpContentItem,
} from '../../lib/api';

type Tab = 'landing' | 'dashboard';
type Locale = 'en' | 'bg' | 'ro';
type DashboardItemType = 'faq' | 'guide-step' | 'guide-tip' | 'guide-warning';

const LOCALES: { key: Locale; label: string }[] = [
  { key: 'en', label: 'EN' },
  { key: 'bg', label: 'BG' },
  { key: 'ro', label: 'RO' },
];

const ITEM_TYPE_META: { key: DashboardItemType; label: string; emoji: string }[] = [
  { key: 'faq', label: 'FAQ Item', emoji: '❓' },
  { key: 'guide-step', label: 'Guide Step', emoji: '📋' },
  { key: 'guide-tip', label: 'Tip', emoji: '💡' },
  { key: 'guide-warning', label: 'Warning', emoji: '⚠️' },
];

function groupBy<T>(items: T[], key: keyof T): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = String(item[key]);
    const group = map.get(k) || [];
    group.push(item);
    map.set(k, group);
  }
  return map;
}

/* ─── Locale tabs reusable component ─── */
function LocaleTabs({ active, onChange }: { active: Locale; onChange: (l: Locale) => void }) {
  return (
    <div className="flex gap-1">
      {LOCALES.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-colors ${
            active === key
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
              : 'bg-slate-800/40 text-slate-500 hover:text-slate-300 border border-transparent'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* ─── Item type badge (for dashboard expanded view) ─── */
function ItemTypeBadge({ itemKey }: { itemKey: string }) {
  let label = '';
  let cls = 'bg-slate-800 text-slate-500';
  if (itemKey === 'guide-title') { label = 'TITLE'; cls = 'bg-emerald-500/15 text-emerald-400'; }
  else if (itemKey === 'guide-desc') { label = 'DESC'; cls = 'bg-blue-500/15 text-blue-400'; }
  else if (itemKey.startsWith('guide-step-')) { label = `STEP ${parseInt(itemKey.replace('guide-step-', '')) + 1}`; cls = 'bg-indigo-500/15 text-indigo-400'; }
  else if (itemKey === 'guide-tip') { label = 'TIP'; cls = 'bg-amber-500/15 text-amber-400'; }
  else if (itemKey === 'guide-warning') { label = 'WARNING'; cls = 'bg-orange-500/15 text-orange-400'; }
  else if (itemKey.startsWith('faq-')) { label = 'FAQ'; cls = 'bg-purple-500/15 text-purple-400'; }
  else { label = itemKey; }
  return <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${cls}`}>{label}</span>;
}

/* ─── Sortable row wrapper (uses @dnd-kit like the menu editor) ─── */
function SortableRow({ id, children }: { id: string; children: (props: { dragHandleProps: any; isDragging: boolean }) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 50 : undefined,
    position: 'relative' as const,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {children({ dragHandleProps: { ref: setActivatorNodeRef, ...listeners }, isDragging })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Simple Edit Dialog — used for Landing FAQ and editing
   individual existing items
   ══════════════════════════════════════════════════════════ */
interface EditDialogProps {
  item: HelpContentItem | null;
  defaultSection: Tab;
  defaultCategoryKey?: string;
  onClose: () => void;
}

function EditDialog({ item, defaultSection, defaultCategoryKey, onClose }: EditDialogProps) {
  const queryClient = useQueryClient();
  const isCreate = item === null;
  const [locale, setLocale] = useState<Locale>('en');

  const existingLocales = isCreate
    ? ({} as Record<Locale, { title: string; body: string }>)
    : (Object.fromEntries(
        (queryClient.getQueryData<HelpContentItem[]>(['admin-help-content', item!.section]) || [])
          .filter((i) => i.categoryKey === item!.categoryKey && i.itemKey === item!.itemKey)
          .map((i) => [i.locale, { title: i.title, body: i.body }]),
      ) as Record<Locale, { title: string; body: string }>);

  const [forms, setForms] = useState<Record<Locale, { title: string; body: string }>>({
    en: existingLocales.en || { title: '', body: '' },
    bg: existingLocales.bg || { title: '', body: '' },
    ro: existingLocales.ro || { title: '', body: '' },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const section = item?.section || defaultSection;
      const categoryKey = item?.categoryKey || defaultCategoryKey || 'general';
      const baseKey = item?.itemKey || `faq-${Date.now()}`;
      for (const loc of LOCALES) {
        const f = forms[loc.key];
        if (f.title || f.body) {
          await createHelpContent({
            section,
            categoryKey,
            itemKey: baseKey,
            locale: loc.key,
            title: f.title || '',
            body: f.body || '',
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-help-content'] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!item) return;
      const sameKeyItems = (queryClient.getQueryData<HelpContentItem[]>(['admin-help-content', item.section]) || [])
        .filter((i) => i.categoryKey === item.categoryKey && i.itemKey === item.itemKey);
      for (const loc of LOCALES) {
        const f = forms[loc.key];
        const existing = sameKeyItems.find((i) => i.locale === loc.key);
        if (existing) {
          await updateHelpContent(existing.id, { title: f.title, body: f.body });
        } else if (f.title || f.body) {
          await createHelpContent({
            section: item.section,
            categoryKey: item.categoryKey,
            itemKey: item.itemKey,
            locale: loc.key,
            title: f.title || '',
            body: f.body || '',
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-help-content'] });
      onClose();
    },
  });

  const handleSave = () => {
    if (isCreate) createMutation.mutate();
    else updateMutation.mutate();
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#020617] border border-slate-800 rounded-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h3 className="font-bold text-sm text-white">
            {isCreate ? 'Create FAQ Item' : 'Edit Help Item'}
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">✕</button>
        </div>

        <div className="px-5 py-3 border-b border-slate-800">
          <LocaleTabs active={locale} onChange={setLocale} />
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Title</label>
            <input
              value={forms[locale].title}
              onChange={(e) => setForms((prev) => ({ ...prev, [locale]: { ...prev[locale], title: e.target.value } }))}
              className="w-full bg-[#0d1117] border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
              placeholder="Question or section title"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Body</label>
            <textarea
              value={forms[locale].body}
              onChange={(e) => setForms((prev) => ({ ...prev, [locale]: { ...prev[locale], body: e.target.value } }))}
              rows={4}
              className="w-full bg-[#0d1117] border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50 resize-none"
              placeholder="Answer or help content"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-800">
          <button onClick={onClose} className="px-4 py-2 rounded-md text-xs font-semibold text-slate-400 hover:text-white transition-colors">Cancel</button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-md text-xs font-bold text-white transition-colors"
          >
            {isLoading ? 'Saving...' : 'Save All Languages'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Dashboard Category Dialog
   ══════════════════════════════════════════════════════════ */
interface DashboardCategoryDialogProps {
  onClose: () => void;
}

function DashboardCategoryDialog({ onClose }: DashboardCategoryDialogProps) {
  const queryClient = useQueryClient();
  const [locale, setLocale] = useState<Locale>('en');
  const [categoryId, setCategoryId] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('BookOpen');

  const AVAILABLE_ICONS = [
    { name: 'BookOpen', icon: BookOpen },
    { name: 'Utensils', icon: Utensils },
    { name: 'Coffee', icon: Coffee },
    { name: 'Pizza', icon: Pizza },
    { name: 'Beer', icon: Beer },
    { name: 'Wine', icon: Wine },
    { name: 'IceCream', icon: IceCream },
    { name: 'QrCode', icon: QrCode },
    { name: 'CreditCard', icon: CreditCard },
    { name: 'Award', icon: Award },
    { name: 'Tag', icon: Tag },
    { name: 'Ticket', icon: Ticket },
    { name: 'Monitor', icon: Monitor },
    { name: 'Layout', icon: Layout },
    { name: 'Settings', icon: Settings },
    { name: 'Users', icon: Users },
    { name: 'Star', icon: Star },
    { name: 'ShoppingBag', icon: ShoppingBag },
    { name: 'Clock', icon: Clock },
    { name: 'Calendar', icon: Calendar },
    { name: 'MapPin', icon: MapPin },
    { name: 'Phone', icon: Phone },
    { name: 'Mail', icon: Mail },
    { name: 'MessageSquare', icon: MessageSquare },
    { name: 'Globe', icon: Globe },
    { name: 'FileText', icon: FileText },
    { name: 'Image', icon: Image },
    { name: 'ShieldAlert', icon: ShieldAlert },
    { name: 'Zap', icon: Zap },
    { name: 'Info', icon: Info },
    { name: 'HelpCircle', icon: HelpCircle },
    { name: 'FileQuestion', icon: FileQuestion },
    { name: 'Lightbulb', icon: Lightbulb },
    { name: 'GraduationCap', icon: GraduationCap },
    { name: 'Video', icon: Video },
    { name: 'Book', icon: Book },
    { name: 'Bookmark', icon: Bookmark },
    { name: 'Compass', icon: Compass },
    { name: 'LifeBuoy', icon: LifeBuoy },
    { name: 'Wrench', icon: Wrench },
    { name: 'PlayCircle', icon: PlayCircle },
  ];

  type GuideForm = { tabName: string; title: string; desc: string; steps: string[]; tip: string; warning: string };

  const [forms, setForms] = useState<Record<Locale, GuideForm>>({
    en: { tabName: '', title: '', desc: '', steps: [''], tip: '', warning: '' },
    bg: { tabName: '', title: '', desc: '', steps: [''], tip: '', warning: '' },
    ro: { tabName: '', title: '', desc: '', steps: [''], tip: '', warning: '' },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      for (const loc of LOCALES) {
        const f = forms[loc.key];
        if (!f.title) continue;
        await createHelpContent({ section: 'dashboard', categoryKey: categoryId, itemKey: 'category-meta', locale: loc.key, title: selectedIcon, body: f.tabName });
        await createHelpContent({ section: 'dashboard', categoryKey: categoryId, itemKey: 'guide-title', locale: loc.key, title: f.title, body: '' });
        if (f.desc) {
          await createHelpContent({ section: 'dashboard', categoryKey: categoryId, itemKey: 'guide-desc', locale: loc.key, title: '', body: f.desc });
        }
        for (let i = 0; i < f.steps.length; i++) {
          if (f.steps[i].trim()) {
            await createHelpContent({ section: 'dashboard', categoryKey: categoryId, itemKey: `guide-step-${i}`, locale: loc.key, title: '', body: f.steps[i] });
          }
        }
        if (f.tip) {
          await createHelpContent({ section: 'dashboard', categoryKey: categoryId, itemKey: 'guide-tip', locale: loc.key, title: '', body: f.tip });
        }
        if (f.warning) {
          await createHelpContent({ section: 'dashboard', categoryKey: categoryId, itemKey: 'guide-warning', locale: loc.key, title: '', body: f.warning });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-help-content'] });
      onClose();
    },
  });

  const updateStep = (index: number, value: string) => {
    setForms((prev) => ({
      ...prev,
      [locale]: { ...prev[locale], steps: prev[locale].steps.map((s, i) => (i === index ? value : s)) },
    }));
  };
  const addStep = () => {
    setForms((prev) => ({
      ...prev,
      [locale]: { ...prev[locale], steps: [...prev[locale].steps, ''] },
    }));
  };
  const removeStep = (index: number) => {
    setForms((prev) => ({
      ...prev,
      [locale]: { ...prev[locale], steps: prev[locale].steps.filter((_, i) => i !== index) },
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#020617] border border-slate-800 rounded-xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h3 className="font-bold text-sm text-white">Create Dashboard Category</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">✕</button>
        </div>

        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
          <LocaleTabs active={locale} onChange={setLocale} />
          <span className="text-[10px] text-slate-600">Fill content per language</span>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Category ID</label>
            <input
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
              className="w-full bg-[#0d1117] border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
              placeholder="e.g. integrations"
            />
            <p className="text-[10px] text-slate-600 mt-1">Lowercase, hyphens only. This becomes the category key.</p>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Category Icon</label>
            <div className="flex gap-2 flex-wrap">
              {AVAILABLE_ICONS.map(({ name, icon: Icon }) => (
                <button
                  key={name}
                  onClick={() => setSelectedIcon(name)}
                  className={`p-2 rounded-lg transition-colors border ${
                    selectedIcon === name 
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' 
                      : 'bg-[#0d1117] border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500'
                  }`}
                  title={name}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Tab Name (Sidebar)</label>
              <input
                value={forms[locale].tabName}
                onChange={(e) => setForms((prev) => ({ ...prev, [locale]: { ...prev[locale], tabName: e.target.value } }))}
                className="w-full bg-[#0d1117] border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                placeholder="e.g. Privacy & GDPR"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1.5">📖 Guide Title</label>
              <input
                value={forms[locale].title}
                onChange={(e) => setForms((prev) => ({ ...prev, [locale]: { ...prev[locale], title: e.target.value } }))}
                className="w-full bg-[#0d1117] border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                placeholder="e.g. GDPR Compliance"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Description</label>
            <textarea
              value={forms[locale].desc}
              onChange={(e) => setForms((prev) => ({ ...prev, [locale]: { ...prev[locale], desc: e.target.value } }))}
              rows={2}
              className="w-full bg-[#0d1117] border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50 resize-none"
              placeholder="Brief description of this help category"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">📋 Step-by-step Guide</label>
            </div>
            <div className="space-y-2">
              {forms[locale].steps.map((step, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span className="text-[10px] text-slate-600 mt-2.5 w-4 shrink-0 text-right">{i + 1}.</span>
                  <textarea
                    value={step}
                    onChange={(e) => updateStep(i, e.target.value)}
                    rows={2}
                    className="flex-1 bg-[#0d1117] border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50 resize-none"
                    placeholder={`Step ${i + 1} instructions...`}
                  />
                  {forms[locale].steps.length > 1 && (
                    <button onClick={() => removeStep(i)} className="text-slate-600 hover:text-red-400 transition-colors mt-2">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex justify-end pt-1">
                <button 
                  onClick={addStep} 
                  className="bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 px-3 py-1.5 rounded-md text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors font-semibold flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Step
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1.5">
              💡 Tip <span className="text-slate-600 normal-case font-normal">(optional — renders as green callout)</span>
            </label>
            <textarea
              value={forms[locale].tip}
              onChange={(e) => setForms((prev) => ({ ...prev, [locale]: { ...prev[locale], tip: e.target.value } }))}
              rows={2}
              className="w-full bg-[#0d1117] border border-amber-900/30 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 resize-none"
              placeholder="Helpful tip for users..."
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-orange-400 uppercase tracking-wider mb-1.5">
              ⚠️ Warning <span className="text-slate-600 normal-case font-normal">(optional — renders as orange callout)</span>
            </label>
            <textarea
              value={forms[locale].warning}
              onChange={(e) => setForms((prev) => ({ ...prev, [locale]: { ...prev[locale], warning: e.target.value } }))}
              rows={2}
              className="w-full bg-[#0d1117] border border-orange-900/30 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-orange-500/50 resize-none"
              placeholder="Important warning for users..."
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-800">
          <button onClick={onClose} className="px-4 py-2 rounded-md text-xs font-semibold text-slate-400 hover:text-white transition-colors">Cancel</button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!categoryId || !forms.en.title || createMutation.isPending}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-md text-xs font-bold text-white transition-colors"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Category'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Dashboard Item Dialog
   ══════════════════════════════════════════════════════════ */
interface DashboardItemDialogProps {
  categoryKey: string;
  existingItems: HelpContentItem[];
  onClose: () => void;
}

function DashboardItemDialog({ categoryKey, existingItems, onClose }: DashboardItemDialogProps) {
  const queryClient = useQueryClient();
  const [locale, setLocale] = useState<Locale>('en');
  const [itemType, setItemType] = useState<DashboardItemType>('faq');

  const [forms, setForms] = useState<Record<Locale, { title: string; body: string }>>({
    en: { title: '', body: '' },
    bg: { title: '', body: '' },
    ro: { title: '', body: '' },
  });

  const hasTip = existingItems.some((i) => i.itemKey === 'guide-tip');
  const hasWarning = existingItems.some((i) => i.itemKey === 'guide-warning');

  const getItemKey = (): string => {
    switch (itemType) {
      case 'faq':
        return `faq-${Date.now()}`;
      case 'guide-step': {
        const existingSteps = existingItems.filter((i) => i.itemKey.startsWith('guide-step-'));
        const maxStep = existingSteps.reduce((max, i) => {
          const num = parseInt(i.itemKey.replace('guide-step-', ''));
          return isNaN(num) ? max : Math.max(max, num);
        }, -1);
        return `guide-step-${maxStep + 1}`;
      }
      case 'guide-tip':
        return 'guide-tip';
      case 'guide-warning':
        return 'guide-warning';
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const itemKey = getItemKey();
      for (const loc of LOCALES) {
        const f = forms[loc.key];
        if (f.title || f.body) {
          await createHelpContent({
            section: 'dashboard',
            categoryKey,
            itemKey,
            locale: loc.key,
            title: f.title || '',
            body: f.body || '',
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-help-content'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#020617] border border-slate-800 rounded-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h3 className="font-bold text-sm text-white">
            Add Item to <span className="text-emerald-400">"{categoryKey}"</span>
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">✕</button>
        </div>

        <div className="px-5 py-3 border-b border-slate-800">
          <LocaleTabs active={locale} onChange={setLocale} />
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Item Type</label>
            <div className="flex gap-1.5 flex-wrap">
              {ITEM_TYPE_META.map(({ key, label, emoji }) => {
                const disabled = (key === 'guide-tip' && hasTip) || (key === 'guide-warning' && hasWarning);
                return (
                  <button
                    key={key}
                    onClick={() => !disabled && setItemType(key)}
                    disabled={disabled}
                    className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-colors border ${
                      itemType === key
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                        : disabled
                          ? 'bg-slate-800/20 text-slate-700 border-transparent cursor-not-allowed'
                          : 'bg-slate-800/40 text-slate-500 hover:text-slate-300 border-transparent'
                    }`}
                  >
                    {emoji} {label} {disabled && '(exists)'}
                  </button>
                );
              })}
            </div>
          </div>

          {itemType === 'faq' && (
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Question</label>
              <input
                value={forms[locale].title}
                onChange={(e) => setForms((prev) => ({ ...prev, [locale]: { ...prev[locale], title: e.target.value } }))}
                className="w-full bg-[#0d1117] border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                placeholder="FAQ question..."
              />
            </div>
          )}

          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              {itemType === 'faq' ? 'Answer' : itemType === 'guide-step' ? 'Step Instructions' : itemType === 'guide-tip' ? 'Tip Content' : 'Warning Content'}
            </label>
            <textarea
              value={forms[locale].body}
              onChange={(e) => setForms((prev) => ({ ...prev, [locale]: { ...prev[locale], body: e.target.value } }))}
              rows={4}
              className={`w-full bg-[#0d1117] border rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none resize-none ${
                itemType === 'guide-tip'
                  ? 'border-amber-900/30 focus:border-amber-500/50'
                  : itemType === 'guide-warning'
                    ? 'border-orange-900/30 focus:border-orange-500/50'
                    : 'border-slate-700 focus:border-emerald-500/50'
              }`}
              placeholder={
                itemType === 'faq'
                  ? 'Answer to the question...'
                  : itemType === 'guide-step'
                    ? 'What the user should do in this step...'
                    : itemType === 'guide-tip'
                      ? 'Helpful tip (renders as green callout)...'
                      : 'Important warning (renders as orange callout)...'
              }
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-800">
          <button onClick={onClose} className="px-4 py-2 rounded-md text-xs font-semibold text-slate-400 hover:text-white transition-colors">Cancel</button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || (!forms[locale].title && !forms[locale].body)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-md text-xs font-bold text-white transition-colors"
          >
            {createMutation.isPending ? 'Adding...' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Main Page
   ══════════════════════════════════════════════════════════ */
export default function HelpCenterPage() {
  const [tab, setTab] = useState<Tab>('landing');
  const [editItem, setEditItem] = useState<HelpContentItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Dashboard-specific dialog state
  const [dashCategoryOpen, setDashCategoryOpen] = useState(false);
  const [dashAddItemCategory, setDashAddItemCategory] = useState<string | null>(null);
  const [editCategorySettings, setEditCategorySettings] = useState<{ categoryKey: string; metaItems: HelpContentItem[]; titleItems: HelpContentItem[] } | null>(null);

  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['admin-help-content', tab],
    queryFn: () => getAdminHelpContent(tab),
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await deleteHelpContent(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-help-content'] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ ids, active }: { ids: string[]; active: boolean }) => {
      for (const id of ids) {
        await updateHelpContent(id, { active });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-help-content'] });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (payload: { id: string; sortOrder: number }[]) => {
      return reorderHelpContent(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-help-content'] });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-help-content'] });
    },
  });

  const landingItems = tab === 'landing' ? groupBy(items, 'itemKey') : new Map<string, HelpContentItem[]>();
  const dashboardCategories = tab === 'dashboard' ? groupBy(items, 'categoryKey') : new Map<string, HelpContentItem[]>();

  // ─── Sorted entries for drag-and-drop ───
  const sortedLandingEntries = Array.from(landingItems.entries())
    .sort(([, a], [, b]) => (a[0]?.sortOrder ?? 0) - (b[0]?.sortOrder ?? 0));

  const sortedDashboardEntries = Array.from(dashboardCategories.entries())
    .sort(([, a], [, b]) => (a[0]?.sortOrder ?? 0) - (b[0]?.sortOrder ?? 0));

  // ─── Reorder handlers ───
  const handleLandingReorder = useCallback(
    (reordered: [string, HelpContentItem[]][]) => {
      const payload: { id: string; sortOrder: number }[] = [];
      reordered.forEach(([, localeItems], idx) => {
        for (const item of localeItems) {
          if (item.sortOrder !== idx) {
            payload.push({ id: item.id, sortOrder: idx });
          }
        }
      });
      if (payload.length === 0) return;
      // Optimistic update in cache
      queryClient.setQueryData<HelpContentItem[]>(['admin-help-content', 'landing'], (old) => {
        if (!old) return old;
        const orderMap = new Map(payload.map((p) => [p.id, p.sortOrder]));
        return old.map((item) => {
          const newOrder = orderMap.get(item.id);
          return newOrder !== undefined ? { ...item, sortOrder: newOrder } : item;
        });
      });
      reorderMutation.mutate(payload);
    },
    [queryClient, reorderMutation],
  );

  const handleDashboardReorder = useCallback(
    (reordered: [string, HelpContentItem[]][]) => {
      const payload: { id: string; sortOrder: number }[] = [];
      reordered.forEach(([, catItems], idx) => {
        for (const item of catItems) {
          if (item.sortOrder !== idx) {
            payload.push({ id: item.id, sortOrder: idx });
          }
        }
      });
      if (payload.length === 0) return;
      queryClient.setQueryData<HelpContentItem[]>(['admin-help-content', 'dashboard'], (old) => {
        if (!old) return old;
        const orderMap = new Map(payload.map((p) => [p.id, p.sortOrder]));
        return old.map((item) => {
          const newOrder = orderMap.get(item.id);
          return newOrder !== undefined ? { ...item, sortOrder: newOrder } : item;
        });
      });
      reorderMutation.mutate(payload);
    },
    [queryClient, reorderMutation],
  );

  // IDs for SortableContext — use the first item's itemKey (landing) or categoryKey (dashboard)
  const landingSortIds = sortedLandingEntries.map(([key]) => key);
  const dashSortIds = sortedDashboardEntries.map(([key]) => key);

  const handleLandingDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = sortedLandingEntries.findIndex(([k]) => k === active.id);
    const newIdx = sortedLandingEntries.findIndex(([k]) => k === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    handleLandingReorder(arrayMove(sortedLandingEntries, oldIdx, newIdx));
  }, [sortedLandingEntries, handleLandingReorder]);

  const handleDashDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = sortedDashboardEntries.findIndex(([k]) => k === active.id);
    const newIdx = sortedDashboardEntries.findIndex(([k]) => k === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    handleDashboardReorder(arrayMove(sortedDashboardEntries, oldIdx, newIdx));
  }, [sortedDashboardEntries, handleDashboardReorder]);

  const handleDelete = (itemKey: string, ids: string[]) => {
    if (confirm(`Delete "${itemKey}" and all its translations?`)) {
      deleteMutation.mutate(ids);
    }
  };

  const handleDeleteCategory = (categoryKey: string) => {
    const catItems = dashboardCategories.get(categoryKey) || [];
    const ids = catItems.map((i) => i.id);
    if (confirm(`Delete category "${categoryKey}" and all ${catItems.length} items?`)) {
      deleteMutation.mutate(ids);
    }
  };

  const toggleCategory = (key: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const closeAllDialogs = () => {
    setEditItem(null);
    setCreateOpen(false);
    setDashCategoryOpen(false);
    setDashAddItemCategory(null);
    setEditCategorySettings(null);
  };

  return (
    <div>
      <div className="mb-2">
        <h1 className="text-xl font-bold text-white">Help Center</h1>
        <p className="text-xs text-slate-500 mt-1">
          Manage all help and FAQ content across the platform — no redeployment needed.
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-6">
        {([
          { key: 'landing' as Tab, label: 'Landing FAQ' },
          { key: 'dashboard' as Tab, label: 'Dashboard Help' },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors border ${
              tab === key
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                : 'bg-slate-800/40 text-slate-400 hover:text-slate-200 border-transparent'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-slate-500 text-sm py-12 text-center">Loading...</div>
      ) : (
        <>
          {/* ─── Landing FAQ tab ─── */}
          {tab === 'landing' && (
            <div className="bg-[#020617] border border-slate-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-sm font-semibold text-white">FAQ Items</h2>
                <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
                  {landingItems.size} items
                </span>
                <span className="text-[10px] text-slate-600 ml-1">⠿ Drag to reorder</span>
                <button
                  onClick={() => setCreateOpen(true)}
                  className="ml-auto px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-md text-[11px] font-bold text-white transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Item
                </button>
              </div>

              <DndContext collisionDetection={closestCenter} onDragEnd={handleLandingDragEnd}>
                <SortableContext items={landingSortIds} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1">
                    {sortedLandingEntries.map(([itemKey, localeItems]) => {
                      const enItem = localeItems.find((i) => i.locale === 'en');
                      const ids = localeItems.map((i) => i.id);
                      const isActive = localeItems.some((i) => i.active);
                      const localesPresent = localeItems.map((i) => i.locale.toUpperCase());

                      return (
                        <SortableRow key={itemKey} id={itemKey}>
                          {({ dragHandleProps }) => (
                            <div className="bg-[#0d1117] border border-slate-800/60 rounded-lg p-3 flex items-center justify-between group">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span
                                  {...dragHandleProps}
                                  className="cursor-grab active:cursor-grabbing text-slate-700 hover:text-slate-400 transition-colors shrink-0"
                                >
                                  <GripVertical className="w-3.5 h-3.5" />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-medium text-slate-200 truncate">
                                      {enItem?.title || itemKey}
                                    </span>
                                    <div className="flex gap-1">
                                      {localesPresent.map((loc) => (
                                        <span
                                          key={loc}
                                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                            loc === 'EN'
                                              ? 'bg-emerald-500/15 text-emerald-400'
                                              : 'bg-slate-800 text-slate-500'
                                          }`}
                                        >
                                          {loc}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                  {enItem?.body && (
                                    <p className="text-[11px] text-slate-500 truncate">{enItem.body}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 ml-4 shrink-0">
                                <button
                                  onClick={() => toggleMutation.mutate({ ids, active: !isActive })}
                                  className={`w-8 h-4 rounded-full transition-colors relative ${
                                    isActive ? 'bg-emerald-600' : 'bg-slate-700'
                                  }`}
                                >
                                  <div
                                    className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${
                                      isActive ? 'left-[18px]' : 'left-[2px]'
                                    }`}
                                  />
                                </button>
                                <button
                                  onClick={() => setEditItem(enItem || localeItems[0])}
                                  className="text-slate-500 hover:text-slate-300 transition-colors"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDelete(itemKey, ids)}
                                  className="text-slate-500 hover:text-red-400 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )}
                        </SortableRow>
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}

          {/* ─── Dashboard Help tab ─── */}
          {tab === 'dashboard' && (
            <div className="bg-[#020617] border border-slate-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-sm font-semibold text-white">Dashboard Help Categories</h2>
                <span className="text-[10px] text-slate-600 ml-1">⠿ Drag to reorder</span>
                <button
                  onClick={() => setDashCategoryOpen(true)}
                  className="ml-auto px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-md text-[11px] font-bold text-white transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Category
                </button>
              </div>

              <DndContext collisionDetection={closestCenter} onDragEnd={handleDashDragEnd}>
                <SortableContext items={dashSortIds} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1.5">
                    {sortedDashboardEntries.map(([categoryKey, catItems]) => {
                      const isExpanded = expandedCategories.has(categoryKey);
                      const groupedItems = groupBy(catItems, 'itemKey');

                      const sortedEntries = Array.from(groupedItems.entries()).sort(([a], [b]) => {
                        const order = (k: string) => {
                          if (k === 'guide-title') return 0;
                          if (k === 'guide-desc') return 1;
                          if (k.startsWith('guide-step-')) return 2 + parseInt(k.replace('guide-step-', '') || '0');
                          if (k === 'guide-tip') return 100;
                          if (k === 'guide-warning') return 101;
                          if (k.startsWith('faq-')) return 200;
                          return 300;
                        };
                        return order(a) - order(b);
                      });

                      return (
                        <SortableRow key={categoryKey} id={categoryKey}>
                          {({ dragHandleProps }) => (
                            <div className="bg-[#0d1117] border border-slate-800/60 rounded-lg overflow-hidden">
                              <div className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-800/30 transition-colors">
                                <span
                                  {...dragHandleProps}
                                  className="cursor-grab active:cursor-grabbing text-slate-700 hover:text-slate-400 transition-colors shrink-0"
                                >
                                  <GripVertical className="w-3.5 h-3.5" />
                                </span>
                                <button
                                  onClick={() => toggleCategory(categoryKey)}
                                  className="flex items-center gap-2 flex-1 min-w-0"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                                  ) : (
                                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                                  )}
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-semibold text-slate-200">
                                      {groupedItems.get('category-meta')?.find(i => i.locale === 'en')?.body || 
                                       groupedItems.get('guide-title')?.find(i => i.locale === 'en')?.title || 
                                       categoryKey}
                                    </span>
                                    <span className="text-[10px] text-slate-500 font-mono">({categoryKey})</span>
                                  </div>
                                  <span className="text-[10px] text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded">
                                    {groupedItems.size} items
                                  </span>
                                </button>
                                <div className="flex gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    onClick={() => setEditCategorySettings({ 
                                      categoryKey, 
                                      metaItems: groupedItems.get('category-meta') || [],
                                      titleItems: groupedItems.get('guide-title') || []
                                    })}
                                    className="text-slate-500 hover:text-emerald-400 transition-colors p-0.5"
                                    title="Category Settings"
                                  >
                                    <Settings className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteCategory(categoryKey)}
                                    className="text-slate-500 hover:text-red-400 transition-colors p-0.5"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>

                              {isExpanded && (
                                <div className="border-t border-slate-800/40">
                                  {sortedEntries.map(([itemKey, localeItems]) => {
                                    const enItem = localeItems.find((i) => i.locale === 'en');
                                    const ids = localeItems.map((i) => i.id);

                                    return (
                                      <div
                                        key={itemKey}
                                        className="flex items-center justify-between px-4 py-2 hover:bg-slate-800/20 transition-colors border-b border-slate-800/20 last:border-b-0"
                                      >
                                        <div className="flex items-center gap-2 pl-5 min-w-0">
                                          <ItemTypeBadge itemKey={itemKey} />
                                          <span className="text-[11px] text-slate-300 truncate">
                                            {enItem?.title || enItem?.body?.slice(0, 60) || itemKey}
                                          </span>
                                        </div>
                                        <div className="flex gap-1.5 shrink-0">
                                          <button
                                            onClick={() => { if (enItem) setEditItem(enItem); }}
                                            className="text-slate-500 hover:text-slate-300 transition-colors p-0.5"
                                          >
                                            <Pencil className="w-3 h-3" />
                                          </button>
                                          <button
                                            onClick={() => handleDelete(itemKey, ids)}
                                            className="text-slate-500 hover:text-red-400 transition-colors p-0.5"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                  <button
                                    onClick={() => setDashAddItemCategory(categoryKey)}
                                    className="w-full text-left px-4 py-2 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
                                  >
                                    + Add help item
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </SortableRow>
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}
        </>
      )}

      {/* ─── Dialogs ─── */}

      {(editItem || createOpen) && (
        <EditDialog
          item={editItem}
          defaultSection={tab}
          defaultCategoryKey="general"
          onClose={closeAllDialogs}
        />
      )}

      {dashCategoryOpen && (
        <DashboardCategoryDialog onClose={closeAllDialogs} />
      )}

      {dashAddItemCategory && (
        <DashboardItemDialog
          categoryKey={dashAddItemCategory}
          existingItems={dashboardCategories.get(dashAddItemCategory) || []}
          onClose={closeAllDialogs}
        />
      )}

      {editCategorySettings && (
        <DashboardCategorySettingsDialog
          categoryKey={editCategorySettings.categoryKey}
          metaItems={editCategorySettings.metaItems}
          titleItems={editCategorySettings.titleItems}
          onClose={closeAllDialogs}
        />
      )}
    </div>
  );
}

function DashboardCategorySettingsDialog({ 
  categoryKey, 
  metaItems, 
  titleItems,
  onClose 
}: { 
  categoryKey: string, 
  metaItems: HelpContentItem[], 
  titleItems: HelpContentItem[],
  onClose: () => void 
}) {
  const queryClient = useQueryClient();
  const currentIcon = metaItems.find(i => i.locale === 'en')?.title || 'BookOpen';
  const currentTabName = metaItems.find(i => i.locale === 'en')?.body || '';
  const currentGuideTitle = titleItems.find(i => i.locale === 'en')?.title || '';
  
  const [selectedIcon, setSelectedIcon] = useState(currentIcon);
  const [tabName, setTabName] = useState(currentTabName);
  const [guideTitle, setGuideTitle] = useState(currentGuideTitle);
  const [errorMsg, setErrorMsg] = useState('');

  const AVAILABLE_ICONS = [
    { name: 'BookOpen', icon: BookOpen },
    { name: 'Utensils', icon: Utensils },
    { name: 'Coffee', icon: Coffee },
    { name: 'Pizza', icon: Pizza },
    { name: 'Beer', icon: Beer },
    { name: 'Wine', icon: Wine },
    { name: 'IceCream', icon: IceCream },
    { name: 'QrCode', icon: QrCode },
    { name: 'CreditCard', icon: CreditCard },
    { name: 'Award', icon: Award },
    { name: 'Tag', icon: Tag },
    { name: 'Ticket', icon: Ticket },
    { name: 'Monitor', icon: Monitor },
    { name: 'Layout', icon: Layout },
    { name: 'Settings', icon: Settings },
    { name: 'Users', icon: Users },
    { name: 'Star', icon: Star },
    { name: 'ShoppingBag', icon: ShoppingBag },
    { name: 'Clock', icon: Clock },
    { name: 'Calendar', icon: Calendar },
    { name: 'MapPin', icon: MapPin },
    { name: 'Phone', icon: Phone },
    { name: 'Mail', icon: Mail },
    { name: 'MessageSquare', icon: MessageSquare },
    { name: 'Globe', icon: Globe },
    { name: 'FileText', icon: FileText },
    { name: 'Image', icon: Image },
    { name: 'ShieldAlert', icon: ShieldAlert },
    { name: 'Zap', icon: Zap },
    { name: 'Info', icon: Info },
    { name: 'HelpCircle', icon: HelpCircle },
    { name: 'FileQuestion', icon: FileQuestion },
    { name: 'Lightbulb', icon: Lightbulb },
    { name: 'GraduationCap', icon: GraduationCap },
    { name: 'Video', icon: Video },
    { name: 'Book', icon: Book },
    { name: 'Bookmark', icon: Bookmark },
    { name: 'Compass', icon: Compass },
    { name: 'LifeBuoy', icon: LifeBuoy },
    { name: 'Wrench', icon: Wrench },
    { name: 'PlayCircle', icon: PlayCircle },
  ];

  const updateMutation = useMutation({
    mutationFn: async () => {
      // Update Icon and Tab Name
      for (const loc of [{ key: 'en' }, { key: 'bg' }, { key: 'ro' }]) {
        const existingMeta = metaItems.find(m => m.locale === loc.key);
        if (existingMeta) {
          await updateHelpContent(existingMeta.id, { title: selectedIcon, body: tabName });
        } else {
          await createHelpContent({
            section: 'dashboard',
            categoryKey,
            itemKey: 'category-meta',
            locale: loc.key,
            title: selectedIcon,
            body: tabName
          });
        }

        // Update Guide Title
        if (guideTitle.trim()) {
          const existingTitle = titleItems.find(m => m.locale === loc.key);
          if (existingTitle) {
            await updateHelpContent(existingTitle.id, { title: guideTitle });
          } else {
            await createHelpContent({
              section: 'dashboard',
              categoryKey,
              itemKey: 'guide-title',
              locale: loc.key,
              title: guideTitle,
              body: ''
            });
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-help-content'] });
      onClose();
    },
    onError: () => {
      setErrorMsg('Failed to save settings. Please try again.');
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#020617] border border-slate-800 rounded-xl w-full max-w-2xl mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-sm text-white">Settings for <span className="text-emerald-400">"{categoryKey}"</span></h3>
            {errorMsg && <span className="text-xs text-red-400 bg-red-400/10 px-2 py-1 rounded font-semibold">{errorMsg}</span>}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Tab Name (Sidebar)</label>
              <input
                value={tabName}
                onChange={(e) => setTabName(e.target.value)}
                className="w-full bg-[#0d1117] border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                placeholder="e.g. Privacy & GDPR"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Guide Title (H1)</label>
              <input
                value={guideTitle}
                onChange={(e) => setGuideTitle(e.target.value)}
                className="w-full bg-[#0d1117] border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
                placeholder="e.g. GDPR Compliance"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Category Icon</label>
            <div className="flex gap-2 flex-wrap max-h-[40vh] overflow-y-auto pr-2">
              {AVAILABLE_ICONS.map(({ name, icon: Icon }) => (
                <button
                  key={name}
                  onClick={() => setSelectedIcon(name)}
                  className={`p-3 rounded-lg transition-colors border ${
                    selectedIcon === name 
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' 
                      : 'bg-[#0d1117] border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500'
                  }`}
                  title={name}
                >
                  <Icon className="w-6 h-6" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-800">
          <button onClick={onClose} className="px-4 py-2 rounded-md text-xs font-semibold text-slate-400 hover:text-white transition-colors">Cancel</button>
          <button
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending || (selectedIcon === currentIcon && tabName === currentTabName && guideTitle === currentGuideTitle)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-md text-xs font-bold text-white transition-colors"
          >
            {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
