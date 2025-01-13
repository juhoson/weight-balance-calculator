import React from 'react';
import WeightBalanceCalculator from './components/WeightBalanceCalculator';
import {ThemeProvider} from './context/theme-provider';
import {ThemeToggle} from './components/ThemeToggle';

function App() {
  return (
    <ThemeProvider defaultTheme="system">
      <div className="min-h-screen bg-background text-foreground">
        <ThemeToggle />
        <div className="max-w-7xl mx-auto p-4">
          <h1 className="text-3xl font-bold mb-6">
                        Flight Planning Tool
          </h1>
          <WeightBalanceCalculator />
          <footer className="text-center text-sm text-muted-foreground mt-8">
                        Aircraft data based on manufacturer specifications. Always verify with actual aircraft documentation.
          </footer>
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App;
