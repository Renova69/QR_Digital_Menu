import { useState, useEffect } from 'react';
import { useAssistance } from '../../context/AssistanceContext';
import { Button } from '../../components/ui/button';
import { useTranslation } from 'react-i18next';

const AssistanceView = () => {
  const { requests, markAsResolved, markAsUnresolved } = useAssistance();
  const { t } = useTranslation();

  // Filter requests into active and resolved
  const activeRequests = requests.filter(request => !request.isResolved);
  const resolvedRequests = requests.filter(request => request.isResolved);

  // Handle marking a request as resolved
  const handleResolve = async (requestId: string) => {
    try {
      await markAsResolved(requestId);
    } catch (error) {
      // Error handling - could show a toast notification
      console.error('Failed to resolve request:', error);
    }
  };

  // Handle marking a request as unresolved (re-opening)
  const handleReopen = async (requestId: string) => {
    try {
      await markAsUnresolved(requestId);
    } catch (error) {
      console.error('Failed to reopen request:', error);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
      <div className="flex flex-col sm:flex-row justify-between items-end mb-12 gap-6">
        <div>
          <h2 className="text-4xl font-display font-black text-foreground tracking-tighter mb-2">{t('assistance.title')}</h2>
          <div className="flex items-center gap-3">
              <div className="flex items-center gap-2.5 bg-destructive/10 px-4 py-2 rounded-xl border border-destructive/10 shadow-lg shadow-destructive/5 animate-pulse">
                  <span className="text-sm font-black text-destructive">{activeRequests.length}</span>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-destructive/70">{t('assistance.active')}</span>
              </div>
              <div className="flex items-center gap-2.5 bg-secondary/80 px-4 py-2 rounded-xl border border-border/40">
                  <span className="text-sm font-black text-foreground">{resolvedRequests.length}</span>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">{t('assistance.resolved')}</span>
              </div>
          </div>
        </div>
      </div>

      {activeRequests.length === 0 ? (
        <div className="text-center text-muted-foreground py-32 glass-panel rounded-[3rem] border-white/5 shadow-inner">
          <p className="font-display font-black text-3xl mb-3 italic opacity-20">{t('assistance.noActive')}</p>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-30">All guests are currently assisted</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {activeRequests.map(request => (
            <div key={request.id} className="glass-panel p-8 rounded-[2.5rem] border-destructive/20 flex flex-col sm:flex-row justify-between items-center gap-8 hover:shadow-[0_20px_50px_-15px_hsla(var(--color-destructive),0.2)] transition-all duration-700 group animate-in zoom-in-95">
              <div className="text-center sm:text-left">
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground opacity-40 mb-1">{t('orders.table', { id: '' })}</p>
                <p className="text-5xl font-display font-black text-foreground tracking-tighter uppercase leading-none">{request.tableId}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-60 mt-3 italic">{new Date(request.createdAt).toLocaleTimeString()}</p>
              </div>
              <div className="flex flex-col gap-3 w-full sm:w-auto">
                <button 
                    onClick={() => handleResolve(request.id)} 
                    className="bg-foreground text-background font-black uppercase tracking-[0.2em] text-[11px] py-4 px-8 rounded-2xl shadow-xl hover:shadow-[0_15px_30px_-5px_var(--color-primary)] hover:-translate-y-1 transition-all active:scale-95"
                >
                  {t('assistance.markResolved')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {resolvedRequests.length > 0 && (
        <div className="mt-20">
          <div className="flex items-center gap-4 mb-8">
            <h3 className="text-xl font-black uppercase tracking-[0.2em] text-muted-foreground/40">{t('assistance.resolvedRequests')}</h3>
            <div className="h-px flex-1 bg-border/40"></div>
          </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4">
              {resolvedRequests
                .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                .slice(0, 5)
                .map(request => (
                  <div key={request.id} className="glass-panel p-6 rounded-2xl border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4 opacity-50 hover:opacity-100 transition-all duration-500">
                    <div className="flex items-center gap-6">
                      <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center font-black text-lg">{request.tableId}</div>
                      <div>
                        <p className="font-display font-black text-foreground uppercase tracking-tight">{t('assistance.resolvedAt', { time: new Date(request.updatedAt).toLocaleTimeString() })}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                        <button 
                            onClick={() => handleReopen(request.id)} 
                            className="text-[10px] font-black uppercase tracking-[0.2em] text-primary hover:text-primary/80 transition-colors"
                        >
                          {t('assistance.reopen')}
                        </button>
                    </div>
                  </div>
                ))}
              </div>
              {resolvedRequests.length > 5 && (
                <div className="mt-8 text-center">
                    <button className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground hover:text-foreground transition-all">
                      {t('assistance.showMore', { count: resolvedRequests.length - 5 })}
                    </button>
                </div>
              )}
        </div>
      )}
    </div>
  );
};

export default AssistanceView;
