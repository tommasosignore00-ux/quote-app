import OpenAI from 'openai';
import { parseVoiceAgentResult, toLegacyVoiceAction, type VoiceAgentResult } from './schema';
import { buildVoiceAgentUserPrompt, VOICE_AGENT_SYSTEM_PROMPT } from './prompt';
import type { LegacyVoiceActionResult, VoiceAgentRunInput } from './types';

export type VoiceAgentRunOutput = {
  agent: VoiceAgentResult;
  legacy: LegacyVoiceActionResult;
  raw: string;
};

export async function runVoiceAgent(params: {
  openai: OpenAI;
  input: VoiceAgentRunInput;
  model?: string;
}): Promise<VoiceAgentRunOutput> {
  const completion = await params.openai.chat.completions.create({
    model: params.model || process.env.OPENAI_AGENT_MODEL || 'gpt-4o-mini',
    temperature: 0.1,
    messages: [
      { role: 'system', content: VOICE_AGENT_SYSTEM_PROMPT },
      { role: 'user', content: buildVoiceAgentUserPrompt(params.input) },
    ],
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0]?.message?.content || '{}';
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Voice agent returned invalid JSON: ${String(error)}`);
  }

  const agent = parseVoiceAgentResult(parsed);
  const legacy = toLegacyVoiceAction(agent);

  return { agent, legacy, raw };
}
