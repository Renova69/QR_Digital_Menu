import React, { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import RestaurantContext from '../../context/RestaurantContext';
import { AlertCircle, AlertTriangle, Info, CheckCircle2, ChevronRight, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AuditIssue {
  type: 'error' | 'warning' | 'info';
  code?: string;
  args?: Record<string, any>;
  message: string;
  categoryId: string;
  itemId?: string;
  field: string;
}

export const MenuCheckWidget = () => {
  const { activeRestaurant } = useContext(RestaurantContext) as any;
  const [issues, setIssues] = useState<AuditIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    if (activeRestaurant) {
      fetchAudit();
    }
  }, [activeRestaurant]);

  const fetchAudit = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/menu/audit/${activeRestaurant.id}`);
      setIssues(res.data);
    } catch (err) {
      console.error('Failed to fetch menu audit:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFixIssue = (categoryId: string, itemId?: string) => {
    // Navigate to Menu Editor
    // Pass state or hash so editor can open the correct category/item
    navigate('/dashboard/menu', { state: { targetCategoryId: categoryId, targetItemId: itemId } });
  };

  if (loading) {
    return (
      <div className="glass-panel p-6 rounded-3xl animate-pulse">
        <div className="h-6 w-32 bg-white/10 rounded mb-4"></div>
        <div className="h-12 bg-white/5 rounded-xl"></div>
      </div>
    );
  }

  const errors = issues.filter(i => i.type === 'error');
  const warnings = issues.filter(i => i.type === 'warning');
  const infos = issues.filter(i => i.type === 'info');

  const filteredIssues = filter === 'all' ? issues : issues.filter(i => i.type === filter);

  return (
    <div className="glass-panel p-4 sm:p-5 rounded-2xl border-white/5 flex flex-col shadow-lg relative overflow-hidden">
      <div className="flex justify-between items-start mb-6 relative z-10">
        <div>
          <h3 className="text-xl font-display font-black text-foreground tracking-tight">{t('menuCheck.title')}</h3>
          <p className="text-sm text-muted-foreground mt-1">{t('menuCheck.subtitle')}</p>
        </div>
        <button
            onClick={fetchAudit}
            className="flex-shrink-0 px-3 py-2 rounded-xl bg-secondary border border-border text-foreground hover:bg-secondary/80 text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
        >
          {t('menuCheck.rescan')}
        </button>
      </div>

      {issues.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-4 bg-green-500/5 rounded-xl border border-green-500/10">
          <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mb-3 text-green-500">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h4 className="text-base font-bold text-green-600 dark:text-green-400 mb-1">{t('menuCheck.perfectScore')}</h4>
          <p className="text-xs text-green-700/70 dark:text-green-300/70">{t('menuCheck.perfectScoreDesc')}</p>
        </div>
      ) : (
        <div className="space-y-6 relative z-10">
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              onClick={() => setFilter('all')}
              className={`flex items-center justify-center gap-1.5 w-full h-full min-h-[36px] px-2 py-1.5 rounded-xl text-xs font-bold transition-all text-center ${
                filter === 'all'
                  ? 'bg-foreground text-background'
                  : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
              }`}
            >
              {t('menuCheck.all', 'All')}
            </button>
            {errors.length > 0 && (
              <button
                onClick={() => setFilter('error')}
                className={`flex items-center justify-center gap-1.5 w-full h-full min-h-[36px] px-2 py-1.5 rounded-xl text-xs font-bold transition-all text-center ${
                  filter === 'error'
                    ? 'bg-red-500 text-white shadow-md shadow-red-500/20'
                    : 'bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{t('menuCheck.critical', { count: errors.length })}</span>
              </button>
            )}
            {warnings.length > 0 && (
              <button
                onClick={() => setFilter('warning')}
                className={`flex items-center justify-center gap-1.5 w-full h-full min-h-[36px] px-2 py-1.5 rounded-xl text-xs font-bold transition-all text-center ${
                  filter === 'warning'
                    ? 'bg-yellow-500 text-white shadow-md shadow-yellow-500/20'
                    : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/20'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{t('menuCheck.warnings', { count: warnings.length })}</span>
              </button>
            )}
            {infos.length > 0 && (
              <button
                onClick={() => setFilter('info')}
                className={`flex items-center justify-center gap-1.5 w-full h-full min-h-[36px] px-2 py-1.5 rounded-xl text-xs font-bold transition-all text-center ${
                  filter === 'info'
                    ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20'
                    : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20'
                }`}
              >
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{t('menuCheck.suggestions', { count: infos.length })}</span>
              </button>
            )}
          </div>

          <div className="space-y-3 max-h-[250px] overflow-y-auto custom-scrollbar pr-2">
            {filteredIssues.map((issue, idx) => (
              <div 
                key={idx} 
                className={`flex items-start justify-between gap-3 p-3 rounded-xl border ${
                  issue.type === 'error' ? 'bg-red-500/5 border-red-500/10' :
                  issue.type === 'warning' ? 'bg-yellow-500/5 border-yellow-500/10' :
                  'bg-blue-500/5 border-blue-500/10'
                }`}
              >
                <div className="flex items-start gap-2 flex-1">
                  <div className="mt-0.5">
                    {issue.type === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                    {issue.type === 'warning' && <AlertTriangle className="w-4 h-4 text-yellow-500" />}
                    {issue.type === 'info' && <Info className="w-4 h-4 text-blue-500" />}
                  </div>
                  <div>
                    <p className={`text-xs font-semibold ${
                      issue.type === 'error' ? 'text-red-700 dark:text-red-400' :
                      issue.type === 'warning' ? 'text-yellow-700 dark:text-yellow-400' :
                      'text-blue-700 dark:text-blue-400'
                    }`}>
                      {issue.code ? t(`menuCheck.issues.${issue.code}`, { ...issue.args, defaultValue: issue.message }) : issue.message}
                    </p>
                    <p className="text-[10px] opacity-60 mt-0.5 capitalize">
                      {issue.itemId ? t('menuCheck.itemIssue') : t('menuCheck.categoryIssue')} {t('auto.Middot', '&middot;')}{t('menuCheck.fieldLabel', { field: issue.field })}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => handleFixIssue(issue.categoryId, issue.itemId)}
                  className={`flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-lg transition-colors shrink-0 ${
                    issue.type === 'error' ? 'bg-red-500/10 text-red-600 hover:bg-red-500/20' :
                    issue.type === 'warning' ? 'bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20' :
                    'bg-blue-500/10 text-blue-600 hover:bg-blue-500/20'
                  }`}
                >
                  {t('menuCheck.fix')}
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
