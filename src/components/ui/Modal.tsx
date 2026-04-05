import { X } from 'lucide-react';
import { useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  footer?: React.ReactNode;
}

const sizeMap = {
  sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', '2xl': 'max-w-6xl',
};

export default function Modal({ isOpen, onClose, title, subtitle, children, size = 'md', footer }: ModalProps) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white rounded-xl shadow-card-lg w-full ${sizeMap[size]} max-h-[92vh] flex flex-col`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
            {subtitle && <p className="text-[11px] text-neutral-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-neutral-100 transition-colors ml-3 shrink-0">
            <X className="w-3.5 h-3.5 text-neutral-500" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-4">{children}</div>
        {footer && (
          <div className="border-t border-neutral-100 px-4 py-3 flex items-center justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
