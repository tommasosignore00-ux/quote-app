import { minimizeVoiceContext } from '../../../supabase/functions/_shared/voiceContext';

describe('minimizeVoiceContext', () => {
  const context = {
    currentCustomer: { id: 'c9', name: 'Aperto' },
    currentJob: { id: 'j9', title: 'Corrente' },
    existingCustomers: [
      { id: 'c1', name: 'Mario Rossi' },
      { id: 'c2', name: 'Nicolò Bianchi' },
      { id: 'c9', name: 'Aperto' },
    ],
    existingJobs: [
      { id: 'j1', title: 'Cancello Via Roma' },
      { id: 'j2', title: 'Ringhiera scala' },
      { id: 'j9', title: 'Corrente' },
    ],
  };

  it('keeps only what shares a word with the transcript, and what is open', () => {
    const out = minimizeVoiceContext(context, 'aggiungi al cancello per Rossi 2 tubi');
    expect(out.existingCustomers.map((c) => c.id)).toEqual(['c1', 'c9']);
    expect(out.existingJobs.map((j) => j.id)).toEqual(['j1', 'j9']);
  });

  it('ignores accents and case but not words under three letters', () => {
    expect(
      minimizeVoiceContext(context, 'NICOLO').existingCustomers.map((c) => c.id)
    ).toEqual(['c2', 'c9']);
    expect(
      minimizeVoiceContext({ existingCustomers: [{ id: 'x', name: 'Di Re' }] }, 'di re')
        .existingCustomers
    ).toEqual([]);
  });

  it('tolerates a context without lists', () => {
    expect(minimizeVoiceContext({}, 'ciao').existingCustomers).toEqual([]);
  });
});
