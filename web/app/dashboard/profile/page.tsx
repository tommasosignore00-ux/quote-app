'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { COUNTRIES, LANGUAGES, LEGAL_FRAMEWORKS } from '@/lib/constants';
import toast from 'react-hot-toast';
import { setLanguage } from '@/lib/language';
import TemplateUploader from '@/components/TemplateUploader';
import { formatIBAN, getFiscalConfig, US_STATE_TAX_RATES, validateIBAN } from '@/lib/fiscal-utils';

type ProfileData = Record<string, any>;
type CommandMapping = Record<string, any>;
type TeamMember = Record<string, any>;
type WebhookEndpoint = Record<string, any>;

const TEAM_MEMBERS_INCLUDED = 5;
const EXTRA_MEMBER_PRICE = 7.99;
const WEBHOOK_EVENT_OPTIONS = [
  'quote.created',
  'quote.sent',
  'quote.approved',
  'client.created',
  'job.created',
  'subscription.changed',
];

const TEAM_PERMISSIONS: Record<string, Record<string, boolean>> = {
  admin: {
    can_create_quotes: true,
    can_edit_quotes: true,
    can_manage_clients: true,
    can_manage_listini: true,
    can_view_reports: true,
  },
  technician: {
    can_create_quotes: true,
    can_edit_quotes: true,
    can_manage_clients: false,
    can_manage_listini: false,
    can_view_reports: false,
  },
  readonly: {
    can_create_quotes: false,
    can_edit_quotes: false,
    can_manage_clients: false,
    can_manage_listini: false,
    can_view_reports: true,
  },
};

const TABS = ['profilo', 'automazioni', 'team', 'privacy'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  profilo: 'Profilo',
  automazioni: 'Automazioni',
  team: 'Team',
  privacy: 'Privacy',
};

const TAB_ICONS: Record<Tab, string> = {
  profilo: '👤',
  automazioni: '⚙️',
  team: '👥',
  privacy: '🔒',
};

export default function ProfilePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('profilo');
  const [profile, setProfile] = useState<ProfileData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [commandMappings, setCommandMappings] = useState<CommandMapping[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('technician');
  const [newMappingInput, setNewMappingInput] = useState('');
  const [newMappingOutput, setNewMappingOutput] = useState('');
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookDescription, setNewWebhookDescription] = useState('');
  const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>(['quote.approved']);
  const [usState, setUsState] = useState('');

  const fiscalConfig = useMemo(
    () => getFiscalConfig(String(profile.country_code || 'IT')),
    [profile.country_code]
  );

  const subscriptionStatus = String(profile.subscription_status || 'inactive');
  const hasWebhookAccess = subscriptionStatus === 'active' || subscriptionStatus === 'team';
  const isTeamPlan = subscriptionStatus === 'team' || Boolean(profile.team_plan);
  const legalFramework = LEGAL_FRAMEWORKS[String(profile.country_code || 'IT')] || 'GDPR';

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth/login');
        return;
      }

      const [profileResult, mappingsResult, teamResult, webhooksResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase
          .from('user_command_mappings')
          .select('*')
          .eq('profile_id', user.id)
          .order('usage_count', { ascending: false })
          .limit(50),
        supabase
          .from('team_members')
          .select('*, member:member_id(email, company_name)')
          .eq('team_owner_id', user.id)
          .eq('active', true),
        supabase.from('webhook_endpoints').select('*').eq('profile_id', user.id).order('created_at', { ascending: false }),
      ]);

      if (profileResult.error) {
        toast.error(profileResult.error.message);
      }
      if (profileResult.data) {
        setProfile(profileResult.data);
        setUsState(String(profileResult.data.us_state || ''));
      }

      if (mappingsResult.data) setCommandMappings(mappingsResult.data);
      if (teamResult.data) setTeamMembers(teamResult.data);
      if (webhooksResult.data) setWebhooks(webhooksResult.data);

      setLoading(false);
    };
    load();
  }, [router]);

  /* ── Handlers ── */

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const iban = String(profile.iban || '').trim();
    if (iban) {
      const ibanValidation = validateIBAN(iban);
      if (!ibanValidation.valid) {
        toast.error(ibanValidation.error || 'IBAN non valido');
        return;
      }
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('messages.notAuthenticated'));

      const fiscalFieldValues = Object.fromEntries(
        fiscalConfig.fields.map((field) => [field.key, profile[field.key] || null])
      );

      const { error } = await supabase.from('profiles').update({
        company_name: profile.company_name,
        vat_number: profile.vat_number,
        vat_percent: profile.vat_percent ?? 22,
        material_markup_vat_percent: profile.material_markup_vat_percent || 0,
        fiscal_code: profile.fiscal_code,
        country_code: profile.country_code,
        language: profile.language,
        address: profile.address,
        city: profile.city,
        postal_code: profile.postal_code,
        iban: iban ? formatIBAN(iban) : null,
        swift_bic: profile.swift_bic,
        us_state: usState || null,
        ...fiscalFieldValues,
        updated_at: new Date().toISOString(),
      }).eq('id', user.id);

      if (error) throw error;

      setProfile((current) => ({
        ...current,
        iban: iban ? formatIBAN(iban) : '',
        us_state: usState || null,
      }));

      if (profile.language && profile.language !== i18n.language) {
        await setLanguage(String(profile.language));
      }
      toast.success(t('messages.saved'));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddMapping = async () => {
    if (!newMappingInput.trim() || !newMappingOutput.trim()) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('messages.notAuthenticated'));

      const payload = {
        profile_id: user.id,
        input_text: newMappingInput.trim(),
        mapped_text: newMappingOutput.trim(),
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('user_command_mappings')
        .upsert(payload, { onConflict: 'profile_id,input_text' })
        .select('*')
        .single();

      if (error) throw error;

      setCommandMappings((current) => {
        const next = current.filter((item) => item.id !== data.id && item.input_text !== data.input_text);
        return [data, ...next].sort((left, right) => (right.usage_count || 0) - (left.usage_count || 0));
      });
      setNewMappingInput('');
      setNewMappingOutput('');
      toast.success('Mappatura salvata');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDeleteMapping = async (id: string) => {
    const { error } = await supabase.from('user_command_mappings').delete().eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setCommandMappings((current) => current.filter((mapping) => mapping.id !== id));
  };

  const handleInviteMember = async () => {
    if (!inviteEmail.trim()) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('messages.notAuthenticated'));

      const { data: invitedProfile, error: invitedProfileError } = await supabase
        .from('profiles')
        .select('id, email, company_name')
        .eq('email', inviteEmail.trim())
        .maybeSingle();

      if (invitedProfileError) throw invitedProfileError;
      if (!invitedProfile) throw new Error('L\'utente deve prima registrarsi');

      const { data, error } = await supabase
        .from('team_members')
        .insert({
          team_owner_id: user.id,
          member_id: invitedProfile.id,
          role: inviteRole,
          permissions: TEAM_PERMISSIONS[inviteRole] || TEAM_PERMISSIONS.readonly,
        })
        .select('*, member:member_id(email, company_name)')
        .single();

      if (error) throw error;

      const nextTeamMembers = [...teamMembers, data];
      const extraMembers = Math.max(0, nextTeamMembers.length - TEAM_MEMBERS_INCLUDED);
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ extra_team_members: extraMembers })
        .eq('id', user.id);

      if (profileError) throw profileError;

      setTeamMembers(nextTeamMembers);
      setProfile((current) => ({ ...current, extra_team_members: extraMembers }));
      setInviteEmail('');
      toast.success('Membro aggiunto al team');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleRemoveTeamMember = async (id: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('messages.notAuthenticated'));

      const { error } = await supabase.from('team_members').update({ active: false }).eq('id', id);
      if (error) throw error;

      const nextTeamMembers = teamMembers.filter((member) => member.id !== id);
      const extraMembers = Math.max(0, nextTeamMembers.length - TEAM_MEMBERS_INCLUDED);
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ extra_team_members: extraMembers })
        .eq('id', user.id);

      if (profileError) throw profileError;

      setTeamMembers(nextTeamMembers);
      setProfile((current) => ({ ...current, extra_team_members: extraMembers }));
      toast.success('Membro rimosso');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const toggleWebhookEvent = (event: string) => {
    setNewWebhookEvents((current) =>
      current.includes(event) ? current.filter((item) => item !== event) : [...current, event]
    );
  };

  const handleAddWebhook = async () => {
    if (!newWebhookUrl.trim()) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('messages.notAuthenticated'));

      const { data, error } = await supabase
        .from('webhook_endpoints')
        .insert({
          profile_id: user.id,
          url: newWebhookUrl.trim(),
          description: newWebhookDescription.trim() || null,
          events: newWebhookEvents,
          secret: crypto.randomUUID(),
          active: true,
        })
        .select('*')
        .single();

      if (error) throw error;

      setWebhooks((current) => [data, ...current]);
      setNewWebhookUrl('');
      setNewWebhookDescription('');
      setNewWebhookEvents(['quote.approved']);
      toast.success('Webhook aggiunto');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    const { error } = await supabase.from('webhook_endpoints').delete().eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setWebhooks((current) => current.filter((webhook) => webhook.id !== id));
  };

  const handleExportMyData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('messages.notAuthenticated'));

      const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      const { data: clients } = await supabase.from('clienti').select('*').eq('profile_id', user.id);
      const { data: jobs } = await supabase.from('lavori').select('*').eq('profile_id', user.id);
      const jobIds = (jobs || []).map((job) => job.id);
      const { data: quotes } = jobIds.length
        ? await supabase.from('preventivi_dettaglio').select('*').in('lavoro_id', jobIds)
        : { data: [] };

      const payload = {
        exportedAt: new Date().toISOString(),
        profile: profileData,
        clients: clients || [],
        jobs: jobs || [],
        quotes: quotes || [],
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'quoteapp-my-data.json';
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success('Esportazione completata');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm('Tutti i dati verranno cancellati in modo permanente. Continuare?');
    if (!confirmed) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('messages.notAuthenticated'));

      const { error } = await supabase.from('profiles').delete().eq('id', user.id);
      if (error) throw error;

      await supabase.auth.signOut();
      router.push('/auth/login');
      toast.success('Account eliminato');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (loading) return <div className="p-6">{t('messages.loading')}</div>;

  /* ── Tab content renderers ── */

  const renderProfilo = () => (
    <div className="space-y-6">
      {/* Dati aziendali */}
      <form onSubmit={handleSave} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Dati aziendali</h2>
          <p className="mt-1 text-sm text-slate-500">Informazioni usate nei preventivi e nelle fatture.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium text-slate-700">
            <span>{t('profile.company')}</span>
            <input
              type="text"
              value={String(profile.company_name || '')}
              onChange={(e) => setProfile({ ...profile, company_name: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-700">
            <span>{t('profile.country')}</span>
            <select
              value={String(profile.country_code || 'IT')}
              onChange={(e) => {
                const nextCountry = e.target.value;
                const countryInfo = COUNTRIES.find((country) => country.code === nextCountry);
                setProfile({
                  ...profile,
                  country_code: nextCountry,
                  vat_percent: countryInfo?.vatDefault ?? fiscalConfig.defaultVatRate,
                });
                if (nextCountry !== 'US') setUsState('');
              }}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            >
              {COUNTRIES.map((country) => (
                <option key={country.code} value={country.code}>{country.name}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-700">
            <span>{t('profile.language')}</span>
            <select
              value={String(profile.language || 'it')}
              onChange={(e) => setProfile({ ...profile, language: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            >
              {LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>{language.name}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-700">
            <span>{t('profile.vatPercent') || 'IVA %'}</span>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={String(profile.vat_percent ?? fiscalConfig.defaultVatRate)}
              onChange={(e) => setProfile({ ...profile, vat_percent: parseFloat(e.target.value || '0') })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-700">
            <span>{t('profile.materialMarkupVAT') || 'IVA ricarico materiali %'}</span>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              value={String(profile.material_markup_vat_percent || 0)}
              onChange={(e) => setProfile({ ...profile, material_markup_vat_percent: parseFloat(e.target.value || '0') })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
        </div>

        {/* Campi fiscali dinamici */}
        {fiscalConfig.fields.length > 0 && (
          <>
            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-slate-700">Dati fiscali ({String(profile.country_code || 'IT')})</h3>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {fiscalConfig.fields.map((field) => (
                <label key={field.key} className="space-y-1 text-sm font-medium text-slate-700">
                  <span>{field.label}{field.required ? ' *' : ''}</span>
                  <input
                    type="text"
                    value={String(profile[field.key] || '')}
                    placeholder={field.placeholder}
                    onChange={(e) => setProfile({ ...profile, [field.key]: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  />
                </label>
              ))}
            </div>
          </>
        )}

        {String(profile.country_code || 'IT') === 'US' && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>Stato USA</span>
                <select
                  value={usState}
                  onChange={(e) => setUsState(e.target.value)}
                  className="w-full rounded-lg border border-amber-200 px-3 py-2"
                >
                  <option value="">Seleziona uno stato</option>
                  {Object.entries(US_STATE_TAX_RATES).map(([stateCode, taxRate]) => (
                    <option key={stateCode} value={stateCode}>{stateCode} • {taxRate}%</option>
                  ))}
                </select>
              </label>
              <div className="rounded-lg bg-white p-3 text-sm text-slate-600">
                L&apos;aliquota predefinita dipende dallo stato selezionato e viene usata nei preventivi web.
              </div>
            </div>
          </div>
        )}

        {fiscalConfig.reverseChargeAvailable && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            Reverse charge disponibile per clienti intra-UE.
          </div>
        )}

        {/* Indirizzo e pagamento */}
        <div className="border-t border-slate-100 pt-4">
          <h3 className="text-sm font-semibold text-slate-700">Indirizzo e dati bancari</h3>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium text-slate-700 md:col-span-2">
            <span>{t('messages.address')}</span>
            <input
              type="text"
              value={String(profile.address || '')}
              onChange={(e) => setProfile({ ...profile, address: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-700">
            <span>{t('messages.city')}</span>
            <input
              type="text"
              value={String(profile.city || '')}
              onChange={(e) => setProfile({ ...profile, city: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-700">
            <span>{t('messages.postalCode')}</span>
            <input
              type="text"
              value={String(profile.postal_code || '')}
              onChange={(e) => setProfile({ ...profile, postal_code: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-700">
            <span>{t('profile.iban')}</span>
            <input
              type="text"
              value={String(profile.iban || '')}
              onChange={(e) => setProfile({ ...profile, iban: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
              placeholder="IT60X0542811101000000123456"
            />
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-700">
            <span>SWIFT/BIC</span>
            <input
              type="text"
              value={String(profile.swift_bic || '')}
              onChange={(e) => setProfile({ ...profile, swift_bic: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
              placeholder="UNCRITMM"
            />
          </label>
        </div>

        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? t('messages.saving') : t('messages.save')}
        </button>
      </form>

      {/* Template */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Template preventivo</h2>
        <p className="mt-1 text-sm text-slate-500">Template HTML personalizzato per le esportazioni.</p>
        <div className="mt-4">
          <TemplateUploader />
        </div>
      </section>
    </div>
  );

  const renderAutomazioni = () => (
    <div className="space-y-6">
      {/* Mappature comandi */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t('automations.commandMappings')}</h2>
            <p className="text-sm text-slate-500">{t('automations.commandMappingsDesc')}</p>
          </div>
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {commandMappings.length} {t('automations.saved')}
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <input
            type="text"
            value={newMappingInput}
            onChange={(e) => setNewMappingInput(e.target.value)}
            placeholder={t('automations.originalInput')}
            className="w-full rounded-lg border border-slate-200 px-3 py-2"
          />
          <input
            type="text"
            value={newMappingOutput}
            onChange={(e) => setNewMappingOutput(e.target.value)}
            placeholder={t('automations.correctedText')}
            className="w-full rounded-lg border border-slate-200 px-3 py-2"
          />
          <button type="button" onClick={handleAddMapping} className="btn-primary whitespace-nowrap">{t('automations.add')}</button>
        </div>

        <div className="mt-4 space-y-3">
          {commandMappings.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">{t('automations.noMappings')}</div>
          )}
          {commandMappings.map((mapping) => (
            <div key={mapping.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">{mapping.input_text} → {mapping.mapped_text}</p>
                <p className="text-xs text-slate-500">{t('automations.usedTimes', { count: mapping.usage_count || 0 })}</p>
              </div>
              <button type="button" onClick={() => handleDeleteMapping(mapping.id)} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50">
                {t('dashboard.delete')}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Webhooks */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t('automations.webhooks')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('automations.webhooksDesc')}</p>
        </div>

        {hasWebhookAccess ? (
          <>
            <div className="mt-4 grid gap-3">
              <input
                type="url"
                value={newWebhookUrl}
                onChange={(e) => setNewWebhookUrl(e.target.value)}
                placeholder={t('automations.webhookUrl')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              />
              <input
                type="text"
                value={newWebhookDescription}
                onChange={(e) => setNewWebhookDescription(e.target.value)}
                placeholder={t('automations.description')}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
              />
              <div className="flex flex-wrap gap-2">
                {WEBHOOK_EVENT_OPTIONS.map((event) => {
                  const active = newWebhookEvents.includes(event);
                  return (
                    <button
                      key={event}
                      type="button"
                      onClick={() => toggleWebhookEvent(event)}
                      className={`rounded-full border px-3 py-1 text-sm transition ${active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-400'}`}
                    >
                      {event}
                    </button>
                  );
                })}
              </div>
              <button type="button" onClick={handleAddWebhook} className="btn-primary">{t('automations.addWebhook')}</button>
            </div>

            <div className="mt-4 space-y-3">
              {webhooks.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">{t('automations.noWebhooks')}</div>
              )}
              {webhooks.map((webhook) => (
                <div key={webhook.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-3">
                    <div>
                      <p className="text-sm font-medium break-all text-slate-900">{webhook.url}</p>
                      <p className="mt-1 text-xs text-slate-500">{webhook.description || 'Senza descrizione'}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(webhook.events || []).map((event: string) => (
                        <span key={event} className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">{event}</span>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-500">{t('automations.secret')} {webhook.secret ? `${String(webhook.secret).slice(0, 8)}…` : t('automations.notSet')}</p>
                      <button type="button" onClick={() => handleDeleteWebhook(webhook.id)} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50">
                        {t('dashboard.delete')}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-6 text-center">
            <p className="text-sm text-slate-500">{t('automations.unlockWebhooks')}</p>
            <button type="button" onClick={() => router.push('/dashboard/subscription')} className="mt-3 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50">
              {t('automations.goToSubscription')}
            </button>
          </div>
        )}
      </section>
    </div>
  );

  const renderTeam = () => (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t('team.teamManagement')}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {isTeamPlan
                ? t('team.membersIncluded', { count: teamMembers.length, total: TEAM_MEMBERS_INCLUDED }) + (teamMembers.length > TEAM_MEMBERS_INCLUDED ? ` · ${t('team.extraMembers', { count: teamMembers.length - TEAM_MEMBERS_INCLUDED, price: EXTRA_MEMBER_PRICE })}` : '')
                : t('team.upgradeToPro')}
            </p>
          </div>
        </div>

        {isTeamPlan ? (
          <>
            <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">{t('team.inviteLabel')}</h3>
              <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder={t('team.email')}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2"
                >
                  <option value="admin">{t('team.roleAdmin')}</option>
                  <option value="technician">{t('team.roleTechnician')}</option>
                  <option value="readonly">{t('team.roleReadonly')}</option>
                </select>
                <button type="button" onClick={handleInviteMember} className="btn-primary whitespace-nowrap">{t('team.invite')}</button>
              </div>
            </div>

            {teamMembers.length > TEAM_MEMBERS_INCLUDED && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                {t('team.teamCost', { cost: ((teamMembers.length - TEAM_MEMBERS_INCLUDED) * EXTRA_MEMBER_PRICE).toFixed(2) })}
              </div>
            )}

            <div className="mt-4 space-y-3">
              {teamMembers.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Nessun membro attivo nel team.</div>
              )}
              {teamMembers.map((member) => (
                <div key={member.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-4">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{member.member?.company_name || member.member?.email || 'Utente team'}</p>
                    <p className="text-xs uppercase tracking-wide text-slate-500">{member.role}</p>
                  </div>
                  <button type="button" onClick={() => handleRemoveTeamMember(member.id)} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50">
                    {t('team.remove')}
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-6 text-center">
            <p className="text-sm text-slate-500">Attiva il piano Team per invitare collaboratori.</p>
            <button type="button" onClick={() => router.push('/dashboard/subscription')} className="mt-3 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50">
              {t('automations.goToSubscription')}
            </button>
          </div>
        )}
      </section>
    </div>
  );

  const renderPrivacy = () => (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t('privacy.title')} e dati personali</h2>
          <p className="mt-1 text-sm text-slate-500">Framework legale attivo: <span className="font-medium">{legalFramework}</span></p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <button type="button" onClick={handleExportMyData} className="rounded-xl border border-slate-200 p-5 text-left transition hover:border-slate-300 hover:shadow-sm">
            <span className="block text-sm font-semibold text-slate-900">📦 {t('privacy.exportMyData')}</span>
            <span className="mt-2 block text-sm text-slate-500">Scarica profilo, clienti, lavori e righe di preventivo in formato JSON.</span>
          </button>
          <button type="button" onClick={handleDeleteAccount} className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-left transition hover:border-rose-300 hover:shadow-sm">
            <span className="block text-sm font-semibold text-rose-700">🗑️ {t('privacy.deleteMyAccount')}</span>
            <span className="mt-2 block text-sm text-rose-600">Rimuove definitivamente il profilo e tutti i dati associati.</span>
          </button>
        </div>
      </section>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('main.profile')}</h1>
        <p className="mt-1 text-sm text-slate-500">Gestisci dati aziendali, automazioni, team e privacy.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
              activeTab === tab
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <span className="mr-1.5">{TAB_ICONS[tab]}</span>
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'profilo' && renderProfilo()}
      {activeTab === 'automazioni' && renderAutomazioni()}
      {activeTab === 'team' && renderTeam()}
      {activeTab === 'privacy' && renderPrivacy()}
    </div>
  );
}
