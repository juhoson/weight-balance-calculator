// src/components/SafetyDisclaimer.tsx
import React, { useState } from 'react';
import { Card, CardContent } from './ui/Card';
import { Alert, AlertDescription } from './ui/Alert';
import { Button } from './ui/Button';
import { ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

const SafetyDisclaimer: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card className="mb-6 border-yellow-200">
      <CardContent className="p-4">
        <Alert variant="warning"
          className="bg-background border-yellow-500/50 dark:border-yellow-500/30">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-yellow-800">
                  Important Safety Notice - Reference Tool Only
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-yellow-800"
                >
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {isExpanded && (
                <div className="space-y-2 text-sm mt-2">
                  <p>
                                        This calculator is provided as a preliminary reference tool only.
                                        The pilot-in-command (PIC) must verify all calculations using their
                                        specific aircraft's Pilot Operating Handbook (POH) before each flight.
                  </p>

                  <ul className="list-disc pl-5 space-y-1">
                    <li>
                                            Individual aircraft may have different characteristics based on
                                            modifications, equipment, and repairs.
                    </li>
                    <li>
                                            All calculations must be verified against your aircraft's specific
                                            POH and current weight and balance documentation.
                    </li>
                    <li>
                                            The PIC is ultimately responsible for ensuring the aircraft is
                                            operated within its approved weight and balance envelope.
                    </li>
                    <li>
                                            This tool should never be used as the sole source for weight
                                            and balance calculations.
                    </li>
                  </ul>

                  <p className="font-semibold mt-2">
                                        By using this calculator, you acknowledge that it is for reference
                                        purposes only and that you will verify all calculations using official
                                        aircraft documentation.
                  </p>
                </div>
              )}
            </div>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};

export default SafetyDisclaimer;