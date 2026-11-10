/** A club as the profile page shows it; role is null when the user isn't a member. */
export interface MyClub {
  id: number;
  name: string;
  homeAirport: string | null;
  role: 'MEMBER' | 'ADMIN' | null;
}

/** A club as the (signed-out) registration form lists it. */
export interface ClubName {
  id: number;
  name: string;
}
