import React from 'react';
import { Button, type ButtonProps } from '../ui/Button';
import AuthDialog from './AuthDialog';

/** A button that opens the sign-in dialog. */
const SignInButton: React.FC<ButtonProps & { label?: string }> = ({ label = 'Sign in', ...props }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button {...props} onClick={() => setOpen(true)}>{label}</Button>
      <AuthDialog open={open} onOpenChange={setOpen} />
    </>
  );
};

export default SignInButton;
