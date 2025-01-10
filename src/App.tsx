import React from 'react';
import WeightBalanceCalculator from "./components/WeightBalanceCalculator";

function App() {
  return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
            <h1 className="text-3xl font-bold text-gray-900">
              Flight Planning Tool
            </h1>
          </div>
        </header>

        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <WeightBalanceCalculator />
        </main>

        <footer className="bg-white shadow mt-8">
          <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
            <p className="text-center text-sm text-gray-500">
              Aircraft data based on manufacturer specifications. Always verify with actual aircraft documentation.
            </p>
          </div>
        </footer>
      </div>
  );
}

export default App;
