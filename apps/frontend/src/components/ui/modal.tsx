import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Cross2Icon } from "@radix-ui/react-icons";
import { cn } from "../../lib/utils";

interface ModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  title: string;
  description?: string;
  trigger?: React.ReactNode;
  contentClassName?: string;
  titleClassName?: string;
}

export const Modal: React.FC<ModalProps> = ({
  open,
  onOpenChange,
  children,
  title,
  description,
  trigger,
  contentClassName,
  titleClassName,
}) => {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay className="bg-background/60 backdrop-blur-sm fixed inset-0 z-[1000]" />
        <Dialog.Content
          className={cn(
            "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[95vw] max-w-lg glass-panel bg-background p-8 md:p-10 rounded-[2rem] md:rounded-[3rem] shadow-2xl z-[1001] border-white/5 animate-in zoom-in-95 fade-in duration-300",
            contentClassName,
          )}
        >
          <Dialog.Title
            className={cn(
              "text-3xl font-display font-black text-foreground tracking-tight mb-2 pr-10",
              titleClassName,
            )}
          >
            {title}
          </Dialog.Title>
          {description && (
            <Dialog.Description className="text-sm font-medium text-muted-foreground italic mb-8 opacity-80 pr-10">
              {description}
            </Dialog.Description>
          )}

          <div className="relative">{children}</div>

          <Dialog.Close asChild>
            <button
              className="absolute top-6 right-6 p-2 rounded-full bg-secondary/50 text-muted-foreground hover:text-foreground transition-all active:scale-90"
              aria-label="Close"
            >
              <Cross2Icon className="w-5 h-5" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
