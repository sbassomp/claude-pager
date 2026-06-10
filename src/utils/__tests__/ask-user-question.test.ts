import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isAskUserQuestion, parseAskUserQuestion, formatAskUserQuestionText } from '../ask-user-question.js';

const sample = JSON.stringify({
  questions: [
    {
      header: 'Modèle de zone AAR',
      question: 'Comment modéliser une zone de ravitaillement en base ?',
      options: [
        { label: 'Entité dédiée RefuelingZone', description: 'Nouvelle entité' },
        { label: 'Étendre Zone existante', description: 'Ajout zoneType=AAR' },
      ],
    },
    {
      header: 'Propriété',
      question: 'Qui possède la zone ?',
      options: [
        { label: 'Théâtre' },
        { label: 'Mission' },
      ],
    },
  ],
});

describe('AskUserQuestion utils', () => {
  it('detects the tool name', () => {
    assert.equal(isAskUserQuestion('AskUserQuestion'), true);
    assert.equal(isAskUserQuestion('Bash'), false);
    assert.equal(isAskUserQuestion(undefined), false);
  });

  it('parses well-formed input', () => {
    const out = parseAskUserQuestion(sample);
    assert.ok(out);
    assert.equal(out!.length, 2);
    assert.equal(out![0].header, 'Modèle de zone AAR');
    assert.equal(out![0].options.length, 2);
    assert.equal(out![0].options[0].label, 'Entité dédiée RefuelingZone');
    assert.equal(out![1].options[0].description, undefined);
  });

  it('returns null on garbage', () => {
    assert.equal(parseAskUserQuestion(undefined), null);
    assert.equal(parseAskUserQuestion(''), null);
    assert.equal(parseAskUserQuestion('not json'), null);
    assert.equal(parseAskUserQuestion('{}'), null);
    assert.equal(parseAskUserQuestion('{"questions": "nope"}'), null);
  });

  it('drops entries with no question text', () => {
    const out = parseAskUserQuestion(JSON.stringify({
      questions: [{ options: [] }, { question: 'real one', options: [] }],
    }));
    assert.equal(out!.length, 1);
    assert.equal(out![0].question, 'real one');
  });

  it('formats text rendering with caps', () => {
    const out = parseAskUserQuestion(sample)!;
    const text = formatAskUserQuestionText(out, 1000);
    assert.match(text, /Q1\. Comment/);
    assert.match(text, /\[Modèle de zone AAR\]/);
    assert.match(text, /1\) Entité dédiée/);
    assert.match(text, /Q2\. Qui possède/);
  });

  it('truncates long descriptions', () => {
    const long = 'A'.repeat(500);
    const input = JSON.stringify({ questions: [{ question: 'q', options: [{ label: 'l', description: long }] }] });
    const out = parseAskUserQuestion(input)!;
    const text = formatAskUserQuestionText(out, 50);
    assert.match(text, /AAAA…/);
    assert.ok(!text.includes(long));
  });
});
