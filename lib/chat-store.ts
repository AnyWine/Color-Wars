import type { TeamColor } from "@/lib/types";

const MAX_MESSAGES = 50;
export const MAX_MESSAGE_LENGTH = 120;

export type ChatMessage = {
  id: string;
  address: string;
  team: TeamColor | null;
  text: string;
  timestamp: number;
};

type ChatState = {
  messages: ChatMessage[];
  nextId: number;
};

const globalRef = globalThis as unknown as { __chatState?: ChatState };

if (!globalRef.__chatState) {
  globalRef.__chatState = {
    messages: [
      {
        id: "system-welcome",
        address: "0x0000000000000000000000000000000000000000",
        team: null,
        text: "Round started!",
        timestamp: Date.now(),
      },
    ],
    nextId: 1,
  };
}

const state = globalRef.__chatState;

function sanitize(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE_LENGTH);
}

export const chatStore = {
  list(): ChatMessage[] {
    return state.messages;
  },
  append(message: { address: string; team: TeamColor | null; text: string }): ChatMessage | null {
    const text = sanitize(message.text);
    if (text.length === 0) return null;

    const entry: ChatMessage = {
      id: `${Date.now()}-${state.nextId++}`,
      address: message.address.toLowerCase(),
      team: message.team,
      text,
      timestamp: Date.now(),
    };

    state.messages.push(entry);
    if (state.messages.length > MAX_MESSAGES) {
      state.messages.splice(0, state.messages.length - MAX_MESSAGES);
    }

    return entry;
  },
};
