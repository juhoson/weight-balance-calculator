# Aircraft Weight and Balance Calculator

A web-based tool for calculating aircraft weight and balance, designed for General Aviation aircraft. This application helps pilots ensure their aircraft loading meets safety requirements by calculating center of gravity (CG) and total weight, while providing visual feedback through CG envelope visualization.

## Features

- **Aircraft Selection**: Supports multiple aircraft types including:
    - Cessna 172S
    - Diamond DA40D
    - Diamond DA40NG
    - Piper PA-28-161

- **Weight Input**:
    - Pilot and front passenger weight
    - Rear passenger weight
    - Baggage weight
    - Fuel quantity (with unit conversion between liters and kg)

- **Real-time Calculations**:
    - Total weight calculation
    - Center of gravity (CG) computation
    - Automatic validation against aircraft limits

- **Visual Feedback**:
    - Interactive CG envelope visualization
    - Current loading point display
    - Weight and balance status indicators

- **Aircraft Information**:
    - Display of key aircraft performance data
    - Maximum weights and limitations
    - Speed references
    - Aircraft-specific limitations

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd weight-balance-calculator
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

The application will be available at `http://localhost:3000`

## Technologies Used

- React
- TypeScript
- Tailwind CSS
- Recharts for visualization
- shadcn/ui components

## Project Structure

```
src/
├── components/
│   ├── WeightBalanceCalculator.tsx
│   ├── CGEnvelopeVisualization.tsx
│   ├── AircraftInfoBox.tsx
│   └── ui/
│       ├── Button.tsx
│       ├── Card.tsx
│       ├── Input.tsx
│       └── ...
├── data/
│   └── aircraftData.ts
└── App.tsx
```

## Usage

1. Select an aircraft type from the dropdown menu
2. Enter weights for pilot, passengers, and baggage
3. Input fuel quantity (in liters or kg)
4. Click "Calculate" to see results
5. Check the CG envelope visualization to ensure the loading point is within limits
6. Review aircraft performance data in the info box below

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Aircraft data sourced from official aircraft manuals and documentation
- Built with support from the general aviation community

## Safety Notice

This tool is for reference only. Always verify weight and balance calculations against official aircraft documentation before flight.