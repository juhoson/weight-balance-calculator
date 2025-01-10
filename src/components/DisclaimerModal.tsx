import * as React from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "./ui/Dialog";
import { Button } from './ui/Button';
import { AlertTriangle } from 'lucide-react';

interface DisclaimerModalProps {
    open: boolean;
    onAccept: () => void;
}

const DisclaimerModal: React.FC<DisclaimerModalProps> = ({ open, onAccept }) => {
    return (
        <Dialog open={open} onOpenChange={() => {}}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-yellow-800">
                        <AlertTriangle className="h-6 w-6" />
                        Important Safety Notice
                    </DialogTitle>
                </DialogHeader>

                <DialogDescription className="space-y-4">
                    <p className="font-semibold text-base">
                        This calculator is provided as a preliminary reference tool only.
                    </p>

                    <div className="space-y-2 text-sm">
                        <ul className="list-disc pl-5 space-y-2">
                            <li>
                                The pilot-in-command (PIC) must verify all calculations using their
                                specific aircraft's Pilot Operating Handbook (POH) before each flight.
                            </li>
                            <li>
                                Individual aircraft may have different characteristics based on
                                modifications, equipment, and repairs.
                            </li>
                            <li>
                                All calculations must be verified against your aircraft's specific
                                POH and current weight and balance documentation.
                            </li>
                            <li>
                                This tool should never be used as the sole source for weight
                                and balance calculations.
                            </li>
                        </ul>
                    </div>

                    <p className="font-semibold text-sm mt-4">
                        By clicking "Accept", you acknowledge that this calculator is for reference
                        purposes only and that you will verify all calculations using official
                        aircraft documentation.
                    </p>
                </DialogDescription>

                <DialogFooter>
                    <Button onClick={onAccept} className="w-full">
                        Accept
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default DisclaimerModal;