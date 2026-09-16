import { llmProvider } from "./provider";

interface Response {
  choices?: { message?: { content?: string } }[];
}

export const openai = llmProvider({
  id: "openai",
  keyUrl: "https://platform.openai.com/api-keys",
  label: "OpenAI",
  model: "gpt-4o-mini",
  endpoint: "https://api.openai.com/v1/chat/completions",
  headers: (key) => ({ authorization: `Bearer ${key}` }),
  body: (text, model, schema) => ({
    model,
    messages: [{ role: "user", content: text }],
    response_format: {
      type: "json_schema",
      json_schema: { name: "meaning", strict: true, schema },
    },
  }),
  extract: (payload) => (payload as Response).choices?.[0]?.message?.content,
});
