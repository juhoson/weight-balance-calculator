// Declarations only: the linter reads declared functions as unused variables.
/* eslint-disable @typescript-eslint/no-unused-vars */
// The parts of Google Identity Services (https://accounts.google.com/gsi/client) this app uses.
declare namespace google.accounts.id {
  interface CredentialResponse {
    /** The Google ID token (a JWT) to send to the backend. */
    credential: string;
    select_by?: string;
  }
  interface IdConfiguration {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    use_fedcm_for_prompt?: boolean;
  }
  interface GsiButtonConfiguration {
    type?: 'standard' | 'icon';
    theme?: 'outline' | 'filled_blue' | 'filled_black';
    size?: 'large' | 'medium' | 'small';
    text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
    shape?: 'rectangular' | 'pill' | 'circle' | 'square';
    logo_alignment?: 'left' | 'center';
    width?: number;
  }
  function initialize(config: IdConfiguration): void;
  function renderButton(parent: HTMLElement, options: GsiButtonConfiguration): void;
  function disableAutoSelect(): void;
}

interface Window {
  google?: typeof google;
}
