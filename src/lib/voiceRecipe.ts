/**
 * How the announcer voice was made (from the audio pack handoff notes), as a copyable instruction
 * file for an LLM or a person producing more clips. Shown on the host's Expansion page.
 */
export const VOICE = {
  service: "ElevenLabs text-to-speech",
  voiceName: "Brian",
  voiceId: "nPczCjzI2devNBz1zQrb",
  model: "eleven_multilingual_v2",
  settings: { stability: 0.35, similarity_boost: 0.8, style: 0.55, use_speaker_boost: true },
  outputFormat: "mp3_44100_128",
  gapMs: 300,
  plan: "Generated on the ElevenLabs free plan (attribution required, no commercial license). If the game ever goes commercial, regenerate on a paid plan with the same voice and settings.",
};

export function voiceInstructions(missingCount: number): string {
  return `# Family Face-Off — announcer voice: instructions for new clips

You are preparing announcer audio for Family Face-Off, a family party game shown on a TV.
Every clip must sound like the existing announcer, so use exactly this setup.

## Voice (do not change)
- Service: ${VOICE.service}
- Voice: "${VOICE.voiceName}" — voice_id \`${VOICE.voiceId}\`
- Model: \`${VOICE.model}\`
- voice_settings: \`${JSON.stringify(VOICE.settings)}\`
- Output: \`${VOICE.outputFormat}\` (MP3, 44.1 kHz, 128 kbps)
- API call: POST https://api.elevenlabs.io/v1/text-to-speech/${VOICE.voiceId}?output_format=${VOICE.outputFormat}
  with JSON \`{ "text": "...", "model_id": "${VOICE.model}", "voice_settings": ${JSON.stringify(VOICE.settings)} }\`
  and header \`xi-api-key\` (a key with Text to Speech access only and a credit limit; never commit it).

## Personality
A warm, upbeat game-show host for a family living room: friendly, a little playful, never mean,
never sarcastic about wrong answers. Short lines. Exclamation points for energy, "..." for a
dramatic pause before a reveal.

## Writing the spoken text (the "text" you send)
The spoken text may differ from the on-screen text so it reads naturally aloud:
- Spell out years and big numbers: 1621 → "sixteen twenty-one", 1,000 → "a thousand",
  $1 million → "a million dollars", $10,000 → "ten thousand dollars".
- Spell out abbreviations letter by letter: "U.S." → "U S" or "the United States", "NFL" → "N F L".
- Symbols become words: "&" → "and", "%" → "percent", "#" → "number".
- Keep the question itself; do NOT read the answer choices or the correct answer.
- Questions about players use the general wording (no names): "Which food could you eat every week?"
- One clip = one line. Keep question clips under about 6 seconds when possible.

## Files and naming
- Question clips: \`questions/{id}.mp3\` where {id} is the question id (q001, b001, t001, or a custom
  question's audio id). These are what the announcer reads when that question appears.
- Game-flow lines live in pools (folders) such as \`leadin/general/05.mp3\`, \`prompt/09.mp3\`,
  \`waiting/06.mp3\`. Number new files after the last existing one; never reuse a number.
- Every clip gets an entry in \`public/audio/manifest.json\`:
  \`"t001": { "file": "questions/t001.mp3", "durationMs": 1855, "text": "<exact spoken text>" }\`
  durationMs is the real length of the MP3 in milliseconds (measure it, e.g. with ffprobe).
  Pool entries go in the pool's array in the same shape.
- Hand back a zip containing the new MP3s in their folders plus the updated manifest.json
  (or a manifest fragment with only the new entries) and a short HANDOFF note listing what changed.

## What is still missing
${missingCount} questions have no clip yet. The Expansion page's "Download missing list" gives
id, on-screen text and a suggested spoken text for each. Voice them with the setup above.

## Licensing
${VOICE.plan}
`;
}

/** Suggested spoken text for a question: the on-screen text with common symbols spelled out. */
export function spokenText(text: string): string {
  return text
    .replace(/&/g, " and ")
    .replace(/%/g, " percent")
    .replace(/\bU\.S\./g, "U S")
    .replace(/\s+/g, " ")
    .trim();
}
