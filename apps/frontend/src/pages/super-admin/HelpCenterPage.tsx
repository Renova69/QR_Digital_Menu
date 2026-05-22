import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import {
  getAdminHelpContent,
  createHelpContent,
  updateHelpContent,
  deleteHelpContent,
  type HelpContentItem,
} from '../../lib/api';

type Tab = 'landing' | 'dashboard';
type Locale = 'en' | 'bg' | 'ro';

const LOCALES: { key: Locale; label: string }[] = [
  { key: 'en', label: 'EN' },
  { key: 'bg', label: 'BG' },
  { key: 'ro', label: 'RO' },
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
      const baseKey = item?.itemKey || `item-${Date.now()}`;
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
    if (isCreate) {
      createMutation.mutate();
    } else {
      updateMutation.mutate();
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#020617] border border-slate-800 rounded-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h3 className="font-bold text-sm text-white">
            {isCreate ? 'Create Help Item' : 'Edit Help Item'}
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            ✕
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-800">
          <LocaleTabs active={locale} onChange={setLocale} />
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Title
            </label>
            <input
              value={forms[locale].title}
              onChange={(e) => setForms((prev) => ({ ...prev, [locale]: { ...prev[locale], title: e.target.value } }))}
              className="w-full bg-[#0d1117] border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
              placeholder="Question or section title"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Body
            </label>
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
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-md text-xs font-bold text-white transition-colors"
          >
            {isLoading ? 'Saving...' : `Save (${locale.toUpperCase()})`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HelpCenterPage() {
  const [tab, setTab] = useState<Tab>('landing');
  const [editItem, setEditItem] = useState<HelpContentItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createCategory, setCreateCategory] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
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
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      updateHelpContent(id, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-help-content'] });
    },
  });

  const landingItems = tab === 'landing' ? groupBy(items, 'itemKey') : new Map<string, HelpContentItem[]>();
  const dashboardCategories = tab === 'dashboard' ? groupBy(items, 'categoryKey') : new Map<string, HelpContentItem[]>();

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
          {/* Landing FAQ tab */}
          {tab === 'landing' && (
            <div className="bg-[#020617] border border-slate-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-sm font-semibold text-white">FAQ Items</h2>
                <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
                  {landingItems.size} items
                </span>
                <button
                  onClick={() => {
                    setCreateCategory('general');
                    setCreateOpen(true);
                  }}
                  className="ml-auto px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-md text-[11px] font-bold text-white transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Item
                </button>
              </div>

              <div className="space-y-2">
                {Array.from(landingItems.entries())
                  .sort(([, a], [, b]) => (a[0]?.sortOrder ?? 0) - (b[0]?.sortOrder ?? 0))
                  .map(([itemKey, localeItems]) => {
                    const enItem = localeItems.find((i) => i.locale === 'en');
                    const ids = localeItems.map((i) => i.id);
                    const isActive = localeItems.some((i) => i.active);
                    const localesPresent = localeItems.map((i) => i.locale.toUpperCase());

                    return (
                      <div
                        key={itemKey}
                        className="bg-[#0d1117] border border-slate-800/60 rounded-lg p-3 flex items-center justify-between group"
                      >
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
                        <div className="flex items-center gap-2 ml-4 shrink-0">
                          <button
                            onClick={() => toggleMutation.mutate({ id: ids[0], active: !isActive })}
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
                    );
                  })}
              </div>
            </div>
          )}

          {/* Dashboard Help tab */}
          {tab === 'dashboard' && (
            <div className="bg-[#020617] border border-slate-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-sm font-semibold text-white">Dashboard Help Categories</h2>
                <button
                  onClick={() => {
                    setCreateCategory('');
                    setCreateOpen(true);
                  }}
                  className="ml-auto px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-md text-[11px] font-bold text-white transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Category
                </button>
              </div>

              <div className="space-y-1.5">
                {Array.from(dashboardCategories.entries()).map(([categoryKey, catItems]) => {
                  const isExpanded = expandedCategories.has(categoryKey);
                  const groupedItems = groupBy(catItems, 'itemKey');

                  return (
                    <div key={categoryKey} className="bg-[#0d1117] border border-slate-800/60 rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleCategory(categoryKey)}
                        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-slate-800/30 transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                        )}
                        <span className="text-xs font-semibold text-slate-200">{categoryKey}</span>
                        <span className="text-[10px] text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded">
                          {groupedItems.size} items
                        </span>
                        <div className="ml-auto flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              const enItem = catItems.find((i) => i.locale === 'en');
                              if (enItem) setEditItem(enItem);
                            }}
                            className="text-slate-500 hover:text-slate-300 transition-colors p-0.5"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(categoryKey)}
                            className="text-slate-500 hover:text-red-400 transition-colors p-0.5"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-slate-800/40">
                          {Array.from(groupedItems.entries()).map(([itemKey, localeItems]) => {
                            const enItem = localeItems.find((i) => i.locale === 'en');
                            const ids = localeItems.map((i) => i.id);

                            return (
                              <div
                                key={itemKey}
                                className="flex items-center justify-between px-4 py-2 hover:bg-slate-800/20 transition-colors border-b border-slate-800/20 last:border-b-0"
                              >
                                <span className="text-[11px] text-slate-300 pl-5">
                                  {enItem?.title || itemKey}
                                </span>
                                <div className="flex gap-1.5">
                                  <button
                                    onClick={() => {
                                      if (enItem) setEditItem(enItem);
                                    }}
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
                            onClick={() => {
                              setCreateCategory(categoryKey);
                              setCreateOpen(true);
                            }}
                            className="w-full text-left px-4 py-2 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
                          >
                            + Add help item
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Edit/Create dialog */}
      {(editItem || createOpen) && (
        <EditDialog
          item={editItem}
          defaultSection={tab}
          defaultCategoryKey={createCategory}
          onClose={() => {
            setEditItem(null);
            setCreateOpen(false);
            setCreateCategory('');
          }}
        />
      )}
    </div>
  );
}
