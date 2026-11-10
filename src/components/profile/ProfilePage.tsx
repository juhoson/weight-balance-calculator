import React from 'react';
import { CheckCircle2, Loader2, UserRound, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { joinClub, leaveClub } from '../../api/backend';
import { useAuth } from '../../api/useAuth';
import { useMyClubs } from '../../lib/useMyClubs';
import type { MyClub } from '../../types/profile';

/** The signed-in user's account, and which clubs they belong to. */
const ProfilePage: React.FC = () => {
  const { user } = useAuth();
  const [clubs, setClubs] = useMyClubs();
  const [busyId, setBusyId] = React.useState<number | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  if (!user) {
    return <p className="py-6 text-sm text-muted-foreground">Sign in to see your profile.</p>;
  }

  const change = async (club: MyClub, join: boolean) => {
    setBusyId(club.id);
    setNotice(null);
    setError(null);
    try {
      setClubs(await (join ? joinClub(club.id) : leaveClub(club.id)));
      setNotice(join
        ? `You're now a member of ${club.name}. Its aircraft are shown in the calculator.`
        : `You've left ${club.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change your club.');
    } finally {
      setBusyId(null);
    }
  };

  const mine = clubs?.filter(c => c.role !== null) ?? [];
  const others = clubs?.filter(c => c.role === null) ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {user.pictureUrl
              ? <img src={user.pictureUrl} alt="" referrerPolicy="no-referrer" className="h-6 w-6 rounded-full" />
              : <UserRound className="h-5 w-5 text-blue-600" />}
            Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Name</dt>
            <dd>{user.displayName}</dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="break-all">{user.email}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            Your clubs
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Joining a club shows its aircraft in the calculator and lets the club&apos;s admins help you with
            your account. You can still pick aircraft from any club.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div aria-live="polite">
            {notice && (
              <p role="status" className="flex items-start gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-900 dark:bg-green-900/30 dark:text-green-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                {notice}
              </p>
            )}
            {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{error}</p>}
          </div>

          {!clubs ? (
            <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading clubs…</p>
          ) : clubs.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">There are no clubs yet.</p>
          ) : (
            <>
              {mine.length === 0 && <p className="text-sm text-muted-foreground">You&apos;re not a member of any club.</p>}
              <ul className="divide-y divide-border" aria-label="Clubs">
                {[...mine, ...others].map(club => (
                  <li key={club.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium">
                        {club.name}
                        {club.role === 'ADMIN' && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-900 dark:bg-blue-900/40 dark:text-blue-200">Admin</span>}
                        {club.role === 'MEMBER' && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-900 dark:bg-green-900/40 dark:text-green-200">Member</span>}
                      </p>
                      {club.homeAirport && <p className="text-xs text-muted-foreground">Home airfield {club.homeAirport}</p>}
                    </div>
                    {club.role === null ? (
                      <Button size="sm" disabled={busyId !== null} onClick={() => change(club, true)}
                        aria-label={`Join ${club.name}`}>
                        {busyId === club.id && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                        Join
                      </Button>
                    ) : club.role === 'MEMBER' ? (
                      <Button size="sm" variant="outline" disabled={busyId !== null} onClick={() => change(club, false)}
                        aria-label={`Leave ${club.name}`}>
                        {busyId === club.id && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                        Leave
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Ask a site admin to step down</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfilePage;
