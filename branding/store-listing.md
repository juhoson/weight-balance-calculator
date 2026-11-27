# Store listings: App Store and Google Play

Texts to paste into App Store Connect and Play Console, with the files in this folder. Lengths are
checked against each store's limits. Fill in the two **TODO**s (a contact email and the demo account)
before submitting.

## Files

| What | File | Store |
|---|---|---|
| iPhone 6.9" screenshots (1320×2868), in order | `screenshots/ios/iphone-6.9/01…10` | App Store |
| iPad 13" screenshots (2064×2752), in order | `screenshots/ios/ipad-13/01…10` | App Store |
| Phone screenshots (1080×1920) | `screenshots/android/phone/` | Google Play |
| 10" tablet screenshots (1600×2560) | `screenshots/android/tablet-10/` | Google Play |
| App icon 512×512 | `google-play/icon-512.png` | Google Play |
| Feature graphic 1024×500 | `google-play/feature-graphic-1024x500.png` | Google Play |

## Shared details

- **Developer / seller:** Songer Consulting AB
- **Website / support URL:** https://www.flightplanningtool.com/
- **Privacy policy:** https://www.flightplanningtool.com/privacy.html
- **Account deletion (Play):** https://www.flightplanningtool.com/delete-account.html
- **Contact email:** TODO (Play shows it publicly; Apple asks for one for App Review)
- **Category:** Navigation (App Store secondary: Utilities); Play: Maps & Navigation
- **Price:** free
- **Age rating:** 4+ (App Store) / Everyone (Play): no objectionable content, no user-to-user contact

---

## App Store

**Name** (30): `Flight Planning Tool`

**Subtitle** (30): `VFR planning, W&B and nav map`

**Promotional text** (170, can change without a new version):

> New: the map planner. Tap the map for the airspace there and add a waypoint where you tapped. Export an ICAO flight plan with fuel, endurance and persons on board.

**Keywords** (100, comma-separated, no spaces after commas):

```
VFR,weight and balance,flight plan,pilot,aviation,METAR,TAF,airspace,navigation,nav log,GA,CG
```

**Description** (4000):

```
Plan a VFR flight from the loading to the landing, then fly it with a moving map on your phone or tablet.

WEIGHT AND BALANCE
• Your aircraft's loading against its CG envelope, at takeoff and at landing
• Seats, baggage areas and fuel tanks laid out as in the aircraft
• Generic types for common light aircraft (Cessna, Piper, Diamond, Cirrus and more), or your own aircraft and your club's fleet with their weighing report values
• A clear verdict: within limits, outside limits, or fuel below the reserve

ROUTE AND WEATHER
• Departure, arrival and waypoints: airfields, visual reporting points or any point on the map
• The map planner: the route on a full-screen map. Tap the map for the airspace there and add a waypoint where you tapped; tap an airfield to route via it, fly to it or depart from it
• METAR and TAF along the route, decoded, with the best runway for the wind and the crosswind against your aircraft's limit
• En-route forecast at your cruise altitude: wind, cloud base and icing, top of climb and descent, and a nav log with headings, groundspeed and times
• Suggested cruise altitudes compared in the forecast wind

AIRSPACE AND OBSTACLES
• The airspace your planned path enters, with frequencies, what each needs (a clearance, a call) and how to go under or over it
• Obstacles near the route, with a warning when one is less than 500 ft below your planned altitude
• A profile of the flight with the terrain, the airspace and the obstacles

BRIEFING AND FILING
• A printable briefing pack: route, weather, airfield maps with reporting points, en-route chart and an emergency checklist
• An ICAO flight plan made from your plan, ready to copy into your filing service, with fuel, endurance and persons on board
• A reminder after landing to close the flight plan

NAVIGATION MODE (VFR aid)
• The route on a moving map with GPS, track up or north up
• The airspace you're in and the next one ahead, with its frequency
• The airfield's runways and taxiways when you're close in; the circuit drawn after a go-around
• Nearest airfields within glide, and an emergency page with the MAYDAY call
• Nearby traffic from ADS-B (online), terrain and obstacle warnings
• The route's map kept on the device, for flying without a connection
• Block times from the GPS (off block, takeoff, landing, on block), a debriefing pack and your track as KML

Coverage: weather and the map work worldwide. Airspace comes from openAIP. IFR fixes, navaids, obstacles and the Sweden Control frequencies come from the Swedish AIP.

IMPORTANT
Flight Planning Tool is a planning and situational-awareness aid, not certified navigation equipment. You remain responsible for your flight: check your aircraft's POH, the AIP, official charts, NOTAMs and an official weather briefing before every flight.
```

**What's new** (this version):

```
• Map planner: plan on a full-screen map; tap for the airspace and to add a waypoint
• ICAO flight plan export with fuel, endurance and persons on board, and a reminder to close it after landing
• Printing works in the app: debriefing pack, briefing pack and calculations
• Go-around: the circuit is drawn with its side and circuit altitude
• Navigation mode starts track up; the runway map stays in view on takeoff and approach
• Faster route weather
```

**App Review information**

- **Sign-in required:** yes, for navigation mode. Demo account: TODO email / TODO password (an account with an aircraft and a saved route).
- **Notes:**

```
VFR flight planning for general aviation pilots: weight and balance, route weather, airspace and a flight plan, all usable without an account. Signing in (email, Apple or Google) keeps the pilot's aircraft, saved routes and flights.

Native features: navigation mode uses the device's GPS while the app is open (foreground only), keeps the screen on, and keeps the route's map on the device for flying without a connection. To try it without flying: sign in with the demo account, open Navigation mode and tap "Demo flight".

The app uses no custom encryption. Account deletion: Profile → Delete account.
```

---

## Google Play

**App name** (30): `Flight Planning Tool: VFR`

**Short description** (80):

```
VFR flight planning: weight & balance, weather, airspace and a moving map.
```

**Full description** (4000): the App Store description above, as it is.

**Release notes** (500): the "What's new" text above.

**App access:** some functions need an account: give the same demo account as for App Review, with
the note "Navigation mode → Demo flight shows the moving map without flying."

**Data safety** (as in `docs/mobile-apps.md`, E6):

- Location: precise, collected, for app functionality, optional (only while navigation mode is open; kept with a flight only when the pilot saves it).
- Personal info: name and email address, for account management.
- Data encrypted in transit: yes. Users can delete their data: yes (Profile → Delete account, and the web page above).
- No ads; no data shared with third parties for advertising.
