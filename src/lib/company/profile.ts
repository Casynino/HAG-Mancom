/**
 * HA GROUP's own published company information.
 *
 * Every string in this file was taken from HA GROUP's live website at
 * https://hpcagroup.africa/hpc/ on 31 August 2026 — the group overview, the
 * service descriptions, the partner arrangements, the office addresses and the
 * telephone numbers are the company's own words and the company's own data.
 * Nothing here is invented, inferred or rounded, because a wrong phone number
 * or a mis-stated distributorship on a public site is a real commercial problem.
 *
 * Wording was tidied only where the source had obvious typography faults: a
 * missing space after a full stop, an inconsistent capital, "Harzadous" for
 * "Hazardous". Facts were not touched. Where the source was ambiguous the
 * ambiguity is preserved rather than resolved by guessing.
 *
 * This is the single place to correct the public site. Change a value here and
 * every page that shows it follows.
 */

export const SOURCE_NOTE =
  'Company information published by HA GROUP at hpcagroup.africa, retrieved 31 August 2026.'

export const company = {
  name: 'HA GROUP',
  tagline: 'Turnkey electrical and electro-mechanical engineering across Africa',

  /** The group overview, as HA GROUP states it. */
  overview:
    'HA GROUP is a turnkey electrical projects company that designs, constructs, ' +
    'refurbishes and maintains power and electro-mechanical systems in mining, ' +
    'manufacturing plants, industrial and commercial buildings, shopping malls, ' +
    'petroleum and gas stations, and residential places across Africa.',

  ownership:
    'The company wholly or partly owns engineering operating units in parts of ' +
    'Africa and the United Kingdom. Individual companies are incorporated in ' +
    'Botswana, Malawi, Mozambique, Tanzania, South Africa, Zambia, Zimbabwe and ' +
    'the United Kingdom under the Companies Act of each country.',

  /** Stated on the About page: "Initially registered in Zimbabwe in 2007". */
  foundedYear: 2007,
  foundedIn: 'Zimbabwe',

  benchmark:
    'HA GROUP is the new performance benchmark for Africa. Our workmanship is what ' +
    'industry expects from electrical suppliers, contractors and projects companies ' +
    'and managers. We aim to provide best in class services at each of the moments ' +
    'of truth in our operating units across Africa.',

  primaryEmail: 'business@hpcagroup.africa',
  primaryPhone: '+27 11 234 1838',
} as const

/** The four stated values, in the company's own order. */
export const values = [
  {
    title: 'Integrity & honesty',
    body:
      'We nurture uncompromising personal integrity in private and public life, and the ' +
      'promotion of truthfulness, transparency, fairness and respect.',
  },
  {
    title: 'Creativity & innovation',
    body:
      'We promote individual and team ingenuity, inventiveness, imagination and trail ' +
      'blazing in all areas of individual life and business.',
  },
  {
    title: 'Commitment',
    body:
      'We cultivate personalised and continuous dedicated service to our customers and ' +
      'their interests, to meet and exceed client expectations.',
  },
  {
    title: 'Passion for excellence',
    body:
      'Delivery of service excellence through quality and passion, and the ability to add ' +
      'value through innovation and superior performance.',
  },
] as const

/** Sectors HA GROUP names as its specialisms. */
export const verticals = [
  {
    title: 'Mining',
    body:
      'In the demanding mining sector we supply durable components that withstand harsh ' +
      'conditions, enabling safer and more productive operations deep underground.',
  },
  {
    title: 'Manufacturing',
    body:
      'Advanced manufacturing solutions across diverse industries, creating bespoke ' +
      'components that drive efficiency and quality in production processes.',
  },
  {
    title: 'Agro-processing',
    body:
      'Elevating agricultural yields with precision technology, enhancing agro-processing ' +
      'efficiency with solutions for crop preservation and food production.',
  },
] as const

/**
 * The ten service lines, with the detail HA GROUP publishes for each.
 * `points` are the company's own bulleted lists, kept verbatim in substance.
 */
export const services = [
  {
    slug: 'electrical-services',
    title: 'Electrical services',
    summary:
      'High, medium and low voltage transmission, substations, distribution networks and ' +
      'rural electrification.',
    points: [
      'High, medium and low voltage overhead transmission lines',
      'Construction and commissioning of 330/110/66/33/11 kV substations',
      'Distribution networks and rural electrification',
      "Generation and distribution asset optimisation using General Electric's Predictive Diagnostic Advisory System (PDAS)",
      'Industrial lighting and lighting solutions for buildings',
      'Supply, installation, testing and commissioning of transformers, HT, LT and AMF panels, D.G. sets and bus ducts',
      'Supply, installation and commissioning of rising mains',
      'Supply and erection of cable trays, supports and raceways for internal and external electrification',
      'Complete building automation systems',
      'Design, supply and erection of light fixtures for plants, mines, office blocks, roads and malls',
    ],
  },
  {
    slug: 'design',
    title: 'Design',
    summary:
      'Full design packages including engineering and drafting, from switchboards and ' +
      'starters to complete new electrical systems and refurbishments.',
    points: [
      'Complete design packages',
      'New build electrical system design (AC and DC)',
      'Refit electrical design',
      'Switchboard, starter and control panel design',
      'Alarm and monitoring system design',
      'Generator control system design',
      'Electrical power generation, protection and distribution design',
      'Electrical drafting service',
    ],
  },
  {
    slug: 'construction',
    title: 'Construction services',
    summary:
      'Construction, upgrade and renovation of industrial, shopping and residential ' +
      'places, together with partners across the world.',
    points: [],
  },
  {
    slug: 'hazardous-areas',
    title: 'Hazardous areas & explosive atmospheres',
    summary:
      'Trained and certified electricians for work in hazardous areas and explosive ' +
      'atmospheres.',
    points: ['Installations', 'Repairs and maintenance', 'Inspection, testing and reporting'],
  },
  {
    slug: 'manufacture',
    title: 'Manufacture',
    summary:
      'Products manufactured to your specific application, requirements and installed ' +
      'environment.',
    points: [
      'Switchboard and distribution board wiring, to a capacity of 1 MW',
      'Engine control systems (population and generator sets)',
      'Motor starter panel and control panel manufacturing',
      'Alarm and monitoring systems',
      'Earth fault monitoring systems',
      'Technical engraving — engraved panels and labels',
    ],
  },
  {
    slug: 'installation',
    title: 'Installation',
    summary:
      'From simple housing to complete plant reticulation on green or brown field sites, ' +
      'with attention to detail and system reliability.',
    points: [
      'Cable supply, installation and termination',
      'Complete electrical system installation',
      'Electrical power generation, protection and distribution installations',
      'Control system installations',
      'Air conditioning and refrigeration electrical systems',
    ],
  },
  {
    slug: 'maintenance',
    title: 'Maintenance & repair',
    summary:
      'Emergency and scheduled maintenance for domestic, manufacturing, construction, ' +
      'agriculture, and tobacco processing and warehousing clients.',
    points: [
      'Emergency response repairs, including fire damage',
      'Power generation, protection and distribution maintenance and repair',
      'Mechanical services',
      'Rotating machinery repair — generator, alternator, electric motor, fan',
      'Generator and alternator control system service and inspections',
    ],
  },
  {
    slug: 'labour-hire',
    title: 'Labour & hire',
    summary:
      'Skilled and experienced electrical personnel for routine work and emergency call ' +
      'out, all suitably qualified and licensed.',
    points: ['Project management', 'Supervision', 'Tradesmen'],
  },
  {
    slug: 'distributorship',
    title: 'Distributorship & products',
    summary:
      'Distributor for Cafca cable, Alvin Cable South Africa, SEW motorised gears and ' +
      'Challenge products.',
    points: [
      'Electrical control and monitoring systems',
      'Challenge motors and electrical accessories',
      'Switchboards, starters and panels — manufacturing and custom builds',
      'Fittings, fixtures and consumables — lights, power outlets',
      'Electrical spare parts and accessories',
      'GE and Siemens PLC systems',
      'Technical engraving — engraved panels and labels',
    ],
  },
  {
    slug: 'design-development',
    title: 'Design & development',
    summary:
      'A finished design is the result of a committee of qualified, experienced designers ' +
      'rather than one person, interfacing with the client throughout.',
    points: [],
  },
] as const

/** Strategic partners and exactly what each arrangement covers. */
export const partners = [
  {
    name: 'SEW Eurodrive',
    role: 'Exclusive distribution agent',
    body:
      'HA GROUP is an SEW exclusive distribution agent covering the whole range of power ' +
      'transmission — gearmotors, industrial gearboxes, IE3–5 motors, variable speed ' +
      'drives and related automation — in Zimbabwe through HPC Africa Pvt Ltd, and as a ' +
      'reseller in other countries in Southern Africa.',
  },
  {
    name: 'Optibelt',
    role: 'Distributor',
    body:
      'We distribute Optibelt power transmission V-belts that self-tension, with a life of ' +
      'three years working 24/7, in four countries in Southern Africa: Malawi, Mozambique, ' +
      'Zambia and Zimbabwe.',
  },
  {
    name: 'Optimised Power Products',
    role: 'Representative in Africa',
    body:
      'We represent Optimised Power Products for power factor correction in Africa. With ' +
      'energy poverty in many parts of Africa, energy savings are critical for every ' +
      'operation, primarily in countries where maximum demand is charged. Our units also ' +
      'save 15% diesel fuel when used with generators.',
  },
] as const

/** Named operating companies within the group. */
export const divisions = [
  { name: 'HPC TZ Engineers Ltd', country: 'Tanzania' },
  { name: 'HPC Africa Zimbabwe (Pvt) Ltd', country: 'Zimbabwe' },
  { name: 'HPC Africa SA (Pty) Ltd', country: 'South Africa' },
] as const

/**
 * Offices, exactly as published. Tanzania has two, which is why `offices` is a
 * list of locations rather than a map keyed by country.
 */
export const offices = [
  {
    country: 'South Africa',
    city: 'Johannesburg',
    address: '54 Andries Street, Wynberg, Sandton, Johannesburg, 2090',
    phones: ['+27 11 234 1838', '+27 63 187 8326'],
    isHeadOffice: true,
  },
  {
    country: 'Tanzania',
    city: 'Dar es Salaam',
    address: 'P.O. Box 11721, Upanga East, Dar es Salaam',
    phones: ['+255 78 217 1017', '+255 71 331 4704', '+255 68 249 3742'],
    isHeadOffice: false,
  },
  {
    country: 'Tanzania',
    city: 'Morogoro',
    address: 'Konga Street, P.O. Box 2370, Morogoro',
    phones: ['+255 71 501 1677', '+27 63 187 8326'],
    isHeadOffice: false,
  },
  {
    country: 'Zimbabwe',
    city: 'Harare',
    address: '34 Watts Road, New Ardbennie, P.O. Box 651, Southerton, Harare',
    phones: ['+263 4 621 264', '+263 4 621 364'],
    isHeadOffice: false,
  },
  {
    country: 'Zambia',
    city: 'Lusaka',
    address: '1344 Town Centre, Cairo Road, Lusaka',
    phones: ['+260 76 123 4797', '+27 63 187 8326'],
    isHeadOffice: false,
  },
  {
    country: 'Malawi',
    city: 'Lilongwe',
    address: '12/453 Chiyamba Drive, P.O. Box 1701, Lilongwe',
    phones: ['+265 99 997 5075', '+265 99 455 7936'],
    isHeadOffice: false,
  },
  {
    country: 'Mozambique',
    city: 'Tete',
    address: 'BF Manyanga, Unidade Armando Tivane, Cidade de Tete',
    phones: ['+258 84 388 1311', '+258 82 378 5079'],
    isHeadOffice: false,
  },
  {
    country: 'Botswana',
    city: 'Gaborone',
    address: 'Plot 19738, Gaborone West Phase II, Gaborone',
    phones: ['+267 72 255 013', '+27 63 187 8326'],
    isHeadOffice: false,
  },
  {
    country: 'United Kingdom',
    city: 'Southend-on-Sea',
    address: '44 Station Avenue, Southend-on-Sea, Essex, SS2 5EP',
    phones: ['+44 745 482 7272', '+44 793 688 7616'],
    isHeadOffice: false,
  },
] as const

/** Countries with an incorporated company, per the group overview. */
export const countries = [
  'Botswana',
  'Malawi',
  'Mozambique',
  'South Africa',
  'Tanzania',
  'United Kingdom',
  'Zambia',
  'Zimbabwe',
] as const

/**
 * The renewable energy line, published under "Green Growth Initiative".
 * Deliberately brief: the source page says little beyond the heading, and
 * padding it out would mean inventing capability claims.
 */
export const greenGrowth = {
  title: 'Green Growth Initiative',
  headline: 'Full solar farms, on and off grid',
  body:
    'HA GROUP designs and constructs solar and renewable energy installations alongside ' +
    'its conventional power work.',
} as const

/**
 * Completed work.
 *
 * Empty, and deliberately so. HA GROUP's published Past Work page lists only
 * category filters — Solar, Fabrication, Construction, Electricals,
 * Installations — with no projects behind them, and the only photographs on the
 * company's site are its logo and two partner marks; the rest is stock imagery
 * from the theme it was built with.
 *
 * Inventing a client, a site or a megawatt figure to fill this section would be
 * a claim HA GROUP could not stand behind the first time a prospective client
 * asked about it, so nothing is invented here. The `Project` shape below is what
 * the projects page renders; add real entries and the page and its navigation
 * link appear on their own.
 *
 * For each project the page needs: the client (or "confidential" where the
 * contract requires it), the country, what was actually done, the year, and at
 * least one photograph HA GROUP owns the rights to.
 */
export interface Project {
  slug: string
  title: string
  client: string
  country: string
  year: number
  category: 'Solar' | 'Fabrication' | 'Construction' | 'Electricals' | 'Installations'
  summary: string
  /** Paths under /public. Photographs HA GROUP owns; never stock imagery. */
  images: string[]
}

export const projects: Project[] = []
