import React, { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import RestaurantContext from '../../context/RestaurantContext';
import { AlertCircle, AlertTriangle, Info, CheckCircle2, ChevronRight, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AuditIssue {
  type: 'error' | 'warning' | 'info';
  message: string;
  categoryId: string;
  itemId?: string;
  field: string;
}

export const MenuCheckWidget = () => {
  const { activeRestaurant } = useContext(RestaurantContext) as any;
  const [issues, setIssues] = useState<AuditIssue[]>([]);
  const [loading, setLoading] = useState(true);
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

  return (
    <div className="glass-panel p-6 sm:p-8 rounded-[2.5rem] border-white/5 flex flex-col h-full shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
        <CheckCircle2 className="w-48 h-48" />
      </div>

      <div className="flex justify-between items-start mb-6 relative z-10">
        <div>
          <h3 className="text-xl font-serif font-black text-foreground tracking-tight">{t('menuCheck.title')}</h3>
          <p className="text-sm text-muted-foreground mt-1">{t('menuCheck.subtitle')}</p>
        </div>
        <button
            onClick={fetchAudit}
            className="text-xs font-bold uppercase tracking-widest text-accent hover:text-accent/80 transition-colors"
        >
          {t('menuCheck.rescan')}
        </button>
      </div>

      {issues.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-green-500/5 rounded-[2rem] border border-green-500/10">
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4 text-green-500">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h4 className="text-lg font-bold text-green-600 dark:text-green-400 mb-1">{t('menuCheck.perfectScore')}</h4>
          <p className="text-sm text-green-700/70 dark:text-green-300/70">{t('menuCheck.perfectScoreDesc')}</p>
        </div>
      ) : (
        <div className="space-y-6 relative z-10">
          <div className="flex gap-4 mb-4">
            {errors.length > 0 && (
              <div className="flex items-center gap-2 bg-red-500/10 text-red-600 dark:text-red-400 px-3 py-1.5 rounded-full text-xs font-bold">
                <AlertCircle className="w-4 h-4" />
                {t('menuCheck.critical', { count: errors.length })}
              </div>
            )}
            {warnings.length > 0 && (
              <div className="flex items-center gap-2 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 px-3 py-1.5 rounded-full text-xs font-bold">
                <AlertTriangle className="w-4 h-4" />
                {t('menuCheck.warnings', { count: warnings.length })}
              </div>
            )}
            {infos.length > 0 && (
              <div className="flex items-center gap-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded-full text-xs font-bold">
                <Info className="w-4 h-4" />
                {t('menuCheck.suggestions', { count: infos.length })}
              </div>
            )}
          </div>

          <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
            {issues.map((issue, idx) => (
              <div 
                key={idx} 
                className={`flex items-start justify-between gap-4 p-4 rounded-2xl border ${
                  issue.type === 'error' ? 'bg-red-500/5 border-red-500/10' :
                  issue.type === 'warning' ? 'bg-yellow-500/5 border-yellow-500/10' :
                  'bg-blue-500/5 border-blue-500/10'
                }`}
              >
                <div className="flex items-start gap-3 flex-1">
                  <div className="mt-0.5">
                    {issue.type === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
                    {issue.type === 'warning' && <AlertTriangle className="w-5 h-5 text-yellow-500" />}
                    {issue.type === 'info' && <Info className="w-5 h-5 text-blue-500" />}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${
                      issue.type === 'error' ? 'text-red-700 dark:text-red-400' :
                      issue.type === 'warning' ? 'text-yellow-700 dark:text-yellow-400' :
                      'text-blue-700 dark:text-blue-400'
                    }`}>
                      {issue.message}
                    </p>
                    <p className="text-xs opacity-60 mt-1 capitalize">
                      {issue.itemId ? t('menuCheck.itemIssue') : t('menuCheck.categoryIssue')} &middot; {t('menuCheck.fieldLabel', { field: issue.field })}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => handleFixIssue(issue.categoryId, issue.itemId)}
                  className={`flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl transition-colors shrink-0 ${
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
