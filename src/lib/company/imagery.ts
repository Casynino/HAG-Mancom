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
 * When real project photography arrives, it belongs in `projects` in
 * ./profile.ts with a named client and year, and it should replace these.
 */

export const IMAGERY_NOTE =
  'Photography is illustrative stock imagery, not photographs of HA GROUP projects.'

export interface Photo {
  src: string
  /** Describes the subject only. Never asserts whose site it is. */
  alt: string
}

export const photos = {
  transmission: {
    src: '/imagery/transmission-lines.jpeg',
    alt: 'High-voltage overhead transmission lines against an open sky',
  },
  pylons: {
    src: '/imagery/pylons-dusk.jpeg',
    alt: 'Transmission pylons silhouetted at dusk',
  },
  solar: {
    src: '/imagery/solar-farm.jpeg',
    alt: 'Rows of photovoltaic panels on a utility-scale solar farm',
  },
  panel: {
    src: '/imagery/electrical-panel.jpeg',
    alt: 'Industrial electrical distribution panel with wiring and breakers',
  },
  switchgear: {
    src: '/imagery/switchgear.jpeg',
    alt: 'Low-voltage switchgear cabinet interior',
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
