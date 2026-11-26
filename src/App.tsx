import React from 'react';
import {Plane} from 'lucide-react';
import WeightBalanceCalculator from './components/WeightBalanceCalculator';
import AddAircraftPage from './components/import/AddAircraftPage';
import {ThemeProvider} from './context/theme-provider';
import {ThemeToggle} from './components/ThemeToggle';
import {Button} from './components/ui/Button';
import AccountMenu from './components/auth/AccountMenu';
import ZuluClock from './components/ZuluClock';
import SignedOutNotice from './components/auth/SignedOutNotice';
import ResetPasswordDialog from './components/auth/ResetPasswordDialog';
import AdminTabs from './components/admin/AdminTabs';
import ProfilePage from './components/profile/ProfilePage';
import AuthDialog from './components/auth/AuthDialog';
import {useAdminAccess} from './lib/useAdminAccess';
import {useAuth} from './api/useAuth';

type View = 'calculator' | 'add-aircraft' | 'admin' | 'profile';

/** ?delete-account (the link in public/delete-account.html and the store listings): the profile's account deletion. */
export const DELETE_ACCOUNT_PARAM = 'delete-account';

function deleteAccountRequested(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (!params.has(DELETE_ACCOUNT_PARAM)) return false;
  params.delete(DELETE_ACCOUNT_PARAM);
  const rest = params.toString();
  window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
  return true;
}

function App() {
  const [deleteRequested] = React.useState(deleteAccountRequested);
  const [view, setView] = React.useState<View>(deleteRequested ? 'profile' : 'calculator');
  const [addedRegistration, setAddedRegistration] = React.useState<string | null>(null);
  const adminAccess = useAdminAccess();
  const {user} = useAuth();
  const [signInToDelete, setSignInToDelete] = React.useState(deleteRequested);
  const [accountDeleted, setAccountDeleted] = React.useState(false);
  // Signing out (or losing admin rights) leaves the admin and profile pages.
  // (Except for an account deletion request: it waits for the sign-in.)
  const shown: View = (view === 'admin' && !adminAccess) || (view === 'profile' && !user && !deleteRequested) ? 'calculator' : view;

  return (
    <ThemeProvider defaultTheme="system">
      <div className="min-h-screen bg-slate-50 text-foreground dark:bg-background">
        <header className="safe-top sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur print:hidden">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
            <div className="flex items-center gap-2.5 sm:gap-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Plane className="h-5 w-5 -rotate-45"/>
              </span>
              <div className="leading-tight">
                <h1 className="whitespace-nowrap text-base font-bold tracking-tight sm:text-lg">Weight &amp; Balance</h1>
                <p className="hidden text-xs text-muted-foreground sm:block">Loading and CG for light aircraft</p>
              </div>
              <ZuluClock/>
            </div>
            <nav className="flex flex-wrap items-center gap-2" aria-label="Main">
              <Button
                variant={shown === 'calculator' ? 'default' : 'outline'}
                size="sm"
                aria-current={shown === 'calculator' ? 'page' : undefined}
                onClick={() => setView('calculator')}
              >
                Calculator
              </Button>
              <Button
                variant={shown === 'add-aircraft' ? 'default' : 'outline'}
                size="sm"
                aria-current={shown === 'add-aircraft' ? 'page' : undefined}
                onClick={() => setView('add-aircraft')}
              >
                Add aircraft
              </Button>
              {adminAccess && (
                <Button
                  variant={shown === 'admin' ? 'default' : 'outline'}
                  size="sm"
                  aria-current={shown === 'admin' ? 'page' : undefined}
                  onClick={() => setView('admin')}
                >
                  Admin
                </Button>
              )}
              <AccountMenu onOpenProfile={() => setView('profile')} profileOpen={shown === 'profile'} />
              <ThemeToggle />
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-5 sm:py-6">
          <SignedOutNotice />
          <ResetPasswordDialog />
          {shown === 'admin' && adminAccess && <AdminTabs access={adminAccess} />}
          {accountDeleted && (
            <p role="status" className="mb-5 rounded-md border border-emerald-500 bg-emerald-50 p-3 text-sm dark:bg-emerald-950/30">
              Your account and its data are deleted. Thank you for flying with us.
            </p>
          )}
          {shown === 'profile' && user && (
            <ProfilePage openDelete={deleteRequested} onDeleted={() => { setAccountDeleted(true); setView('calculator'); }}/>
          )}
          {deleteRequested && shown === 'profile' && !user && !accountDeleted && (
            <div className="mx-auto max-w-md space-y-3 py-6 text-center">
              <p>Sign in to delete your account and its data.</p>
              <Button type="button" onClick={() => setSignInToDelete(true)}>Sign in</Button>
              <AuthDialog open={signInToDelete} onOpenChange={setSignInToDelete}/>
            </div>
          )}
          {shown === 'calculator' && (
            <WeightBalanceCalculator preferredRegistration={addedRegistration} onOpenProfile={() => setView('profile')} />
          )}
          {shown === 'add-aircraft' && <AddAircraftPage onDone={registration => {
            setAddedRegistration(registration ?? null);
            setView('calculator');
          }} />}
          <footer className="mt-6 text-center text-xs text-muted-foreground">
            Aircraft data based on manufacturer specifications. Always verify with actual aircraft documentation.
            Model photos from Wikimedia Commons, credited on each photo.
          </footer>
        </main>
      </div>
    </ThemeProvider>
  );
}

export default App;
