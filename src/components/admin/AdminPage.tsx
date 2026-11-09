import React from 'react';
import { CheckCircle2, KeyRound, Loader2, Search, ShieldCheck, Trash2, UserPlus, UserRound, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/Dialog';
import InviteDialog from './InviteDialog';
import {
  deleteMember,
  listMembers,
  removeFromClub,
  sendPasswordLink,
  setClubRole,
  setMemberDisabled,
} from '../../api/backend';
import { useAuth } from '../../api/useAuth';
import type { AdminAccess, InviteResponse, MemberView, Membership } from '../../types/admin';

const ALL_CLUBS = '';
const SEARCH_DELAY_MS = 250;

type Confirm =
  | { kind: 'disable'; member: MemberView }
  | { kind: 'delete'; member: MemberView }
  | { kind: 'remove'; member: MemberView; club: Membership };

function signInMethod(m: MemberView): string {
  if (m.hasPassword && m.google) return 'Password and Google';
  if (m.google) return 'Google';
  if (m.hasPassword) return 'Password';
  return 'Not signed up yet';
}

function formatDate(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function inviteNotice(result: InviteResponse): string {
  const who = result.member.email;
  switch (result.outcome) {
  case 'INVITED':
    return result.emailSent ? `Invite sent to ${who}.` : `Account created for ${who}; an invite went out less than a minute ago.`;
  case 'REINVITED':
    return result.emailSent ? `${who} hadn't signed up yet; the invite was sent again.`
      : `${who} hasn't signed up yet; an invite went out less than a minute ago.`;
  case 'ADDED':
    return `${who} already had an account and was added to the club.`;
  default:
    return `${who} is already a member.`;
  }
}

const StatusBadge: React.FC<{ member: MemberView }> = ({ member }) => {
  const base = 'rounded-full px-2 py-0.5 text-xs font-medium';
  return (
    <>
      {member.status === 'INVITED' && <span className={`${base} bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200`}>Invited</span>}
      {member.status === 'DISABLED' && <span className={`${base} bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200`}>Disabled</span>}
      {member.siteAdmin && <span className={`${base} bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200`}>Site admin</span>}
    </>
  );
};

interface MemberRowProps {
  member: MemberView;
  access: AdminAccess;
  isSelf: boolean;
  busy: boolean;
  onSendLink: () => void;
  onEnable: () => void;
  onConfirm: (confirm: Confirm) => void;
  onToggleClubAdmin: (club: Membership) => void;
}

const MemberRow: React.FC<MemberRowProps> = ({
  member, access, isSelf, busy, onSendLink, onEnable, onConfirm, onToggleClubAdmin,
}) => {
  const lastLogin = formatDate(member.lastLoginAt);
  // Accounts are shared between clubs, so only site admins disable or delete them - never their own
  // or another site admin's (the backend refuses those too).
  const canManageAccount = access.siteAdmin && !isSelf && !member.siteAdmin;
  const canRemove = (club: Membership) => access.siteAdmin || (!isSelf && club.role === 'MEMBER');

  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        {member.pictureUrl
          ? <img src={member.pictureUrl} alt="" referrerPolicy="no-referrer" className="mt-0.5 h-8 w-8 shrink-0 rounded-full" />
          : <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted"><UserRound className="h-4 w-4 text-muted-foreground" /></span>}
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium">{member.displayName}</span>
            {isSelf && <span className="text-xs text-muted-foreground">(you)</span>}
            <StatusBadge member={member} />
          </div>
          <div className="break-all text-sm text-muted-foreground">{member.email}</div>
          <div className="text-xs text-muted-foreground">
            {signInMethod(member)}
            {member.status !== 'INVITED' && <> · {lastLogin ? `Last signed in ${lastLogin}` : 'Never signed in'}</>}
          </div>
          {member.clubs.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 pt-1" aria-label={`Clubs of ${member.displayName}`}>
              {member.clubs.map(club => (
                <li key={club.clubId} className="flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs">
                  {club.clubName}
                  {access.siteAdmin ? (
                    <button type="button" disabled={busy} onClick={() => onToggleClubAdmin(club)}
                      className="rounded px-1 font-medium text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-900/30"
                      title={club.role === 'ADMIN' ? 'Make an ordinary member' : 'Make club admin'}>
                      {club.role === 'ADMIN' ? 'admin' : 'member'}
                    </button>
                  ) : club.role === 'ADMIN' && <span className="font-medium">admin</span>}
                  {canRemove(club) && (
                    <button type="button" disabled={busy} onClick={() => onConfirm({ kind: 'remove', member, club })}
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={`Remove ${member.displayName} from ${club.clubName}`}>
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5 sm:justify-end">
        {member.status !== 'DISABLED' && (
          <Button size="sm" variant="outline" disabled={busy} onClick={onSendLink}>
            <KeyRound className="mr-1 h-4 w-4" />
            {member.status === 'INVITED' ? 'Resend invite' : 'Send reset link'}
          </Button>
        )}
        {canManageAccount && (member.status === 'DISABLED'
          ? <Button size="sm" variant="outline" disabled={busy} onClick={onEnable}>Enable</Button>
          : <Button size="sm" variant="outline" disabled={busy} onClick={() => onConfirm({ kind: 'disable', member })}>Disable</Button>)}
        {canManageAccount && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onConfirm({ kind: 'delete', member })}
            className="text-red-700 hover:text-red-800 dark:text-red-400" aria-label={`Delete ${member.displayName}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </li>
  );
};

const confirmText: Record<Confirm['kind'], { title: string; action: string }> = {
  disable: { title: 'Disable this account?', action: 'Disable' },
  delete: { title: 'Delete this account?', action: 'Delete' },
  remove: { title: 'Remove from the club?', action: 'Remove' },
};

function confirmDescription(c: Confirm): string {
  const who = `${c.member.displayName} (${c.member.email})`;
  switch (c.kind) {
  case 'disable':
    return `${who} is signed out everywhere and can't sign in until you enable the account again.`;
  case 'delete':
    return `${who} and everything they own - their own aircraft, saved routes and settings - are deleted for good. `
        + 'This can\'t be undone. Disabling the account instead keeps their data.';
  case 'remove':
    return `${who} is no longer a member of ${c.club.clubName}. Their account stays, and they can still use the `
        + 'calculator and see the club\'s aircraft.';
  }
}

/** Members, invites and account actions for site admins and club admins. */
const AdminPage: React.FC<{ access: AdminAccess }> = ({ access }) => {
  const { user } = useAuth();
  const [query, setQuery] = React.useState('');
  const [clubFilter, setClubFilter] = React.useState<string>(ALL_CLUBS);
  const [members, setMembers] = React.useState<MemberView[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState<Confirm | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const clubId = clubFilter === ALL_CLUBS ? undefined : Number(clubFilter);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      listMembers(query, clubId)
        .then(result => { if (!cancelled) { setMembers(result); setError(null); } })
        .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the members.'); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, query ? SEARCH_DELAY_MS : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, clubId, reloadKey]);

  const replace = (updated: MemberView) =>
    setMembers(list => list?.map(m => (m.id === updated.id ? updated : m)) ?? null);

  /** Runs an action on one member, showing errors and a notice. */
  const act = async (memberId: number, action: () => Promise<string>) => {
    setBusyId(memberId);
    setError(null);
    setNotice(null);
    try {
      setNotice(await action());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusyId(null);
    }
  };

  const sendLink = (m: MemberView) => act(m.id, async () => {
    const result = await sendPasswordLink(m.id);
    return result.kind === 'INVITE' ? `Invite sent again to ${result.email}.` : `Password reset link sent to ${result.email}.`;
  });

  const enable = (m: MemberView) => act(m.id, async () => {
    replace(await setMemberDisabled(m.id, false));
    return `${m.displayName} can sign in again.`;
  });

  const toggleClubAdmin = (m: MemberView, club: Membership) => act(m.id, async () => {
    const role = club.role === 'ADMIN' ? 'MEMBER' : 'ADMIN';
    replace(await setClubRole(club.clubId, m.id, role));
    return role === 'ADMIN' ? `${m.displayName} is now an admin of ${club.clubName}.`
      : `${m.displayName} is now an ordinary member of ${club.clubName}.`;
  });

  const runConfirmed = () => {
    if (!confirm) return;
    const c = confirm;
    setConfirm(null);
    act(c.member.id, async () => {
      if (c.kind === 'disable') {
        replace(await setMemberDisabled(c.member.id, true));
        return `${c.member.displayName} is disabled and signed out everywhere.`;
      }
      if (c.kind === 'delete') {
        await deleteMember(c.member.id);
        setMembers(list => list?.filter(m => m.id !== c.member.id) ?? null);
        return `${c.member.displayName}'s account was deleted.`;
      }
      const updated = await removeFromClub(c.club.clubId, c.member.id);
      // Filtered to that club, they no longer belong in the list.
      if (clubId === c.club.clubId || (!access.siteAdmin && updated.clubs.length === 0)) {
        setMembers(list => list?.filter(m => m.id !== c.member.id) ?? null);
      } else {
        replace(updated);
      }
      return `${c.member.displayName} was removed from ${c.club.clubName}.`;
    });
  };

  const onInvited = (result: InviteResponse) => {
    setError(null);
    setNotice(inviteNotice(result));
    setReloadKey(k => k + 1);
  };

  const scope = access.siteAdmin ? 'Site admin: every account and club.'
    : `Admin of ${access.clubs.map(c => c.name).join(', ')}.`;
  const selectClass = 'h-10 rounded-md border border-gray-300 bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            Members
          </CardTitle>
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="mr-1 h-4 w-4" />
            Invite member
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{scope}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" placeholder="Search by name or email" aria-label="Search members" value={query}
              onChange={e => setQuery(e.target.value)} className="bg-background pl-9 text-foreground" />
          </div>
          {access.clubs.length > 1 && (
            <select aria-label="Club" value={clubFilter} onChange={e => setClubFilter(e.target.value)} className={selectClass}>
              <option value={ALL_CLUBS}>{access.siteAdmin ? 'All accounts' : 'All my clubs'}</option>
              {access.clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>

        <div aria-live="polite">
          {notice && (
            <p role="status" className="flex items-start gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-900 dark:bg-green-900/30 dark:text-green-200">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              {notice}
            </p>
          )}
          {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{error}</p>}
        </div>

        {loading && !members ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading members…</p>
        ) : members && members.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            {query ? 'No members match your search.' : 'No members yet. Invite someone to get started.'}
          </p>
        ) : members && (
          <>
            <ul className={`divide-y divide-border ${loading ? 'opacity-60' : ''}`} aria-label="Members">
              {members.map(m => (
                <MemberRow key={m.id} member={m} access={access} isSelf={m.id === user?.id} busy={busyId === m.id}
                  onSendLink={() => sendLink(m)} onEnable={() => enable(m)} onConfirm={setConfirm}
                  onToggleClubAdmin={club => toggleClubAdmin(m, club)} />
              ))}
            </ul>
            {members.length >= 500 && <p className="text-xs text-muted-foreground">Showing the first 500. Search to narrow it down.</p>}
          </>
        )}
      </CardContent>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} access={access} defaultClubId={clubId}
        onInvited={onInvited} />

      <Dialog open={confirm !== null} onOpenChange={open => { if (!open) setConfirm(null); }}>
        <DialogContent className="sm:max-w-md">
          {confirm && (
            <>
              <DialogHeader>
                <DialogTitle>{confirmText[confirm.kind].title}</DialogTitle>
                <DialogDescription>{confirmDescription(confirm)}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
                <Button variant={confirm.kind === 'remove' ? 'default' : 'destructive'} onClick={runConfirmed}>
                  {confirmText[confirm.kind].action}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default AdminPage;
