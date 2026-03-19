import type { ChannelListeners, FreeMessage } from '../channel.js';
import type { TelegramConfig } from '../../types.js';
import { downloadTelegramVoice, transcribeAudio, cleanupFile } from '../../voice/transcribe.js';

interface TelegramMessage {
  message_id: number;
  text?: string;
  voice?: { file_id: string; duration: number };
  reply_to_message?: { message_id: number };
}

interface TelegramResponse {
  ok: boolean;
  result?: { message_id?: number };
}

interface VoiceHandlerDeps {
  config: TelegramConfig;
  apiUrl: (method: string) => string;
  handleReply: (msg: TelegramMessage, listeners: ChannelListeners) => Promise<void>;
  handleFreeMessage: (msg: TelegramMessage, onFreeMessage: (msg: FreeMessage) => void | Promise<void>) => Promise<void>;
}

export async function handleVoiceMessage(
  msg: TelegramMessage,
  listeners: ChannelListeners,
  deps: VoiceHandlerDeps,
): Promise<void> {
  if (!msg.voice) return;

  const { config, apiUrl } = deps;
  console.log(`[telegram] voice message received (${msg.voice.duration}s)`);

  // Send a "transcribing..." feedback
  let statusMsgId: number | undefined;
  try {
    const res = await fetch(apiUrl('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: '🎙️ Transcribing...',
        reply_to_message_id: msg.message_id,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = (await res.json()) as TelegramResponse;
    statusMsgId = data.result?.message_id;
  } catch { /* best effort */ }

  let audioPath: string | undefined;
  try {
    audioPath = await downloadTelegramVoice(config.botToken, msg.voice.file_id);
    const result = await transcribeAudio(audioPath, config.voiceLanguage || 'fr');
    const text = result.text.trim();

    console.log(`[telegram] transcribed (${result.language}): "${text}"`);

    if (statusMsgId) {
      await updateStatusMessage(apiUrl, config.chatId, statusMsgId, `🎙️ "${text}"`);
    }

    if (!text) return;

    const fakeMsg = { ...msg, text };
    if (msg.reply_to_message) {
      await deps.handleReply(fakeMsg, listeners);
    } else if (listeners.onFreeMessage) {
      await deps.handleFreeMessage(fakeMsg, listeners.onFreeMessage);
    }
  } catch (err) {
    console.error('[telegram] voice transcription error:', err);
    if (statusMsgId) {
      await updateStatusMessage(apiUrl, config.chatId, statusMsgId, `❌ Transcription failed: ${err}`);
    }
  } finally {
    if (audioPath) cleanupFile(audioPath);
  }
}

async function updateStatusMessage(
  apiUrl: (method: string) => string,
  chatId: number,
  messageId: number,
  text: string,
): Promise<void> {
  try {
    await fetch(apiUrl('editMessageText'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text }),
      signal: AbortSignal.timeout(15000),
    });
  } catch { /* best effort */ }
}
