import { Printer } from 'lucide-react';
import { Button } from './ui/Button';

interface PrintButtonProps {
    disabled: boolean;
}

const PrintButton: React.FC<PrintButtonProps> = ({ disabled }) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <Button
      onClick={handlePrint}
      disabled={disabled}
      variant="outline"
      className="print:hidden" // Hide button when printing
    >
      <Printer className="mr-2 h-4 w-4" />
            Print Calculations
    </Button>
  );
};

export default PrintButton;