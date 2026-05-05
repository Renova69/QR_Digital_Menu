import React, { useState } from 'react';
import { useMenuContext } from '../../context/MenuContext';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableItem } from '../ui/SortableItem';
import { Pencil, Trash2, Check, X, GripVertical, Clock, EyeOff, Timer } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useTranslation } from 'react-i18next';
import { CategorySettingsModal } from './CategorySettingsModal';
import { Category } from '../../types';

export const CategoryList: React.FC = () => {
  const { categories, selectedCategory, selectCategory, isLoadingCategories, updateCategory, deleteCategory } = useMenuContext();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [settingsCategory, setSettingsCategory] = useState<Category | null>(null);
  const { t } = useTranslation();

  const handleStartEdit = (e: React.MouseEvent, id: string, currentName: string) => {
    e.stopPropagation();
    setEditingId(id);
    setEditName(currentName);
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleSaveEdit = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (editName.trim()) {
      await updateCategory(id, { name: editName });
      setEditingId(null);
    }
  };

  const handleDelete = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (window.confirm(`${t('menuAdmin.confirmDeleteCategory', 'Delete category')} "${name}" ${t('menuAdmin.andAllItems', 'and ALL its items?')} `)) {
      deleteCategory(id);
    }
  };

  const handleOpenSettings = (e: React.MouseEvent, category: Category) => {
    e.stopPropagation();
    setSettingsCategory(category);
  };

  if (isLoadingCategories) {
    return (
        <div className="flex justify-center p-4">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
        </div>
    );
  }

  return (
    <SortableContext items={categories?.map(c => c.id) || []} strategy={verticalListSortingStrategy}>
      <ul className="space-y-1.5">
        {categories?.map((category) => (
          <SortableItem key={category.id} id={category.id}>
            <CategoryRow
              category={category}
              isSelected={selectedCategory?.id === category.id}
              isEditing={editingId === category.id}
              editName={editName}
              onSelect={() => selectCategory(category)}
              onEditNameChange={setEditName}
              onStartEdit={handleStartEdit}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={handleCancelEdit}
              onDelete={handleDelete}
              onOpenSettings={(e: React.MouseEvent) => handleOpenSettings(e, category)}
            />
          </SortableItem>
        ))}
      </ul>
      {settingsCategory && (
        <CategorySettingsModal 
          category={settingsCategory} 
          isOpen={!!settingsCategory} 
          onClose={() => setSettingsCategory(null)} 
        />
      )}
    </SortableContext>
  );
};

// Extracted to receive dragHandleProps from SortableItem
const CategoryRow = ({ category, isSelected, isEditing, editName, onSelect, onEditNameChange, onStartEdit, onSaveEdit, onCancelEdit, onDelete, onOpenSettings, dragHandleProps }: any) => {
  return (
    <li
      onClick={onSelect}
      className={`group flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all border ${
        isSelected
          ? 'bg-accent text-white border-accent shadow-sm'
          : 'hover:bg-secondary border-transparent text-foreground'
      }`}
    >
      <span 
        {...dragHandleProps}
        className={`cursor-grab active:cursor-grabbing ${isSelected ? 'text-white/70' : 'text-muted-foreground/30 hover:text-muted-foreground'}`}
      >
        <GripVertical className="h-4 w-4 flex-shrink-0" />
      </span>
      
      {isEditing ? (
        <div className="flex items-center gap-1 flex-1 min-w-0" onClick={e => e.stopPropagation()}>
            <Input 
                value={editName}
                onChange={e => onEditNameChange(e.target.value)}
                className="h-7 text-xs bg-background text-foreground py-0"
                autoFocus
            />
            <Button variant="ghost" size="icon" className="h-6 w-6 text-green-600" onClick={e => onSaveEdit(e, category.id)}>
                <Check className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-red-600" onClick={onCancelEdit}>
                <X className="h-3 w-3" />
            </Button>
        </div>
      ) : (
        <>
            <div className="flex-1 truncate flex items-center gap-2 overflow-hidden">
                <span className="font-semibold text-sm truncate">
                    {category.name}
                </span>
                {category.availabilityType === 'HIDDEN' && (
                  <span className="bg-red-100 text-red-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                    <EyeOff className="h-2 w-2" /> HIDDEN
                  </span>
                )}
                {category.availabilityType === 'SCHEDULED' && (
                  <span className="bg-indigo-100 text-indigo-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                    <Timer className="h-2 w-2" /> SCHEDULED
                  </span>
                )}
            </div>
            
            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity gap-0.5">
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className={`h-6 w-6 ${isSelected ? 'hover:bg-white/20 text-white' : 'hover:bg-muted text-muted-foreground'}`} 
                    onClick={onOpenSettings}
                >
                    <Clock className="h-3 w-3" />
                </Button>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className={`h-6 w-6 ${isSelected ? 'hover:bg-white/20 text-white' : 'hover:bg-muted text-muted-foreground'}`} 
                    onClick={e => onStartEdit(e, category.id, category.name)}
                >
                    <Pencil className="h-3 w-3" />
                </Button>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className={`h-6 w-6 ${isSelected ? 'hover:bg-red-500 text-white' : 'hover:bg-red-50 dark:hover:bg-red-900/40 text-red-400'}`} 
                    onClick={e => onDelete(e, category.id, category.name)}
                >
                    <Trash2 className="h-3 w-3" />
                </Button>
            </div>
        </>
      )}
    </li>
  );
};
