import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

const KEY_PREFIX = 'curtain.';

/** Open or closed, remembered by id, so what a pilot keeps open stays open. */
function useOpen(id: string, initial: boolean): [boolean, () => void] {
  const [open, setOpen] = React.useState(() => {
    try { const v = localStorage.getItem(KEY_PREFIX + id); return v == null ? initial : v === 'open'; } catch { return initial; }
  });
  const toggle = () => setOpen(v => {
    try { localStorage.setItem(KEY_PREFIX + id, v ? 'closed' : 'open'); } catch { /* private mode */ }
    return !v;
  });
  return [open, toggle];
}

interface CurtainProps {
  /** Where its open state is remembered. */
  id: string;
  title: React.ReactNode;
  /** One line shown while closed (and open): what's behind it, in short. */
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Details behind a curtain: the title and a one-line summary, the rest a tap away. Keeps the page
 * simple at first glance; warnings belong outside it.
 */
const Curtain: React.FC<CurtainProps> = ({ id, title, summary, defaultOpen = false, className, children }) => {
  const [open, toggle] = useOpen(id, defaultOpen);
  const bodyId = `curtain-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  return (
    <div className={cn('min-w-0', className)}>
      <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={toggle}
        className="flex w-full min-w-0 items-baseline gap-1.5 rounded-md py-1 text-left text-sm hover:bg-muted/50">
        <ChevronRight aria-hidden className={cn('h-4 w-4 shrink-0 self-center transition-transform', open && 'rotate-90')}/>
        <span className="shrink-0 font-medium">{title}</span>
        {summary && <span className="min-w-0 truncate text-xs text-muted-foreground">{summary}</span>}
      </button>
      {open && <div id={bodyId} className="mt-1 space-y-2 pl-5">{children}</div>}
    </div>
  );
};

export default Curtain;
