import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const exec = promisify(execFile);

const WHISPER_SCRIPT = `
import sys, json
from faster_whisper import WhisperModel

model = WhisperModel("medium", device="cpu", compute_type="int8")
segments, info = model.transcribe(sys.argv[1], language=sys.argv[2] if len(sys.argv) > 2 else None)
text = " ".join(s.text.strip() for s in segments)
print(json.dumps({"text": text, "language": info.language}))
`;

let scriptPath: string | null = null;

function getScriptPath(): string {
  if (!scriptPath) {
    const dir = mkdtempSync(join(tmpdir(), 'claude-pager-whisper-'));
    scriptPath = join(dir, 'transcribe.py');
    writeFileSync(scriptPath, WHISPER_SCRIPT);
  }
  return scriptPath;
}

export async function transcribeAudio(
  audioPath: string,
  language?: string,
): Promise<{ text: string; language: string }> {
  const args = [getScriptPath(), audioPath];
  if (language) args.push(language);

  const { stdout } = await exec('python3.10', args, { timeout: 60000 });
  return JSON.parse(stdout.trim());
}

export async function downloadTelegramVoice(
  botToken: string,
  fileId: string,
): Promise<string> {
  // Get file path from Telegram
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getFile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId }),
  });
  const data = (await res.json()) as { ok: boolean; result?: { file_path: string } };
  if (!data.ok || !data.result?.file_path) {
    throw new Error('Failed to get file path from Telegram');
  }

  // Download the file
  const fileUrl = `https://api.telegram.org/file/bot${botToken}/${data.result.file_path}`;
  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) throw new Error(`Failed to download file: ${fileRes.status}`);

  const buffer = Buffer.from(await fileRes.arrayBuffer());
  const dir = mkdtempSync(join(tmpdir(), 'claude-pager-voice-'));
  const ext = data.result.file_path.split('.').pop() || 'ogg';
  const localPath = join(dir, `voice.${ext}`);
  writeFileSync(localPath, buffer);

  return localPath;
}

export function cleanupFile(path: string): void {
  try { unlinkSync(path); } catch { /* ignore */ }
}
