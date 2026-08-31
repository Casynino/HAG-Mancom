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

export const IMAGERY_NOTE =
  'Photography is illustrative stock imagery, not photographs of HA GROUP projects.'

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
  powerPlant: {
    src: '/imagery/band-power-plant.jpeg',
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
