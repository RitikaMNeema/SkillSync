export interface UnsupportedRealtimeFeature {
  supported: false;
  reason: string;
}

const unsupported: UnsupportedRealtimeFeature = {
  supported: false,
  reason: "The current backend does not expose AI or WebSocket endpoints."
};

export async function startAIAnalysis() {
  return unsupported;
}

export async function approveOutreach() {
  return unsupported;
}
