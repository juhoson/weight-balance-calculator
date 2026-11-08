import React from 'react';
import WeightBalanceCalculator from './components/WeightBalanceCalculator';
import AddAircraftPage from './components/import/AddAircraftPage';
import {ThemeProvider} from './context/theme-provider';
import {ThemeToggle} from './components/ThemeToggle';
import {Button} from './components/ui/Button';
import AccountMenu from './components/auth/AccountMenu';
import SignedOutNotice from './components/auth/SignedOutNotice';
import ResetPasswordDialog from './components/auth/ResetPasswordDialog';

type View = 'calculator' | 'add-aircraft';

function App() {
  const [view, setView] = React.useState<View>('calculator');
  const [addedRegistration, setAddedRegistration] = React.useState<string | null>(null);

  return (
    <ThemeProvider defaultTheme="system">
      <div className="min-h-screen bg-background text-foreground">
        <ThemeToggle />
        <div className="max-w-7xl mx-auto p-4">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 pr-12">
            <h1 className="text-3xl font-bold">
                            Flight Planning Tool
            </h1>
            <nav className="flex flex-wrap items-center gap-2" aria-label="Main">
              <Button
                variant={view === 'calculator' ? 'default' : 'outline'}
                size="sm"
                aria-current={view === 'calculator' ? 'page' : undefined}
                onClick={() => setView('calculator')}
              >
                Calculator
              </Button>
              <Button
                variant={view === 'add-aircraft' ? 'default' : 'outline'}
                size="sm"
                aria-current={view === 'add-aircraft' ? 'page' : undefined}
                onClick={() => setView('add-aircraft')}
              >
                Add aircraft
              </Button>
              <AccountMenu />
            </nav>
          </div>
          <SignedOutNotice />
          <ResetPasswordDialog />
          {view === 'calculator'
            ? <WeightBalanceCalculator preferredRegistration={addedRegistration} />
            : <AddAircraftPage onDone={registration => {
              setAddedRegistration(registration ?? null);
              setView('calculator');
            }} />}
          <footer className="text-center text-sm text-muted-foreground mt-8">
                        Aircraft data based on manufacturer specifications. Always verify with actual aircraft documentation.
          </footer>
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App;
