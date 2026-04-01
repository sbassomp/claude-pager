import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  addNote, listNotes, getNote, removeNote, markSent,
  listProjects, normalizeProject, matchProject, _resetStore,
} from '../store.js';

describe('notes store', () => {
  beforeEach(() => {
    _resetStore();
  });

  it('should add a note and retrieve it', () => {
    const note = addNote('/home/user/dev/myproject', 'fix the CSS', 'cli');
    assert.ok(note.id);
    assert.equal(note.project, 'myproject');
    assert.equal(note.text, 'fix the CSS');
    assert.equal(note.source, 'cli');
    assert.equal(note.status, 'pending');

    const retrieved = getNote(note.id);
    assert.ok(retrieved);
    assert.equal(retrieved.id, note.id);
  });

  it('should list only pending notes', () => {
    addNote('project-a', 'note 1', 'api');
    const n2 = addNote('project-a', 'note 2', 'api');
    addNote('project-b', 'note 3', 'api');

    assert.equal(listNotes().length, 3);
    assert.equal(listNotes('project-a').length, 2);
    assert.equal(listNotes('project-b').length, 1);

    markSent(n2.id);
    assert.equal(listNotes('project-a').length, 1);
  });

  it('should remove a note', () => {
    const note = addNote('project', 'test', 'dashboard');
    assert.ok(getNote(note.id));

    const removed = removeNote(note.id);
    assert.ok(removed);
    assert.equal(getNote(note.id), undefined);
  });

  it('should return false when removing unknown note', () => {
    assert.equal(removeNote('nonexistent'), false);
  });

  it('should mark note as sent', () => {
    const note = addNote('project', 'test', 'api');
    assert.ok(markSent(note.id));

    const updated = getNote(note.id);
    assert.equal(updated?.status, 'sent');
    // Sent notes not listed in pending
    assert.equal(listNotes().length, 0);
  });

  it('should list unique project names', () => {
    addNote('project-a', 'note 1', 'api');
    addNote('project-b', 'note 2', 'api');
    addNote('project-a', 'note 3', 'api');

    const projects = listProjects();
    assert.equal(projects.length, 2);
    assert.ok(projects.includes('project-a'));
    assert.ok(projects.includes('project-b'));
  });
});

describe('normalizeProject', () => {
  it('should extract last path component', () => {
    assert.equal(normalizeProject('/home/user/dev/myproject'), 'myproject');
    assert.equal(normalizeProject('/home/user/dev/my-app/'), 'my-app');
  });

  it('should lowercase simple names', () => {
    assert.equal(normalizeProject('MyProject'), 'myproject');
  });
});

describe('matchProject', () => {
  beforeEach(() => {
    _resetStore();
  });

  it('should match exact project name', () => {
    addNote('claude-relay', 'test', 'api');
    assert.equal(matchProject('claude-relay'), 'claude-relay');
  });

  it('should fuzzy match with spaces to dashes', () => {
    addNote('claude-relay', 'test', 'api');
    assert.equal(matchProject('claude relay'), 'claude-relay');
  });

  it('should return null when no match', () => {
    addNote('some-project', 'test', 'api');
    assert.equal(matchProject('totally-different'), null);
  });
});
