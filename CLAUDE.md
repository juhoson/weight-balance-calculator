# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm start` - Start development server (available at http://localhost:3000)
- `npm run build` - Build for production
- `npm test` - Run tests with React Testing Library
- `npm run lint` - Run ESLint on TypeScript files
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run lint-staged` - Run linting on staged files (used by pre-commit hooks)

## Architecture Overview

This is a React TypeScript application for aircraft weight and balance calculations, specifically designed for General Aviation aircraft. The application helps pilots ensure their aircraft loading meets safety requirements.

### Key Components Structure

- **WeightBalanceCalculator.tsx** - Main calculator component handling user inputs, calculations, and results display
- **CGEnvelopeVisualization.tsx** - Recharts-based component for visualizing center of gravity envelope
- **AircraftInfoBox.tsx** - Displays aircraft performance data and specifications
- **SeatLayout.tsx** - Visual seat chart for weight distribution
- **AircraftBackground.tsx** - Aircraft silhouette display component

### Data Architecture

- **aircraftData.ts** - Central aircraft database containing:
  - Weight and balance specifications for each aircraft
  - CG envelope coordinates and limits
  - Performance data (speeds, fuel consumption, etc.)
  - Station arms and weight limits
  - Support for both KIAS and MPH speed units

### Aircraft Support

The application currently supports multiple aircraft types including:
- Diamond DA40 variants (D and NG models)
- Piper PA-28 variants (161, 181)
- Piper PA-18-150 Super Cub (tandem seating)
- Piper PA-32R-300 Lance (6-seater)

Each aircraft has unique characteristics including different seating layouts (standard 4-seat, tandem 2-seat, or 6-seat configurations).

### Calculation Engine

The core calculation functions in `aircraftData.ts`:
- `calculateMoment()` - Weight × arm calculations
- `calculateCG()` - Total moment ÷ total weight
- `isWithinEnvelope()` - Polygon-based envelope validation using ray casting algorithm

### UI Framework

- **Tailwind CSS** with custom design tokens via CSS variables
- **shadcn/ui components** - Reusable UI components in `src/components/ui/`
- **Dark mode support** via ThemeProvider context
- **Recharts** for CG envelope visualization

### Weight and Balance Features

- Real-time takeoff and landing calculations
- Fuel consumption planning with different power settings
- Visual CG envelope validation
- Support for metric units (kg, liters) and imperial conversions
- Automatic safety limit checking

## Code Style

- **ESLint** configured with TypeScript rules
- 2-space indentation
- Single quotes for strings
- Semicolons required
- Pre-commit hooks via husky and lint-staged

## Type Safety

- Strict TypeScript configuration
- Interface definitions for aircraft data structures
- Type-safe aircraft selection and calculations
- Comprehensive error handling for weight/balance validation