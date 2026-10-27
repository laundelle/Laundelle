/**
 * Comprehensive UK Postcode Utilities
 * Conforms to British Standard BS 7666 postal addressing format.
 *
 * Provides exact district matching, sector matching, and full postcode validation.
 * Prevents overlapping prefix errors (e.g. PR1 vs PR10, PR11, PR22, PR2A, PR29).
 */

// Full UK Postcode pattern: 1-2 letters, 1-2 digits or 1 digit + letter, space, 1 digit, 2 letters
// Special case: National Girobank "GIR 0AA"
export const UK_POSTCODE_REGEX = /^([A-Z]{1,2}[0-9][A-Z0-9]?)\s*([0-9][A-Z]{2})$/i;
export const UK_GIRO_REGEX = /^(GIR)\s*(0AA)$/i;

// Outward code (district) pattern: e.g. PR1, PR10, SW1A, M1, EC1A, B33, GIR
export const UK_OUTWARD_CODE_REGEX = /^([A-Z]{1,2}[0-9][A-Z0-9]?|GIR)$/i;

// Sector pattern: e.g. "PR1 4", "SW1A 1", "M1 1"
export const UK_SECTOR_REGEX = /^([A-Z]{1,2}[0-9][A-Z0-9]?|GIR)\s*([0-9])$/i;

export interface ParsedUkPostcode {
  full: string;
  outward: string;
  sector: string;
  inward: string;
  isValidFull: boolean;
  isValidOutward: boolean;
}

/**
 * Validates whether a raw string is a valid full UK postcode (e.g. "PR1 4UD", "SW1A 1AA", "M1 1AA").
 * Case and whitespace insensitive.
 */
export function isValidUkPostcode(raw: string | undefined | null): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  return UK_POSTCODE_REGEX.test(trimmed) || UK_GIRO_REGEX.test(trimmed);
}

/**
 * Validates whether a raw string is a valid UK outward code / district (e.g. "PR1", "PR10", "SW1A", "M1").
 */
export function isValidUkOutwardCode(raw: string | undefined | null): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const trimmed = raw.trim().replace(/\s+/g, '');
  return UK_OUTWARD_CODE_REGEX.test(trimmed);
}

/**
 * Validates whether a string is either a valid full postcode or a valid outward code / district.
 */
export function isValidUkPostcodeOrDistrict(raw: string | undefined | null): boolean {
  return isValidUkPostcode(raw) || isValidUkOutwardCode(raw);
}

/**
 * Formats a UK postcode into standard canonical form ("OUTWARD INWARD" or "OUTWARD").
 * e.g. "pr14ud" -> "PR1 4UD", "  sw1a  1aa " -> "SW1A 1AA", "pr1" -> "PR1"
 */
export function normalizeUkPostcode(raw: string | undefined | null): string {
  if (!raw || typeof raw !== 'string') return '';
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!cleaned) return '';

  if (cleaned === 'GIR0AA') return 'GIR 0AA';

  // If full postcode format
  const fullMatch = cleaned.match(/^([A-Z]{1,2}[0-9][A-Z0-9]?)([0-9][A-Z]{2})$/);
  if (fullMatch) {
    return `${fullMatch[1]} ${fullMatch[2]}`;
  }

  // If already spaced properly
  const spacedMatch = raw.trim().toUpperCase().match(/^([A-Z]{1,2}[0-9][A-Z0-9]?)\s+([0-9][A-Z]{2})$/);
  if (spacedMatch) {
    return `${spacedMatch[1]} ${spacedMatch[2]}`;
  }

  // Return cleaned outward code or cleaned string
  return cleaned;
}

/**
 * Parses any UK postcode input (full postcode, outward code, or text containing postcode).
 */
export function parseUkPostcode(raw: string | undefined | null): ParsedUkPostcode | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed) return null;

  // 1. Direct match for Full Postcode
  const fullMatch = trimmed.match(UK_POSTCODE_REGEX) || trimmed.match(UK_GIRO_REGEX);
  if (fullMatch) {
    const outward = fullMatch[1].toUpperCase();
    const inward = fullMatch[2].toUpperCase();
    const full = `${outward} ${inward}`;
    const sector = `${outward} ${inward.charAt(0)}`;
    return {
      full,
      outward,
      sector,
      inward,
      isValidFull: true,
      isValidOutward: true,
    };
  }

  // 1b. Check without spaces (e.g. "PR14UD" or "PR102AB")
  const compact = trimmed.replace(/\s+/g, '');
  const compactMatch = compact.match(/^([A-Z]{1,2}[0-9][A-Z0-9]?)([0-9][A-Z]{2})$/);
  if (compactMatch) {
    const outward = compactMatch[1].toUpperCase();
    const inward = compactMatch[2].toUpperCase();
    const full = `${outward} ${inward}`;
    const sector = `${outward} ${inward.charAt(0)}`;
    return {
      full,
      outward,
      sector,
      inward,
      isValidFull: true,
      isValidOutward: true,
    };
  }

  // 2. Direct match for Outward Code only (e.g. "PR1", "PR10", "SW1A")
  if (UK_OUTWARD_CODE_REGEX.test(compact)) {
    return {
      full: compact,
      outward: compact,
      sector: compact,
      inward: '',
      isValidFull: false,
      isValidOutward: true,
    };
  }

  // 3. Extraction from full address or text string
  const embeddedFull = trimmed.match(/\b([A-Z]{1,2}[0-9][A-Z0-9]?)\s*([0-9][A-Z]{2})\b/);
  if (embeddedFull) {
    const outward = embeddedFull[1].toUpperCase();
    const inward = embeddedFull[2].toUpperCase();
    const full = `${outward} ${inward}`;
    const sector = `${outward} ${inward.charAt(0)}`;
    return {
      full,
      outward,
      sector,
      inward,
      isValidFull: true,
      isValidOutward: true,
    };
  }

  // 4. Embedded outward code only (boundary matching)
  const embeddedOutward = trimmed.match(/\b([A-Z]{1,2}[0-9][A-Z0-9]?)\b/);
  if (embeddedOutward && UK_OUTWARD_CODE_REGEX.test(embeddedOutward[1])) {
    const out = embeddedOutward[1].toUpperCase();
    return {
      full: out,
      outward: out,
      sector: out,
      inward: '',
      isValidFull: false,
      isValidOutward: true,
    };
  }

  return null;
}

/**
 * Extracts the outward code (district) from any string, postcode, or address.
 * Never incorrectly returns street house numbers or partial prefixes.
 */
export function extractOutwardCode(raw: string | undefined | null): string {
  if (!raw) return '';
  const parsed = parseUkPostcode(raw);
  if (parsed?.outward) {
    return parsed.outward;
  }
  const cleaned = String(raw).trim().toUpperCase().replace(/\s+/g, '');
  if (cleaned.length <= 4 && UK_OUTWARD_CODE_REGEX.test(cleaned)) {
    return cleaned;
  }
  return '';
}

/**
 * EXACT SERVICE AREA POSTCODE MATCHING ENGINE
 *
 * Evaluates whether a customer's candidate postcode is covered by a list of configured service areas.
 *
 * Rules:
 * - Exact district matching: "PR1" matches "PR1 4UD", "PR14UD", and "PR1".
 * - Overlap prevention: "PR1" NEVER matches "PR10 2AB", "PR11", "PR22", "PR2A", "PR29".
 * - Sector matching: "PR1 4" matches "PR1 4UD", but NOT "PR1 5AB".
 * - Exact full postcode: "PR1 4UD" matches "PR1 4UD", but NOT "PR1 4UE".
 */
export function isPostcodeInServiceArea(
  candidateRaw: string | undefined | null,
  serviceAreas: string[] = []
): boolean {
  if (!candidateRaw || !serviceAreas || serviceAreas.length === 0) return false;

  const candidate = parseUkPostcode(candidateRaw);
  if (!candidate) return false;

  const candidateDistrict = candidate.outward.toUpperCase();
  const candidateSector = candidate.sector.toUpperCase();
  const candidateFull = candidate.full.toUpperCase();

  for (const rawArea of serviceAreas) {
    if (!rawArea || typeof rawArea !== 'string') continue;
    const cleanArea = rawArea.trim().toUpperCase();
    if (!cleanArea) continue;

    const parsedArea = parseUkPostcode(cleanArea);
    if (!parsedArea) {
      // Fallback simple comparison if unparseable
      const compactArea = cleanArea.replace(/\s+/g, '');
      if (candidateDistrict === compactArea || candidateFull.replace(/\s+/g, '') === compactArea) {
        return true;
      }
      continue;
    }

    // 1. Service area is an Outward Code / District (e.g. "PR1", "PR2", "SW1A", "M1")
    // When no space exists in the service area definition, it is a district assignment.
    if (parsedArea.isValidOutward && (!parsedArea.isValidFull || !cleanArea.includes(' '))) {
      if (candidateDistrict === parsedArea.outward) {
        return true;
      }
      continue;
    }

    // 2. Service area is a Sector (e.g. "PR1 4", "SW1A 1")
    if (cleanArea.includes(' ') && cleanArea.length <= 6) {
      const normalizedAreaSector = normalizeUkPostcode(cleanArea);
      if (candidateSector === normalizedAreaSector || candidateSector === cleanArea) {
        return true;
      }
      continue;
    }

    // 3. Service area is a Full Postcode (e.g. "PR1 4UD")
    if (parsedArea.isValidFull) {
      if (candidateFull === parsedArea.full) {
        return true;
      }
      continue;
    }

    // Fallback exact district equality
    if (candidateDistrict === parsedArea.outward) {
      return true;
    }
  }

  return false;
}

/**
 * Builds a strict MongoDB RegExp that matches ONLY the specified district without false prefix matches.
 * For example:
 * buildPostcodeDistrictRegex('PR1')
 * Matches: 'PR1 4UD', 'PR14UD', 'PR1'
 * Does NOT match: 'PR10 2AB', 'PR11 3CD', 'PR12 4EF', 'PR22 3BH', 'PR2A 1AA', 'PR29 4UD'
 */
export function buildPostcodeDistrictRegex(district: string): RegExp {
  const clean = district.trim().toUpperCase().replace(/\s+/g, '');
  // Matches clean district followed by:
  // 1. Whitespace and optional chars (e.g. "PR1 4UD")
  // 2. Inward code digit + 2 letters (e.g. "PR14UD")
  // 3. End of string (e.g. "PR1")
  // 4. Word boundary
  return new RegExp(`^${clean}(\\s+.*|[0-9][A-Z]{2}|$|\\b)`, 'i');
}

/**
 * Builds an address text search RegExp bounded to word boundaries for a specific district.
 * Matches: "... Preston, PR1 4UD" or "... PR1"
 * Does NOT match: "... PR10 2AB"
 */
export function buildAddressDistrictRegex(district: string): RegExp {
  const clean = district.trim().toUpperCase().replace(/\s+/g, '');
  return new RegExp(`\\b${clean}(\\s*[0-9][A-Z]{2}\\b|\\s.*\\b|\\b)(?!\\d|[A-Z])`, 'i');
}

/**
 * Convenience matcher checking if a candidate postcode matches an area or array of areas.
 */
export function matchesPostcode(candidateRaw: string | undefined | null, serviceAreas: string | string[]): boolean {
  if (!serviceAreas) return false;
  const areas = Array.isArray(serviceAreas) ? serviceAreas : [serviceAreas];
  return isPostcodeInServiceArea(candidateRaw, areas);
}
