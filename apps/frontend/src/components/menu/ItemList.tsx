import React, { useState } from 'react';
import { useMenuContext } from '../../context/MenuContext';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableItem } from '../ui/SortableItem';
import { Button } from '../ui/button';
import { ManageOptionsModal } from './ManageOptionsModal';
import { EditItemForm } from './EditItemForm';
import { Item } from '../../types';
import { Trash2, Edit, Plus, Info, GripVertical, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const ItemList: React.FC = () => {
  const { items, isLoadingItems, selectedCategory, deleteItem, updateItem } = useMenuContext();
  const [selectedItemForOptions, setSelectedItemForOptions] = useState<Item | null>(null);
  const { t } = useTranslation();

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`${t('menuAdmin.confirmDelete', 'Are you sure you want to delete')} "${name}"?`)) {
      deleteItem(id);
    }
  };

  const handleToggleFeatured = async (item: Item) => {
    try {
      await updateItem(item.id, { isFeatured: !item.isFeatured });
    } catch (error) {
      console.error('Failed to toggle featured status', error);
    }
  };

  if (!selectedCategory) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-lg bg-secondary/50">
        <div className="bg-card p-3 rounded-full shadow-sm mb-4">
          <Plus className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-foreground">{t('menuAdmin.noCategory', 'No Category Selected')}</h3>
        <p className="text-sm text-muted-foreground max-w-xs mt-1">{t('menuAdmin.selectCategoryPrompt', 'Select a category on the left to manage its menu items.')}</p>
      </div>
    );
  }

  if (isLoadingItems) {
    return (
      <div className="flex justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
      </div>
    );
  }

  return (
    <>
      <SortableContext items={items?.map(i => i.id) || []} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {items && items.length > 0 ? (
            items.map((item) => (
              <SortableItem key={item.id} id={item.id}>
                <ItemRow
                  item={item}
                  onDelete={handleDelete}
                  onOpenOptions={setSelectedItemForOptions}
                  onToggleFeatured={handleToggleFeatured}
                  t={t}
                />
              </SortableItem>
            ))
          ) : (
            <div className="text-center p-12 border-2 border-dashed rounded-lg">
                <p className="text-muted-foreground">{t('menuAdmin.emptyCategory', 'This category is currently empty.')}</p>
                <p className="text-xs text-muted-foreground/70 mt-1">{t('menuAdmin.addItemsPrompt', 'Add items using the form below.')}</p>
            </div>
          )}
        </div>
      </SortableContext>
      
      {selectedItemForOptions && (
        <ManageOptionsModal
            item={selectedItemForOptions}
            open={!!selectedItemForOptions}
            onOpenChange={(open) => !open && setSelectedItemForOptions(null)}
        />
      )}
    </>
  );
};

// Extracted row component receives dragHandleProps from SortableItem
const ItemRow = ({ item, onDelete, onOpenOptions, onToggleFeatured, dragHandleProps, t }: {
  item: Item;
  onDelete: (id: string, name: string) => void;
  onOpenOptions: (item: Item) => void;
  onToggleFeatured: (item: Item) => void;
  dragHandleProps?: any;
  t: any;
}) => {
  return (
    <div className="p-4 bg-card border border-border rounded-lg shadow-sm hover:border-accent/30 transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 group">
      <div className="flex items-start gap-3 flex-1">
        {/* Drag handle - only this triggers drag */}
        <span
          {...dragHandleProps}
          className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground mt-1 flex-shrink-0"
        >
          <GripVertical className="h-4 w-4" />
        </span>
        
        {item.imageUrl && (
            <div className="h-16 w-16 min-w-[4rem] rounded-md overflow-hidden bg-secondary border border-border">
                <img 
                    src={item.imageUrl.startsWith('http') ? item.imageUrl : `${(import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace('/api', '')}/${item.imageUrl}`} 
                    alt={item.name} 
                    className="h-full w-full object-cover"
                />
            </div>
        )}
        <div className="flex-1">
            <div className="flex items-center gap-2">
                <h4 className="font-bold text-foreground">{item.name}</h4>
                <div className="flex gap-1">
                    {item.dietaryTags?.map(tag => (
                        <span key={tag} className="px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 text-[10px] font-medium border border-green-100">
                            {tag}
                        </span>
                    ))}
                </div>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{item.description}</p>
            <div className="flex items-center gap-3 mt-2">
                <span className="font-bold text-accent">
                    {item.currency === 'BGN' ? 'лв' : '€'}{item.price.toFixed(2)}
                </span>
                {item.allergens && item.allergens.length > 0 && (
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
                        <Info className="h-3 w-3" />
                        <span>{t('publicMenu.contains', 'Contains')}: {item.allergens.join(', ')}</span>
                    </div>
                )}
            </div>
        </div>
      </div>
      
      {/* Action buttons - NOT inside drag target */}
      <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button 
            variant="ghost" 
            size="icon" 
            className={`h-8 w-8 ${item.isFeatured ? 'text-yellow-500 hover:text-yellow-600 hover:bg-yellow-50' : 'text-muted-foreground hover:text-yellow-500'}`}
            title="Feature Item"
            onClick={() => onToggleFeatured(item)}
          >
              <Star className="h-4 w-4" fill={item.isFeatured ? 'currentColor' : 'none'} />
          </Button>

          <EditItemForm 
            item={item} 
            trigger={
                <Button variant="outline" size="icon" className="h-8 w-8">
                    <Edit className="h-4 w-4 text-muted-foreground" />
                </Button>
            }
          />
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => onOpenOptions(item)}
            className="text-[11px] h-8"
          >
              {t('menuAdmin.optionsBtn', 'Options')}
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 hover:bg-red-50 hover:text-red-600"
            onClick={() => onDelete(item.id, item.name)}
          >
              <Trash2 className="h-4 w-4" />
          </Button>
      </div>
    </div>
  );
};
