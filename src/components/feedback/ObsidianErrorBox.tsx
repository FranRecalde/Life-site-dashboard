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
    <div className="bg-[#ffdad6] text-[#ba1a1a] dark:bg-[#ef4444]/10 dark:text-[#f87171] p-3 rounded-lg text-xs leading-relaxed space-y-2 text-left">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <span className="flex-1 whitespace-pre-line">{errorText}</span>
      </div>
      
      {techDetails && (
        <div className="pt-2 border-t border-[#ba1a1a]/20 dark:border-[#f87171]/20">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] font-bold uppercase tracking-wider underline opacity-80 hover:opacity-100 focus:outline-none flex items-center gap-1 cursor-pointer"
          >
            {expanded ? 'Hide Technical Details' : 'Show Technical Details'}
          </button>
          
          {expanded && (
            <div className="mt-2 p-2 bg-[#faf8ff]/80 dark:bg-[#0c1322]/80 border border-[#eaedff]/40 dark:border-[#283044]/40 rounded font-mono text-[10px] space-y-1.5 text-gray-700 dark:text-gray-300 overflow-x-auto max-w-full">
              <div><span className="font-extrabold text-[#00288e] dark:text-[#a8b8ff]">Request Method:</span> {techDetails.method || 'GET'}</div>
              <div><span className="font-extrabold text-[#00288e] dark:text-[#a8b8ff]">Request URL:</span> {sanitize(techDetails.url) || 'N/A'}</div>
              <div><span className="font-extrabold text-[#00288e] dark:text-[#a8b8ff]">HTTP Status:</span> {techDetails.status !== undefined ? techDetails.status : 'Network Error'}</div>
              <div><span className="font-extrabold text-[#00288e] dark:text-[#a8b8ff]">Response Body:</span> {sanitize(techDetails.responseBody) || 'None or Empty'}</div>
              <div><span className="font-extrabold text-[#00288e] dark:text-[#a8b8ff]">Location:</span> {techDetails.location}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
