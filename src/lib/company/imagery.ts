/**
 * Photography used on the public site.
 *
 * These are stock photographs under the Pexels licence (free for commercial
 * use, no attribution required), downloaded and served from this repository
 * rather than hot-linked.
 *
 * They are ATMOSPHERE, not evidence. Every caption and alt text below describes
 * the subject generically — "a high-voltage switchyard", never "our substation
 * at X" — because HA GROUP has not supplied photographs of its own completed
 * work, and a stock photograph presented as a delivered project is a claim that
 * collapses the moment a client reverse-searches it.
 *
 * SEVERAL OF THESE ARE THE WRONG SUBJECT. They were selected on filename and
 * search term without anyone opening them, and three are simply not what they
 * were labelled: `pylons` is a telecommunications mast, not transmission
 * pylons; `panel` is a PC motherboard being probed with a multimeter, not a
 * distribution panel; `switchgear` is a tangle of informal street wiring, which
 * for a company whose pitch is the quality of its workmanship argues against
 * HA GROUP rather than for it. The alt text below now says what each photograph
 * actually shows, and the ones that mislead are marked `offBrand` and are not
 * used on the site.
 *
 * The real fix is HA GROUP's own photographs. Until those arrive the site uses
 * the few of these that are honestly what they claim to be.
 *
 * When real project photography arrives, it belongs in `projects` in
 * ./profile.ts with a named client and year, and it should replace these.
 */

/**
 * HA GROUP's own photographs, from their pictorial business profiles.
 *
 * These are the real thing: their crews, their installations, their plant. They
 * are not stock and carry no `offBrand` escape hatch, because there is nothing
 * to escape — the alt text can say what the work is and who did it, which is
 * exactly what the stock set below cannot do.
 *
 * Prefer these everywhere. The stock set exists only to fill positions these do
 * not yet cover.
 */
export const hagPhotos = {
  streetLightingNight: {
    src: '/imagery/hag/street-lighting-night.jpg',
    alt: 'A dual carriageway lit at night by HA GROUP street lighting, the run of poles curving into the distance',
  },
  streetLightingDay: {
    src: '/imagery/hag/street-lighting-day.jpg',
    alt: 'The same carriageway by day, showing the installed lighting columns along the central reservation',
  },
  cableReticulation: {
    src: '/imagery/hag/cable-reticulation.jpg',
    alt: 'Banks of power cable dressed onto tray and turned down a column inside a processing plant',
  },
  driveRefurbishment: {
    src: '/imagery/hag/drive-refurbishment.jpg',
    alt: 'A refurbished gearbox and motor drive train, repainted and assembled on its base frame in the workshop',
  },
  plantInstallation: {
    src: '/imagery/hag/plant-installation.jpg',
    alt: 'Process plant being craned into position while a rigger works from the steelwork above',
  },
  solarLuminaire: {
    src: '/imagery/hag/solar-luminaire.jpg',
    alt: 'An HA GROUP technician holding an all-in-one solar street light before it is raised',
  },
  lightingPoles: {
    src: '/imagery/hag/lighting-poles.jpg',
    alt: 'Cast concrete lighting columns laid out on site ready for erection',
  },
  switchboardInstalled: {
    src: '/imagery/hag/switchboard-installed.jpg',
    alt: 'An installed motor control centre on a plant floor, its cable bank rising to the roof steel',
  },
  panelWiring: {
    src: '/imagery/hag/panel-wiring.jpg',
    alt: 'Numbered terminal rails inside a control panel, every core colour-coded and dressed',
  },
  streetLightingRoadside: {
    src: '/imagery/hag/street-lighting-roadside.jpg',
    alt: 'Installed lighting columns running along a busy roadside market',
  },
} as const satisfies Record<string, { src: string; alt: string }>

export const HAG_IMAGERY_NOTE =
  'Photographs of HA GROUP’s own work, from the company’s pictorial business profiles.'

/*
 * This note was written when every photograph on the site was stock. It is not
 * true any more: the hero, the headers and the whole projects page are now
 * HA GROUP's own work, from their pictorial profiles. It says which is which,
 * because "some of these are ours" is a claim a client will check and the wrong
 * blanket disclaimer devalues the real ones.
 */
export const IMAGERY_NOTE =
  'Photographs of HA GROUP’s own projects come from the company’s pictorial business ' +
  'profiles. Where a page shows an industry scene rather than a project, it is ' +
  'illustrative stock imagery and is not a site HA GROUP has worked on.'

export interface Photo {
  src: string
  /** Describes the subject only. Never asserts whose site it is. */
  alt: string
  /**
   * True when the photograph is the wrong subject for HA GROUP, or actively
   * works against them. Kept in the file rather than deleted so nobody
   * re-downloads the same wrong image, and so the reason is recorded.
   */
  offBrand?: string
}

export const photos = {
  transmission: {
    src: '/imagery/transmission-lines.jpeg',
    alt: 'High-voltage overhead transmission lines against an open sky',
  },
  pylons: {
    src: '/imagery/pylons-dusk.jpeg',
    alt: 'A telecommunications mast carrying sector antennas and microwave dishes',
    offBrand:
      'Telecommunications, not electrical power. Also portrait, and mostly pale ' +
      'sky, so it dissolves on the light theme.',
  },
  solar: {
    src: '/imagery/solar-farm.jpeg',
    alt: 'Rows of photovoltaic panels on a utility-scale solar farm',
  },
  panel: {
    src: '/imagery/electrical-panel.jpeg',
    alt: 'Hands probing a computer mainboard with a multimeter',
    offBrand: 'Consumer electronics repair, not electro-mechanical engineering.',
  },
  switchgear: {
    src: '/imagery/switchgear.jpeg',
    alt: 'A dense tangle of informal overhead cabling on a street pole',
    offBrand: 'The opposite of the workmanship HA GROUP sells. Unusable on their own site.',
  },
  mining: {
    src: '/imagery/mining.jpeg',
    alt: 'Heavy plant working an open-cast mining operation',
  },
  manufacturing: {
    src: '/imagery/manufacturing.jpeg',
    alt: 'Machinery on a manufacturing plant floor',
  },
  electrician: {
    src: '/imagery/electrician.jpeg',
    alt: 'An electrician working on a control panel',
  },
  /*
   * Filed as a power plant; it is a close-up of a compact fluorescent bulb on
   * black. Same fault as the three below — chosen on filename, never opened.
   */
  powerPlant: {
    src: '/imagery/band-power-plant.jpeg',
    offBrand: 'A compact fluorescent bulb on black, not a power plant.',
    alt: 'A power generation plant at scale',
  },
  team: {
    src: '/imagery/band-team.jpeg',
    alt: 'Engineers reviewing work together on site',
  },
} as const satisfies Record<string, Photo>

/**
 * One photograph per service line, keyed by the slug in `services`.
 *
 * Same rule as everything else here: the picture shows the kind of work, never
 * a job HA GROUP delivered. `svc-electrical` is a switchyard, not *their*
 * switchyard.
 */
export const servicePhotos: Record<string, Photo> = {
  'electrical-services': {
    src: '/imagery/svc-electrical.jpeg',
    alt: 'High-voltage switchgear in an outdoor substation',
  },
  design: {
    src: '/imagery/svc-design.jpeg',
    alt: 'An engineer working over technical drawings',
  },
  construction: {
    src: '/imagery/svc-construction.jpeg',
    alt: 'An industrial construction site in progress',
  },
  'hazardous-areas': {
    src: '/imagery/svc-hazardous.jpeg',
    alt: 'Hot work being carried out under protective equipment',
  },
  manufacture: {
    src: '/imagery/svc-manufacture.jpeg',
    alt: 'A switchboard under assembly',
  },
  installation: {
    src: '/imagery/svc-installation.jpeg',
    alt: 'Cable being run and terminated on site',
  },
  maintenance: {
    src: '/imagery/svc-maintenance.jpeg',
    alt: 'A technician servicing plant equipment',
  },
  'labour-hire': {
    src: '/imagery/svc-labour.jpeg',
    alt: 'An engineering crew at work',
  },
  distributorship: {
    src: '/imagery/svc-distribution.jpeg',
    alt: 'Electrical stock held in a distribution warehouse',
  },
  'design-development': {
    src: '/imagery/svc-development.jpeg',
    alt: 'A monitoring and control room',
  },
}
