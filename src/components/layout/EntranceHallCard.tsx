import React from 'react';

interface EntranceHallCardProps {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<any>;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const EntranceHallCard: React.FC<EntranceHallCardProps> = ({
  title,
  subtitle,
  icon: Icon,
  headerAction,
  children,
  className = '',
}) => {
  return (
    <div 
      className={`life-site-entrance-hall bg-[#0d1527] border border-[#1e293b]/60 rounded-xl shadow-[0_8px_32px_-4px_rgba(0,0,0,0.3)] transition-all duration-300 hover:border-[#9a7d44]/30 overflow-hidden text-slate-200 flex flex-col ${className}`}
    >
      {/* Card Header section */}
      <div className="px-5 py-4 border-b border-[#1e293b]/40 bg-[#0a0f1d]/50 flex items-start justify-between gap-4 select-none">
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="p-2 rounded-lg bg-[#131b2e] border border-[#1e293b] text-[#c5a86a] mt-0.5 shadow-sm">
              <Icon className="w-4 h-4" />
            </div>
          )}
          <div>
            <h3 className="font-display text-sm font-bold tracking-wider text-white uppercase">
              {title}
            </h3>
            {subtitle && (
              <p className="text-[10px] text-[#757684] mt-0.5 leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {headerAction && (
          <div className="shrink-0">
            {headerAction}
          </div>
        )}
      </div>

      {/* Card Body section */}
      <div className="flex-1 p-5 relative overflow-hidden">
        {/* Decorative corner accent */}
        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[#c5a86a]/[0.015] to-transparent pointer-events-none" />
        
        <div className="relative z-10 h-full">
          {children}
        </div>
      </div>
    </div>
  );
};
