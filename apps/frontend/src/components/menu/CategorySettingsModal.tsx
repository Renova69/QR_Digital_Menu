import React, { useState, useRef } from 'react';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Category, AvailabilityType } from '../../types';
import { useMenuContext } from '../../context/MenuContext';
import { uploadCategoryImage } from '../../services/menuService';
import { Clock, Calendar, Eye, EyeOff, Timer, ImagePlus, X } from 'lucide-react';

interface CategorySettingsModalProps {
  category: Category;
  isOpen: boolean;
  onClose: () => void;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const CategorySettingsModal: React.FC<CategorySettingsModalProps> = ({ category, isOpen, onClose }) => {
  const { updateCategory } = useMenuContext();
  const [availabilityType, setAvailabilityType] = useState<AvailabilityType>(category.availabilityType || 'ALWAYS');
  const [startTime, setStartTime] = useState(category.startTime || '09:00');
  const [endTime, setEndTime] = useState(category.endTime || '22:00');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(category.daysOfWeek || [0, 1, 2, 3, 4, 5, 6]);
  const [isSaving, setIsSaving] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(category.imageUrl || null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getImageUrl = (url: string) => {
    if (url.startsWith('http')) return url;
    const apiUrl = (import.meta as any).env.VITE_API_URL || 'http://localhost:3000/api';
    const baseUrl = apiUrl.replace('/api', '');
    return `${baseUrl}/${url}`;
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleDay = (day: number) => {
    setDaysOfWeek(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);

      // Upload image if a new file was selected
      if (imageFile) {
        setIsUploadingImage(true);
        await uploadCategoryImage(category.id, imageFile);
        setIsUploadingImage(false);
      } else if (!imagePreview && category.imageUrl) {
        // Image was removed — clear it
        await updateCategory(category.id, { imageUrl: '' } as any);
      }

      await updateCategory(category.id, {
        availabilityType,
        startTime: availabilityType === 'SCHEDULED' ? startTime : null,
        endTime: availabilityType === 'SCHEDULED' ? endTime : null,
        daysOfWeek: availabilityType === 'SCHEDULED' ? daysOfWeek : [],
      });
      onClose();
    } catch (error) {
      console.error('Failed to update category settings:', error);
    } finally {
      setIsSaving(false);
      setIsUploadingImage(false);
    }
  };

  return (
    <Modal open={isOpen} onOpenChange={(open) => !open && onClose()} title={`Availability: ${category.name}`}>
      <div className="space-y-6 py-4">
        {/* Category Image Upload */}
        <div className="space-y-3">
          <label className="text-sm font-bold text-foreground flex items-center gap-2">
            <ImagePlus className="h-4 w-4 text-muted-foreground" />
            Category Image
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
          />
          {imagePreview ? (
            <div className="relative rounded-2xl overflow-hidden aspect-[3/1] bg-muted">
              <img
                src={imagePreview.startsWith('blob:') ? imagePreview : getImageUrl(imagePreview)}
                alt="Category"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <div className="absolute top-2 right-2 flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white transition-all"
                >
                  <ImagePlus className="h-4 w-4" />
                </button>
                <button
                  onClick={handleRemoveImage}
                  className="p-2 rounded-full bg-red-500/80 hover:bg-red-500 text-white transition-all"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full aspect-[3/1] rounded-2xl border-2 border-dashed border-border hover:border-accent/50 bg-muted/30 hover:bg-muted/50 transition-all flex flex-col items-center justify-center gap-2 group cursor-pointer"
            >
              <ImagePlus className="h-8 w-8 text-muted-foreground/50 group-hover:text-accent transition-colors" />
              <span className="text-xs font-bold text-muted-foreground/60 group-hover:text-accent transition-colors">Click to upload banner image</span>
            </button>
          )}
        </div>

        <div className="border-t border-border" />

        {/* Availability Type Selection */}
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => setAvailabilityType('ALWAYS')}
            className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all ${
              availabilityType === 'ALWAYS'
                ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm'
                : 'border-border bg-background text-muted-foreground hover:border-muted-foreground/30'
            }`}
          >
            <Eye className="h-6 w-6 mb-2" />
            <span className="text-xs font-bold uppercase tracking-tight">Always</span>
          </button>

          <button
            onClick={() => setAvailabilityType('SCHEDULED')}
            className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all ${
              availabilityType === 'SCHEDULED'
                ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm'
                : 'border-border bg-background text-muted-foreground hover:border-muted-foreground/30'
            }`}
          >
            <Timer className="h-6 w-6 mb-2" />
            <span className="text-xs font-bold uppercase tracking-tight">Schedule</span>
          </button>

          <button
            onClick={() => setAvailabilityType('HIDDEN')}
            className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all ${
              availabilityType === 'HIDDEN'
                ? 'border-red-600 bg-red-50 text-red-700 shadow-sm'
                : 'border-border bg-background text-muted-foreground hover:border-muted-foreground/30'
            }`}
          >
            <EyeOff className="h-6 w-6 mb-2" />
            <span className="text-xs font-bold uppercase tracking-tight">Hidden</span>
          </button>
        </div>

        {availabilityType === 'SCHEDULED' && (
          <div className="space-y-6 animate-in slide-in-from-top-2 duration-300">
            {/* Days Selection */}
            <div className="space-y-3">
              <label className="text-sm font-bold text-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                Active Days
              </label>
              <div className="flex justify-between gap-1">
                {DAYS.map((day, index) => (
                  <button
                    key={day}
                    onClick={() => toggleDay(index)}
                    className={`flex-1 h-10 rounded-xl text-xs font-bold transition-all ${
                      daysOfWeek.includes(index)
                        ? 'bg-foreground text-background shadow-md'
                        : 'bg-muted text-muted-foreground hover:bg-muted/70'
                    }`}
                  >
                    {day[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* Time Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <label className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Start Time
                </label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="rounded-xl h-11 border-border focus:ring-indigo-600"
                />
              </div>
              <div className="space-y-3">
                <label className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  End Time
                </label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="rounded-xl h-11 border-border focus:ring-indigo-600"
                />
              </div>
            </div>
            
            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
              <p className="text-[10px] text-indigo-600 font-medium leading-relaxed">
                * Category will be automatically hidden from the public menu outside these hours.
              </p>
            </div>
          </div>
        )}

        {availabilityType === 'ALWAYS' && (
            <div className="p-4 bg-muted/30 rounded-2xl border border-dashed border-border text-center">
                <p className="text-sm text-muted-foreground">Category is visible 24/7 on the public menu.</p>
            </div>
        )}

        {availabilityType === 'HIDDEN' && (
            <div className="p-4 bg-red-50 rounded-2xl border border-dashed border-red-100 text-center">
                <p className="text-sm text-red-600 font-medium">Category is manually hidden and won't appear on the menu.</p>
            </div>
        )}

        <div className="flex gap-3 pt-4">
          <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl h-11">
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={isSaving} 
            className="flex-1 rounded-xl h-11 bg-foreground text-background hover:bg-foreground/90 transition-all font-bold"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
