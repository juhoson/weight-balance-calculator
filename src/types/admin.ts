// The admin page's API (weight-balance-backend AdminDtos).

export type ClubRole = 'MEMBER' | 'ADMIN';

export interface ClubOption {
  id: number;
  name: string;
}

/** What the signed-in user may administer; admin is false for most users. */
export interface AdminAccess {
  siteAdmin: boolean;
  /** Clubs whose members they manage: every club for a site admin. */
  clubs: ClubOption[];
  admin: boolean;
}

export interface Membership {
  clubId: number;
  clubName: string;
  role: ClubRole;
}

/** INVITED: has neither set a password nor signed in with Google yet. */
export type MemberStatus = 'ACTIVE' | 'INVITED' | 'DISABLED';

export interface MemberView {
  id: number;
  email: string;
  displayName: string;
  pictureUrl?: string | null;
  status: MemberStatus;
  hasPassword: boolean;
  google: boolean;
  siteAdmin: boolean;
  lastLoginAt?: string | null;
  createdAt?: string | null;
  /** Only the clubs the viewer administers. */
  clubs: Membership[];
}

export interface InviteRequest {
  email: string;
  displayName?: string;
  clubId?: number;
  role?: ClubRole;
}

export type InviteOutcome = 'INVITED' | 'REINVITED' | 'ADDED' | 'ALREADY_MEMBER';

export interface InviteResponse {
  outcome: InviteOutcome;
  /** False when a link went out to this address less than a minute ago. */
  emailSent: boolean;
  member: MemberView;
}

export interface PasswordLinkResponse {
  kind: 'RESET' | 'INVITE';
  email: string;
}
