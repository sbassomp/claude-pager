import { readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getDataDir } from '../config/index.js';
import { safeJsonParse } from '../utils/json.js';

export interface Note {
  id: string;
  project: string;
  text: string;
  image?: string; // filename in note-images/
  source: 'voice' | 'dashboard' | 'telegram' | 'cli' | 'api';
  createdAt: number;
  status: 'pending' | 'sent';
}

const MAX_NOTES = 500;

let notes: Note[] = [];
let loaded = false;
let testMode = false;

function notesFile(): string {
  return join(getDataDir(), 'notes.json');
}

export function imagesDir(): string {
  const dir = join(getDataDir(), 'note-images');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function saveImage(data: Buffer): string {
  const filename = randomUUID() + '.png';
  writeFileSync(join(imagesDir(), filename), data);
  return filename;
}

export function setNoteImage(id: string, filename: string): boolean {
  load();
  const note = notes.find(n => n.id === id);
  if (!note) return false;
  note.image = filename;
  persist();
  return true;
}

function load(): void {
  if (loaded) return;
  try {
    const raw = readFileSync(notesFile(), 'utf-8');
    notes = safeJsonParse<Note[]>(raw, []);
  } catch {
    notes = [];
  }
  loaded = true;
}

function persist(): void {
  if (testMode) return;
  const tmp = notesFile() + '.tmp';
  writeFileSync(tmp, JSON.stringify(notes, null, 2) + '\n');
  renameSync(tmp, notesFile());
}

export function addNote(project: string, text: string, source: Note['source'] = 'api'): Note {
  load();
  const note: Note = {
    id: randomUUID(),
    project: normalizeProject(project),
    text: text.trim(),
    source,
    createdAt: Date.now(),
    status: 'pending',
  };
  notes.push(note);
  // Cap size
  if (notes.length > MAX_NOTES) {
    notes = notes.slice(notes.length - MAX_NOTES);
  }
  persist();
  return note;
}

export function listNotes(project?: string): Note[] {
  load();
  const pending = notes.filter(n => n.status === 'pending');
  if (!project) return pending;
  const normalized = normalizeProject(project);
  return pending.filter(n => n.project === normalized);
}

export function getNote(id: string): Note | undefined {
  load();
  return notes.find(n => n.id === id);
}

export function markSent(id: string): boolean {
  load();
  const note = notes.find(n => n.id === id);
  if (!note) return false;
  note.status = 'sent';
  persist();
  return true;
}

export function removeNote(id: string): boolean {
  load();
  const idx = notes.findIndex(n => n.id === id);
  if (idx === -1) return false;
  const note = notes[idx];
  if (note.image) {
    try { unlinkSync(join(imagesDir(), note.image)); } catch { /* already deleted */ }
  }
  notes.splice(idx, 1);
  persist();
  return true;
}

export function updateNoteText(id: string, text: string): boolean {
  load();
  const note = notes.find(n => n.id === id);
  if (!note) return false;
  note.text = text.trim();
  persist();
  return true;
}

export function reorderNotes(project: string, orderedIds: string[]): boolean {
  load();
  const normalized = normalizeProject(project);
  const projectNotes = notes.filter(n => n.project === normalized && n.status === 'pending');
  const otherNotes = notes.filter(n => n.project !== normalized || n.status !== 'pending');

  // Sort project notes by the provided order
  const idIndex = new Map(orderedIds.map((id, i) => [id, i]));
  projectNotes.sort((a, b) => (idIndex.get(a.id) ?? 999) - (idIndex.get(b.id) ?? 999));

  notes = [...otherNotes, ...projectNotes];
  persist();
  return true;
}

export function listProjects(): string[] {
  load();
  const projects = new Set(notes.filter(n => n.status === 'pending').map(n => n.project));
  return Array.from(projects).sort();
}

/** Normalize project path to short name (last directory component) */
export function normalizeProject(project: string): string {
  // If it looks like a path, take the last component
  if (project.includes('/')) {
    return project.replace(/\/+$/, '').split('/').pop() || project;
  }
  return project.toLowerCase().trim();
}

/** Find best matching project name for fuzzy input (e.g. voice "claude relay" → "claude-relay") */
export function matchProject(input: string): string | null {
  load();
  const projects = listProjects();
  const normalized = input.toLowerCase().replace(/\s+/g, '-').trim();

  // Exact match
  if (projects.includes(normalized)) return normalized;

  // Fuzzy: check if input is contained in a project name or vice versa
  const match = projects.find(p =>
    p.includes(normalized) || normalized.includes(p),
  );
  return match || null;
}

/** Reset store — for testing only */
export function _resetStore(): void {
  notes = [];
  loaded = true; // Mark as loaded so it doesn't re-read the file
  testMode = true; // Disable file persistence during tests
}
