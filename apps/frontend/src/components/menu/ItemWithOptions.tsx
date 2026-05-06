import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Item, MenuOption, OptionChoice } from '../../types';
import { useCart } from '../../context/CartContext';
import { useTranslation } from 'react-i18next';
import { ImageLightbox } from './ImageLightbox';

interface ItemWithOptionsProps {
  item: Item;
  perfectPairings?: Item[];
}

export const ItemWithOptions: React.FC<ItemWithOptionsProps> = ({ item, perfectPairings }) => {
    const { addItem } = useCart();
    const [selectedOptions, setSelectedOptions] = useState<Record<string, OptionChoice>>({});
    const [showIntercept, setShowIntercept] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [pendingMainItem, setPendingMainItem] = useState<{
        cartId: string;
        id: string;
        name: string;
        price: number;
        quantity: number;
        selectedOptions: Array<{
            optionId: string;
            optionName: string;
            choiceName: string;
            priceModifier: number;
        }>;
    } | null>(null);
    const { t, i18n } = useTranslation();

    const currentLang = i18n.language;
    const translations = item.translations as any;
    const itemName = (currentLang && translations && translations[currentLang]?.name) || item.name;
    const itemDesc = (currentLang && translations && translations[currentLang]?.description) || item.description;

    const showToast = (itemName: string) => {
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        setToastMessage(itemName);
        toastTimerRef.current = setTimeout(() => setToastMessage(null), 2200);
    };

    // Cleanup timer on unmount
    useEffect(() => {
        return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
    }, []);

    // Pre-select first VARIATION option
    useEffect(() => {
      if (!item.options?.length) return;
      setSelectedOptions((prev) => {
        const init: Record<string, any> = { ...prev };
        (item.options as any[]).forEach((opt: any) => {
          if (
            opt.type === 'VARIATION' &&
            opt.choices?.length > 0 &&
            !init[opt.id]
          ) {
            init[opt.id] = {
              optionId: opt.id,
              optionName: opt.name,
              choiceName: opt.choices[0].name,
              priceModifier: opt.choices[0].priceModifier ?? 0,
            };
          }
        });
        return init;
      });
    }, [item.id]);

    const preserveScrollPosition = () => {
        const y = window.scrollY;
        requestAnimationFrame(() => {
            window.scrollTo({ top: y });
        });
    };

    const getImageUrl = (url: string) => {
        if (url.startsWith('http')) return url;
        const apiUrl = (import.meta as any).env.VITE_API_URL || 'http://localhost:3000/api';
        const baseUrl = apiUrl.replace('/api', '');
        return `${baseUrl}/${url}`;
    };

    const handleOptionChange = (option: MenuOption, choice: OptionChoice) => {
        setSelectedOptions(prev => ({
            ...prev,
            [option.id]: choice,
        }));
    };

    const buildMainCartItem = () => {
        const optionsWithDetails = Object.entries(selectedOptions).map(([optionId, choice]) => {
            const option = item.options?.find(o => o.id === optionId);
            return {
                optionId: optionId,
                optionName: option?.name || 'Option',
                choiceName: choice.name,
                priceModifier: choice.priceModifier || 0,
            };
        });

        // Generate a unique ID for this specific combination of item + options
        const cartId = optionsWithDetails.length > 0 
           ? `${item.id}-${optionsWithDetails.map(o => `${o.optionId}:${o.choiceName}`).join('|')}`
           : item.id;

        return {
            cartId,
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: 1,
            selectedOptions: optionsWithDetails,
        };
    };

    const handleAddToCart = () => {
        const mainCartItem = buildMainCartItem();
        // If pairings exist, open pairing modal first so user can choose explicitly.
        if (perfectPairings && perfectPairings.length > 0) {
            setPendingMainItem(mainCartItem);
            setShowIntercept(true);
            preserveScrollPosition();
            return;
        }
        addItem(mainCartItem);
        showToast(item.name);
        preserveScrollPosition();
    };

    const handlePairingAction = (pairing?: Item) => {
        if (pendingMainItem) {
            addItem(pendingMainItem);
        }
        if (pairing) {
            addItem({
                id: pairing.id,
                name: pairing.name,
                price: pairing.price,
                quantity: 1,
                selectedOptions: [],
                cartId: `${pairing.id}-${Date.now()}`
            });
            showToast(`${pendingMainItem?.name || item.name} + ${pairing.name}`);
        } else {
            showToast(pendingMainItem?.name || item.name);
        }
        setPendingMainItem(null);
        setShowIntercept(false);
        preserveScrollPosition();
    };

    return (
        <>
            <div
                className="glass-panel glass-panel-hover p-4 md:p-6 rounded-[2.5rem] flex flex-col justify-between shadow-2xl relative overflow-hidden group border-white/5 animate-in slide-in-from-bottom-4 duration-500 h-full"
                style={{ backgroundColor: 'var(--theme-card, inherit)' }}
            >
                {item.imageUrl && (
                    <div
                        className="overflow-hidden rounded-2xl mb-4 md:mb-6 h-48 md:h-auto md:aspect-square cursor-zoom-in relative group/img"
                        onClick={() => setLightboxOpen(true)}
                    >
                        <img 
                          src={getImageUrl(item.imageUrl)} 
                          alt={itemName} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" 
                        />
                        {/* Zoom hint overlay */}
                        <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-all duration-300 flex items-center justify-center">
                            <div className="opacity-0 group-hover/img:opacity-100 transition-opacity duration-300 bg-black/50 backdrop-blur-sm rounded-full p-3">
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                    <circle cx="8.5" cy="8.5" r="5.5" stroke="white" strokeWidth="1.5"/>
                                    <path d="M12.5 12.5L17 17" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                                    <path d="M6.5 8.5H10.5M8.5 6.5V10.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                                </svg>
                            </div>
                        </div>
                    </div>
                )}
                
                <div className="flex-grow z-10">
                    <div className="flex items-start justify-between gap-4 mb-3">
                        <h3 
                            className="text-2xl font-serif font-black tracking-tight leading-[1.1]"
                            style={{ fontFamily: 'var(--font-heading, inherit)', color: 'var(--theme-text, inherit)' }}
                        >
                            {itemName}
                        </h3>
                        <div className="flex flex-col items-end pt-1">
                          <span 
                            className="font-serif font-black text-xl"
                            style={{ color: 'var(--theme-text, inherit)', fontFamily: 'var(--font-body, inherit)' }}
                          >
                            €{item.price.toFixed(2)}
                          </span>
                        </div>
                    </div>
                    
                    <p className="text-sm text-muted-foreground font-medium leading-relaxed mb-4 md:mb-6 line-clamp-2 md:line-clamp-3">
                      {itemDesc}
                    </p>
    
                    {/* Dietary & Allergens (Minimalist) */}
                    {(item.dietaryTags?.length || item.allergens?.length) ? (() => {
                      const translatedAllergens = (currentLang && translations && translations[currentLang]?.allergens) || item.allergens || [];
                      const translatedTags = (currentLang && translations && translations[currentLang]?.dietaryTags) || item.dietaryTags || [];
                      return (
                      <div className="flex flex-wrap gap-2 mb-6">
                        {translatedTags.map((tag: string, idx: number) => (
                          <span key={idx} className="px-3 py-1 rounded-full border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] uppercase font-black tracking-widest bg-emerald-500/5">
                            {tag}
                          </span>
                        ))}
                        {translatedAllergens.map((allergen: string, idx: number) => (
                          <span key={idx} className="px-3 py-1 rounded-full border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] uppercase font-black tracking-widest bg-amber-500/5">
                            {allergen}
                          </span>
                        ))}
                      </div>
                      );
                    })() : null}
                </div>
    
                {item.options && item.options.length > 0 && (
                    <div className="mt-2 space-y-6 bg-secondary/50 rounded-[1.5rem] p-5 border border-border/40 mb-6">
                        {item.options.map(option => {
                            const oTrans = option.translations as any;
                            const optionName = (currentLang && oTrans && oTrans[currentLang]?.name) || option.name;
                            const optionChoicesTrans = (currentLang && oTrans && oTrans[currentLang]?.choices) || {};
                            return (
                            <div key={option.id}>
                                <h4 className="font-black text-[9px] uppercase tracking-[0.2em] text-muted-foreground mb-3">{optionName}</h4>
                                <div className="grid grid-cols-1 gap-2.5">
                                    {option.choices.map((choice: OptionChoice) => {
                                        const choiceName = optionChoicesTrans[choice.name] || choice.name;
                                        return (
                                        <label 
                                          key={choice.name} 
                                          className="flex items-center justify-between p-3.5 rounded-xl border border-white/5 bg-background/50 hover:border-accent/30 hover:bg-background cursor-pointer transition-all active:scale-[0.98] group/choice"
                                        >
                                            <div className="flex items-center gap-3">
                                              <input
                                                  type={option.type === 'VARIATION' ? 'radio' : 'checkbox'}
                                                  name={`option-${option.id}`}
                                                  id={`choice-${item.id}-${choice.name}`}
                                                  onChange={() => handleOptionChange(option, choice)}
                                                  className="w-4 h-4 text-accent bg-background border-border/50 focus:ring-accent accent-accent rounded-sm"
                                              />
                                              <span className="text-sm font-bold text-foreground/70 group-hover/choice:text-foreground transition-colors select-none">
                                                  {choiceName}
                                              </span>
                                            </div>
                                            {choice.priceModifier > 0 && (
                                              <span className="text-xs font-serif font-black text-accent">+€{choice.priceModifier.toFixed(2)}</span>
                                            )}
                                        </label>
                                    )})}
                                </div>
                            </div>
                        )})}
                    </div>
                )}
    
                {/* Action Button */}
                <div className="flex justify-end z-10 relative mt-6">
                    <button 
                        onClick={handleAddToCart}
                        className="group/btn relative w-full bg-accent text-white font-black uppercase tracking-[0.15em] text-[11px] py-4.5 px-8 rounded-2xl shadow-xl hover:shadow-[0_15px_30px_-5px_var(--color-accent)] hover:-translate-y-1 transition-all active:scale-[0.97] flex items-center justify-center gap-3 overflow-hidden"
                    >
                        <span className="relative z-10">{t('publicMenu.addToCart')}</span>
                        <div className="absolute inset-0 bg-white/10 opacity-0 group-hover/btn:opacity-100 transition-opacity"></div>
                    </button>
                </div>

                {/* Add-to-cart toast confirmation */}
                {toastMessage && (
                    <div 
                        className="absolute bottom-4 left-4 right-4 z-30 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border border-emerald-500/20"
                        style={{
                            background: 'linear-gradient(135deg, rgba(16,185,129,0.95) 0%, rgba(5,150,105,0.95) 100%)',
                            animation: 'toastSlideUp 0.35s cubic-bezier(0.16,1,0.3,1), toastFadeOut 0.4s ease 1.8s forwards',
                        }}
                    >
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                <path d="M2.5 7.5L5.5 10.5L11.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-white font-bold text-[11px] uppercase tracking-[0.1em] truncate">
                                {toastMessage}
                            </p>
                            <p className="text-white/70 text-[9px] font-semibold uppercase tracking-[0.15em] mt-0.5">
                                {t('publicMenu.addedToCart', 'Added to cart')}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Perfect Pairing Modal Portal */}
            {showIntercept && perfectPairings && perfectPairings.length > 0 && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto">
                    {/* Backdrop */}
                    <div 
                        className="absolute inset-0 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300"
                        onClick={() => handlePairingAction(undefined)}
                    />
                    
                    {/* Modal */}
                    <div className="relative w-full max-w-3xl bg-zinc-900 border border-white/10 shadow-2xl rounded-[3rem] overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-accent/20 blur-[120px] pointer-events-none" />

                        <div className="relative z-10 p-8 sm:p-12 flex flex-col md:flex-row gap-10">
                            <div className="flex-1 flex flex-col justify-center text-center md:text-left">
                                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/20 border border-accent/30 w-fit mx-auto md:mx-0 mb-6">
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-accent-foreground">{t('publicMenu.pairing.title')}</span>
                                </div>
                                
                                <h3 className="text-4xl sm:text-5xl font-serif font-black text-white tracking-tighter leading-[0.95] mb-6">
                                    {t('publicMenu.pairing.completeYour', { name: item.name })}
                                </h3>
                                
                                <p className="text-zinc-400 text-sm font-medium leading-relaxed mb-8 max-w-[280px] mx-auto md:mx-0">
                                    {t('publicMenu.pairing.chefDescription')}
                                </p>
                                
                                <button
                                    onClick={() => handlePairingAction(undefined)}
                                    className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500 hover:text-white transition-colors text-center md:text-left"
                                >
                                    {t('publicMenu.pairing.noThanks')}
                                </button>
                            </div>

                            <div className="flex-1 space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {perfectPairings.map((pairing) => {
                                    const pTrans = pairing.translations as any;
                                    const pairingName = (currentLang && pTrans && pTrans[currentLang]?.name) || pairing.name;
                                    
                                    return (
                                    <div 
                                        key={`intercept-${pairing.id}`} 
                                        className="group relative bg-white/5 hover:bg-white/10 rounded-[2rem] p-4 border border-white/5 transition-all duration-300"
                                    >
                                        <div className="flex items-center gap-4 mb-4">
                                            <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 bg-black shadow-xl border border-white/10 group-hover:scale-105 transition-transform duration-300">
                                                {pairing.imageUrl ? (
                                                    <img src={getImageUrl(pairing.imageUrl)} alt={pairingName} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-accent/10">
                                                        <span className="text-xl font-serif font-black text-accent">{pairingName[0]}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-grow min-w-0">
                                                <h4 className="text-lg font-serif font-bold text-white leading-tight truncate">{pairingName}</h4>
                                                <p className="text-accent font-black text-sm mt-1">+€{pairing.price.toFixed(2)}</p>
                                            </div>
                                        </div>
                                        
                                        <button
                                            onClick={() => handlePairingAction(pairing)}
                                            className="w-full py-3.5 rounded-[1.25rem] bg-white text-black font-black uppercase text-[9px] tracking-[0.2em] transition-all hover:bg-accent hover:text-white"
                                        >
                                            {t('publicMenu.pairing.addToOrder')}
                                        </button>
                                    </div>
                                )})}
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
            {/* Image Lightbox */}
            {lightboxOpen && item.imageUrl && (
                <ImageLightbox
                    src={getImageUrl(item.imageUrl)}
                    alt={item.name}
                    onClose={() => setLightboxOpen(false)}
                />
            )}
        </>
    );
};
