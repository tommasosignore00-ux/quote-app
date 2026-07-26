import { supabaseAdmin } from './supabase-server';
import type { UniversalImportResult, UniversalParsedItem } from './listinoUniversalImport';

export const PRICING_RULE_PRESETS = [
  { rule_key: 'metal_ferrous', label: 'Ferro / acciaio', reference_unit: 'kg', keywords: ['ferro', 'acciaio', 'lamiera', 'trave'] },
  { rule_key: 'metal_nonferrous', label: 'Rame / metalli non ferrosi', reference_unit: 'kg', keywords: ['rame', 'ottone', 'alluminio'] },
  { rule_key: 'electric_cable', label: 'Cavi elettrici', reference_unit: 'm', keywords: ['cavo', 'guaina', 'corrugato'] },
  { rule_key: 'piping', label: 'Tubazioni / raccordi', reference_unit: 'm', keywords: ['tubo', 'raccordo', 'tubazioni'] },
  { rule_key: 'paint_chemical', label: 'Vernici / chimici', reference_unit: 'l', keywords: ['vernice', 'resina', 'smalto'] },
  { rule_key: 'wood_panel', label: 'Legno / pannelli', reference_unit: 'm2', keywords: ['legno', 'pannello', 'multistrato'] },
];

type ResolvedItem = UniversalParsedItem & {
  unit_price: number;
  pricing_source: 'file' | 'derived_reference' | 'reference_rule';
  pricing_status: 'resolved';
};

type UnresolvedItem = UniversalParsedItem & {
  pricing_source: 'needs_reference';
  pricing_status: 'needs_reference';
};

export type PricingDiagnostics = {
  resolvedFromFile: number;
  resolvedFromDerived: number;
  resolvedFromRule: number;
  unresolved: number;
  unresolvedExamples: string[];
  recommendedRules: Array<{
    rule_key: string;
    label: string;
    reference_unit: string;
    missingCount: number;
  }>;
};

export type PricingResolutionResult = {
  items: ResolvedItem[];
  unresolvedItems: UnresolvedItem[];
  diagnostics: PricingDiagnostics;
  summary: UniversalImportResult['summary'];
};

function presetForRuleKey(ruleKey: string | null | undefined) {
  return PRICING_RULE_PRESETS.find((preset) => preset.rule_key === ruleKey);
}

function normalizePricingText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function roundMoney(value: number): number {
  return Number(value.toFixed(6));
}

function splitReferenceKey(key: string): { ruleKey: string; referenceUnit: string } | null {
  const separatorIndex = key.lastIndexOf('::');
  if (separatorIndex <= 0) return null;

  return {
    ruleKey: key.slice(0, separatorIndex),
    referenceUnit: key.slice(separatorIndex + 2),
  };
}

function inferPresetRuleKey(item: UniversalParsedItem): string | null {
  const haystack = normalizePricingText([item.description, item.category].filter(Boolean).join(' '));
  if (!haystack) return null;

  for (const preset of PRICING_RULE_PRESETS) {
    if (preset.keywords.some((keyword) => haystack.includes(normalizePricingText(keyword)))) {
      return preset.rule_key;
    }
  }

  return null;
}

function findUniqueRuleForUnit(
  references: Map<string, number>,
  referenceUnit: string
): { ruleKey: string; price: number } | null {
  const matches = Array.from(references.entries())
    .map(([key, price]) => {
      const parsed = splitReferenceKey(key);
      if (!parsed) return null;
      return {
        ruleKey: parsed.ruleKey,
        referenceUnit: parsed.referenceUnit,
        price,
      };
    })
    .filter(
      (
        candidate
      ): candidate is {
        ruleKey: string;
        referenceUnit: string;
        price: number;
      } => Boolean(candidate && candidate.referenceUnit === referenceUnit)
    );

  if (matches.length !== 1) return null;
  return {
    ruleKey: matches[0].ruleKey,
    price: matches[0].price,
  };
}

function buildReferenceCandidates(items: UniversalParsedItem[]): Map<string, number> {
  const references = new Map<string, number>();
  const aggregations = new Map<string, { totalPricePerUnit: number; count: number }>();

  for (const item of items) {
    if (
      item.pricing_status !== 'resolved' ||
      !item.pricing_basis_unit ||
      !item.pricing_basis_quantity ||
      item.pricing_basis_quantity <= 0 ||
      item.unit_price <= 0
    ) {
      continue;
    }

    const key = `${item.inferred_rule_key || item.category || 'generic'}::${item.pricing_basis_unit}`;
    const current = aggregations.get(key) || { totalPricePerUnit: 0, count: 0 };
    current.totalPricePerUnit += item.unit_price / item.pricing_basis_quantity;
    current.count += 1;
    aggregations.set(key, current);
  }

  for (const [key, value] of aggregations.entries()) {
    if (value.count > 0) {
      references.set(key, roundMoney(value.totalPricePerUnit / value.count));
    }
  }

  return references;
}

async function loadStoredReferenceRules(profileId: string): Promise<Map<string, number>> {
  try {
    const { data: profileRules, error: profileError } = await supabaseAdmin
      .from('pricing_reference_rules')
      .select('rule_key, reference_unit, reference_price, active')
      .eq('profile_id', profileId)
      .eq('active', true);

    if (profileError) throw profileError;

    const { data: globalRules, error: globalError } = await supabaseAdmin
      .from('pricing_reference_rules')
      .select('rule_key, reference_unit, reference_price, active')
      .is('profile_id', null)
      .eq('active', true);

    if (globalError) throw globalError;

    return new Map(
      [...(globalRules || []), ...(profileRules || [])]
        .filter((row) => Number(row.reference_price) > 0)
        .map((row) => [`${row.rule_key}::${row.reference_unit}`, Number(row.reference_price)])
    );
  } catch {
    return new Map();
  }
}

function resolveWithReference(
  item: UniversalParsedItem,
  fileReferences: Map<string, number>,
  storedRules: Map<string, number>
): ResolvedItem | UnresolvedItem {
  if (item.pricing_status === 'resolved' && item.unit_price > 0) {
    const source =
      item.pricing_source === 'derived_reference' || item.pricing_source === 'reference_rule'
        ? item.pricing_source
        : 'file';
    return {
      ...item,
      unit_price: roundMoney(item.unit_price),
      pricing_source: source,
      pricing_status: 'resolved',
    };
  }

  if (!item.pricing_basis_unit || !item.pricing_basis_quantity || item.pricing_basis_quantity <= 0) {
    return {
      ...item,
      pricing_source: 'needs_reference',
      pricing_status: 'needs_reference',
    };
  }

  const inferredPresetRuleKey = inferPresetRuleKey(item);
  const lookupKeys = Array.from(
    new Set(
      [item.inferred_rule_key, inferredPresetRuleKey, item.category, 'generic']
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );

  for (const lookupKey of lookupKeys) {
    const referenceKey = `${lookupKey}::${item.pricing_basis_unit}`;
    const fileReference = fileReferences.get(referenceKey);
    if (fileReference && fileReference > 0) {
      return {
        ...item,
        inferred_rule_key: item.inferred_rule_key || inferredPresetRuleKey || null,
        unit_price: roundMoney(fileReference * item.pricing_basis_quantity),
        pricing_source: 'derived_reference',
        pricing_status: 'resolved',
      };
    }

    const storedReference = storedRules.get(referenceKey);
    if (storedReference && storedReference > 0) {
      return {
        ...item,
        inferred_rule_key: item.inferred_rule_key || inferredPresetRuleKey || lookupKey || null,
        unit_price: roundMoney(storedReference * item.pricing_basis_quantity),
        pricing_source: 'reference_rule',
        pricing_status: 'resolved',
      };
    }
  }

  const uniqueStoredRule = findUniqueRuleForUnit(storedRules, item.pricing_basis_unit);
  if (uniqueStoredRule && uniqueStoredRule.price > 0) {
    return {
      ...item,
      inferred_rule_key: item.inferred_rule_key || inferredPresetRuleKey || uniqueStoredRule.ruleKey,
      unit_price: roundMoney(uniqueStoredRule.price * item.pricing_basis_quantity),
      pricing_source: 'reference_rule',
      pricing_status: 'resolved',
    };
  }

  return {
    ...item,
    pricing_source: 'needs_reference',
    pricing_status: 'needs_reference',
  };
}

export async function resolveImportPricing(params: {
  profileId: string;
  parsed: UniversalImportResult;
}): Promise<PricingResolutionResult> {
  const fileReferences = buildReferenceCandidates(params.parsed.items);
  const storedRules = await loadStoredReferenceRules(params.profileId);

  const resolvedItems: ResolvedItem[] = [];
  const unresolvedItems: UnresolvedItem[] = [];

  for (const item of params.parsed.items) {
    const resolved = resolveWithReference(item, fileReferences, storedRules);
    if (resolved.pricing_status === 'resolved') {
      resolvedItems.push(resolved);
    } else {
      unresolvedItems.push(resolved);
    }
  }

  return {
    items: resolvedItems,
    unresolvedItems,
    diagnostics: {
      resolvedFromFile: resolvedItems.filter((item) => item.pricing_source === 'file').length,
      resolvedFromDerived: resolvedItems.filter((item) => item.pricing_source === 'derived_reference').length,
      resolvedFromRule: resolvedItems.filter((item) => item.pricing_source === 'reference_rule').length,
      unresolved: unresolvedItems.length,
      unresolvedExamples: unresolvedItems.slice(0, 5).map((item) => item.description),
      recommendedRules: Array.from(
        unresolvedItems.reduce((acc, item) => {
          const ruleKey = item.inferred_rule_key || 'generic';
          const preset = presetForRuleKey(ruleKey);
          const label = preset?.label || item.category || 'Regola personalizzata';
          const referenceUnit = item.pricing_basis_unit || preset?.reference_unit || 'pcs';
          const key = `${ruleKey}::${referenceUnit}`;
          acc.set(key, {
            rule_key: ruleKey,
            label,
            reference_unit: referenceUnit,
            missingCount: (acc.get(key)?.missingCount || 0) + 1,
          });
          return acc;
        }, new Map<string, { rule_key: string; label: string; reference_unit: string; missingCount: number }>())
      )
        .map(([, value]) => value)
        .sort((a, b) => b.missingCount - a.missingCount)
        .slice(0, 5),
    },
    summary: {
      ...params.parsed.summary,
      parsedRows: resolvedItems.length,
      pendingReferenceRows: unresolvedItems.length,
    },
  };
}
