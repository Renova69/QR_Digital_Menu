import { useState, useRef } from 'react';
import { ImagePlus, X } from 'lucide-react';

interface ImageUploadInputProps {
  currentImageUrl?: string | null;
  onFileSelect: (file: File | null) => void;
  /** Called when the user explicitly removes the current image */
  onRemove?: () => void;
  label?: string;
  hint?: string;
  aspectRatio?: 'square' | 'wide' | 'banner';
  /** Override button labels for i18n */
  changeLabel?: string;
  removeLabel?: string;
  uploadLabel?: string;
}

const ASPECT_CLASSES = {
  square: 'aspect-square',
  wide: 'aspect-[4/3]',
  banner: 'aspect-[3/1]',
};

const ACCEPTED_TYPES = 'image/jpeg,image/png';

export const ImageUploadInput: React.FC<ImageUploadInputProps> = ({
  currentImageUrl,
  onFileSelect,
  onRemove,
  label = 'Image',
  hint = 'JPEG or PNG only. Max 5MB.',
  aspectRatio = 'square',
  changeLabel = 'Change image',
  removeLabel = 'Remove image',
  uploadLabel = 'Click to upload',
}) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Show new preview first, then existing image — unless user explicitly removed it
  const displayImage = preview || (removed ? null : currentImageUrl);

  const getDisplayUrl = (url: string) => {
    if (url.startsWith('http') || url.startsWith('blob:')) return url;
    const apiUrl = (import.meta as any).env.VITE_API_URL || 'http://localhost:3000/api';
    const baseUrl = apiUrl.replace('/api', '');
    return `${baseUrl}/${url}`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      onFileSelect(null);
      setPreview(null);
      setFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setRemoved(false);
    setPreview(URL.createObjectURL(file));
    setFileName(file.name);
    onFileSelect(file);
  };

  const handleRemove = () => {
    setPreview(null);
    setFileName(null);
    setRemoved(true);
    onFileSelect(null);
    onRemove?.();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-bold text-foreground flex items-center gap-2">
        <ImagePlus className="h-4 w-4 text-muted-foreground" />
        {label}
      </label>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleFileChange}
        className="hidden"
      />

      {displayImage ? (
        <div
          className={`relative rounded-2xl overflow-hidden ${ASPECT_CLASSES[aspectRatio]} bg-muted group`}
        >
          <img
            src={getDisplayUrl(displayImage)}
            alt="Preview"
            className={`w-full h-full ${aspectRatio === 'wide' ? 'object-contain' : 'object-cover'}`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white transition-all"
              aria-label={changeLabel}
              title={changeLabel}
            >
              <ImagePlus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="p-2 rounded-full bg-red-500/80 hover:bg-red-500 text-white transition-all"
              aria-label={removeLabel}
              title={removeLabel}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {fileName && (
            <div className="absolute bottom-2 left-2 px-2 py-1 rounded-lg bg-black/50 backdrop-blur-sm text-white text-[10px] font-medium">
              {fileName}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`w-full ${ASPECT_CLASSES[aspectRatio]} rounded-2xl border-2 border-dashed border-border hover:border-primary/50 bg-muted/30 hover:bg-muted/50 transition-all flex flex-col items-center justify-center gap-2 group cursor-pointer`}
        >
          <ImagePlus className="h-8 w-8 text-muted-foreground/50 group-hover:text-primary transition-colors" />
          <span className="text-xs font-bold text-muted-foreground/60 group-hover:text-primary transition-colors">
            {uploadLabel}
          </span>
          <span className="text-[10px] text-muted-foreground/40">{hint}</span>
        </button>
      )}
    </div>
  );
};
