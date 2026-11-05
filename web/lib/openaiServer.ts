import OpenAI from 'openai';

let client: OpenAI | null = null;

/**
 * OpenAI client created on first use: building at import time made `next build`
 * fail where OPENAI_API_KEY is not set (CI). A missing key now fails the request.
 */
export const openai = new Proxy({} as OpenAI, {
  get(_target, property) {
    if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const value = Reflect.get(client, property, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
