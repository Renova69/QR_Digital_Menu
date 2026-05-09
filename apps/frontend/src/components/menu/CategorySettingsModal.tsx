import React, { useState } from 'react';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ImageUploadInput } from '../ui/ImageUploadInput';
import { useToast } from '../ui/toast';
import { Category, AvailabilityType } from '../../types';
import { useMenuContext } from '../../context/MenuContext';
import { uploadCategoryImage } from '../../services/menuService';
import { Clock, Calendar, Eye, EyeOff, Timer } from 'lucide-react';

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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const { showToast, ToastComponent } = useToast();

  const toggleDay = (day: number) => {
    setDaysOfWeek(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);

      if (imageFile) {
        await uploadCategoryImage(category.id, imageFile);
      }

      await updateCategory(category.id, {
        availabilityType,
        startTime: availabilityType === 'SCHEDULED' ? startTime : null,
        endTime: availabilityType === 'SCHEDULED' ? endTime : null,
        daysOfWeek: availabilityType === 'SCHEDULED' ? daysOfWeek : [],
        ...(imageRemoved && { imageUrl: null, thumbnailUrl: null }),
      });

      showToast('Category settings saved successfully', 'success');
      onClose();
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Failed to save settings';
      showToast(message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {ToastComponent}
      <Modal open={isOpen} onOpenChange={(open) => !open && onClose()} title={`Availability: ${category.name}`}>
        <div className="space-y-6 py-4">
          <ImageUploadInput
            currentImageUrl={category.imageUrl}
            onFileSelect={(file) => {
              setImageFile(file);
              if (file) setImageRemoved(false);
            }}
            onRemove={() => {
              setImageRemoved(true);
              setImageFile(null);
            }}
            label="Category Image"
            aspectRatio="banner"
          />

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
    </>
  );
};
