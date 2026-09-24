/** Read text aloud with the browser's built-in voice. Silently no-ops if unsupported. */
export function speak(text: string) {
  try {
    const synth = window.speechSynthesis;
    if (!synth || !text) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[*_#`]/g, ""));
    u.rate = 1.05;
    synth.speak(u);
  } catch {
    /* noop */
  }
}

export function stopSpeaking() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* noop */
  }
}
