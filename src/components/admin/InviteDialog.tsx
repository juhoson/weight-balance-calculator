import React from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { inviteMember } from '../../api/backend';
import type { AdminAccess, ClubRole, InviteResponse } from '../../types/admin';

const NO_CLUB = '';

interface InviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  access: AdminAccess;
  /** Preselected club, e.g. the one the member list is filtered to. */
  defaultClubId?: number;
  onInvited: (result: InviteResponse) => void;
}

/**
 * Invite by email. A new address gets an account and a "choose your password" email; an existing
 * account is added to the club. Club admins invite members to their own clubs; a site admin may
 * also make someone a club admin, or create an account without a club.
 */
const InviteDialog: React.FC<InviteDialogProps> = ({ open, onOpenChange, access, defaultClubId, onInvited }) => {
  const initialClub = defaultClubId ?? (access.clubs.length === 1 || !access.siteAdmin ? access.clubs[0]?.id : undefined);
  const [email, setEmail] = React.useState('');
  const [name, setName] = React.useState('');
  const [clubId, setClubId] = React.useState<string>(initialClub !== undefined ? String(initialClub) : NO_CLUB);
  const [role, setRole] = React.useState<ClubRole>('MEMBER');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setEmail('');
      setName('');
      setClubId(initialClub !== undefined ? String(initialClub) : NO_CLUB);
      setRole('MEMBER');
      setError(null);
    }
  }, [open, initialClub]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await inviteMember({
        email: email.trim(),
        displayName: name.trim() || undefined,
        clubId: clubId === NO_CLUB ? undefined : Number(clubId),
        role: clubId === NO_CLUB ? undefined : role,
      });
      onInvited(result);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the invite.');
    } finally {
      setBusy(false);
    }
  };

  const selectClass = 'flex h-10 w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite a member</DialogTitle>
          <DialogDescription>
            They get an email with a link to choose a password (valid for a week). Someone who already has an
            account is just added to the club.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="invite-email" className="text-sm font-medium">Email</label>
            <Input id="invite-email" type="email" required maxLength={255} autoComplete="off" value={email}
              onChange={e => setEmail(e.target.value)} className="bg-background text-foreground" />
          </div>
          <div className="space-y-1">
            <label htmlFor="invite-name" className="text-sm font-medium">
              Name <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input id="invite-name" maxLength={100} autoComplete="off" value={name}
              onChange={e => setName(e.target.value)} className="bg-background text-foreground" />
          </div>
          <div className="space-y-1">
            <label htmlFor="invite-club" className="text-sm font-medium">Club</label>
            <select id="invite-club" value={clubId} onChange={e => setClubId(e.target.value)} className={selectClass}
              required={!access.siteAdmin}>
              {access.siteAdmin && <option value={NO_CLUB}>No club</option>}
              {access.clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {access.siteAdmin && clubId !== NO_CLUB && (
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">Role in the club</legend>
              <div className="flex gap-4 text-sm">
                {(['MEMBER', 'ADMIN'] as const).map(r => (
                  <label key={r} className="flex items-center gap-1.5">
                    <input type="radio" name="invite-role" value={r} checked={role === r} onChange={() => setRole(r)} />
                    {r === 'MEMBER' ? 'Member' : 'Club admin'}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default InviteDialog;
