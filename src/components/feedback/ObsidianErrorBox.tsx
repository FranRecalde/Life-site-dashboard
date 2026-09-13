import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

export interface ObsidianErrorBoxProps {
  errorText: string;
  techDetails?: {
    method?: string;
    url?: string;
    status?: number;
    responseBody?: string;
    location: 'browser' | 'server';
  } | null;
}

export const ObsidianErrorBox: React.FC<ObsidianErrorBoxProps> = ({ errorText, techDetails }) => {
  const [expanded, setExpanded] = useState(false);

  const sanitize = (text?: string) => {
    if (!text) return '';
    return text.replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED]')
               .replace(/token=[a-zA-Z0-9_\-\.]+/gi, 'token=[REDACTED]');
  };

  return (
    <div className="bg-[var(--color-warning-surface)] text-[var(--color-warning)] bg-[var(--color-warning-surface)]/10 text-[var(--color-warning)] p-3 rounded-lg text-xs leading-relaxed space-y-2 text-left">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <span className="flex-1 whitespace-pre-line">{errorText}</span>
      </div>

      {techDetails && (
        <div className="pt-2 border-t border-[var(--color-warning)]/20 border-[var(--color-warning)]/20">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] font-semibold uppercase tracking-wider underline  hover:opacity-100 focus:outline-none flex items-center gap-1 cursor-pointer"
          >
            {expanded ? 'Hide Technical Details' : 'Show Technical Details'}
          </button>

          {expanded && (
            <div className="mt-2 p-2 bg-[var(--color-card-raised)]/80 bg-[var(--color-card)]/80 border border-[var(--color-divider)]/40 border-[var(--color-divider)]/40 rounded font-mono text-[10px] space-y-1.5 text-[var(--color-ink)] text-[var(--color-secondary)] overflow-x-auto max-w-full">
              <div><span className="font-semibold text-[var(--color-control)] text-[var(--color-secondary)]">Request Method:</span> {techDetails.method || 'GET'}</div>
              <div><span className="font-semibold text-[var(--color-control)] text-[var(--color-secondary)]">Request URL:</span> {sanitize(techDetails.url) || 'N/A'}</div>
              <div><span className="font-semibold text-[var(--color-control)] text-[var(--color-secondary)]">HTTP Status:</span> {techDetails.status !== undefined ? techDetails.status : 'Network Error'}</div>
              <div><span className="font-semibold text-[var(--color-control)] text-[var(--color-secondary)]">Response Body:</span> {sanitize(techDetails.responseBody) || 'None or Empty'}</div>
              <div><span className="font-semibold text-[var(--color-control)] text-[var(--color-secondary)]">Location:</span> {techDetails.location}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
