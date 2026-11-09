import React from 'react';
import {Plane} from 'lucide-react';
import WeightBalanceCalculator from './components/WeightBalanceCalculator';
import AddAircraftPage from './components/import/AddAircraftPage';
import {ThemeProvider} from './context/theme-provider';
import {ThemeToggle} from './components/ThemeToggle';
import {Button} from './components/ui/Button';
import AccountMenu from './components/auth/AccountMenu';
import SignedOutNotice from './components/auth/SignedOutNotice';
import ResetPasswordDialog from './components/auth/ResetPasswordDialog';
import AdminPage from './components/admin/AdminPage';
import {useAdminAccess} from './lib/useAdminAccess';

type View = 'calculator' | 'add-aircraft' | 'admin';

function App() {
  const [view, setView] = React.useState<View>('calculator');
  const [addedRegistration, setAddedRegistration] = React.useState<string | null>(null);
  const adminAccess = useAdminAccess();
  // Signing out (or losing admin rights) leaves the admin page.
  const shown: View = view === 'admin' && !adminAccess ? 'calculator' : view;

  return (
    <ThemeProvider defaultTheme="system">
      <div className="min-h-screen bg-slate-50 text-foreground dark:bg-background">
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur print:hidden">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Plane className="h-5 w-5 -rotate-45"/>
              </span>
              <div className="leading-tight">
                <h1 className="whitespace-nowrap text-base font-bold tracking-tight sm:text-lg">Weight &amp; Balance</h1>
                <p className="hidden text-xs text-muted-foreground sm:block">Loading and CG for light aircraft</p>
              </div>
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
              <AccountMenu />
              <ThemeToggle />
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-5 sm:py-6">
          <SignedOutNotice />
          <ResetPasswordDialog />
          {shown === 'admin' && adminAccess && <AdminPage access={adminAccess} />}
          {shown === 'calculator' && <WeightBalanceCalculator preferredRegistration={addedRegistration} />}
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
