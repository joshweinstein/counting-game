const test = require('node:test');
const assert = require('node:assert/strict');

const core = require('./counting-critters-core');

function speechResult(isFinal, transcripts) {
  const result = transcripts.map((transcript) => ({ transcript }));
  result.isFinal = isFinal;
  return result;
}

test('exports constants and number word mappings', () => {
  assert.equal(core.TOTAL_ROUNDS, 15);
  assert.equal(core.WORD_TO_NUM.two, 2);
  assert.equal(core.WORD_TO_NUM.nye, 9);
});

test('normalizes transcript casing, punctuation, and spacing', () => {
  assert.equal(core.normalizeTranscript('  TWO!!\n bunnies?  '), 'two bunnies');
});

test('parseSpoken returns null for empty or unrecognized speech', () => {
  assert.equal(core.parseSpoken(''), null);
  assert.equal(core.parseSpoken('bunnies everywhere'), null);
});

test('parseSpoken reads digits one through nine and ignores zero', () => {
  assert.equal(core.parseSpoken('I see 7'), 7);
  assert.equal(core.parseSpoken('0 bunnies'), null);
});

test('parseSpoken reads exact number words and close recognizer variants', () => {
  assert.equal(core.parseSpoken('two'), 2);
  assert.equal(core.parseSpoken('too'), 2);
  assert.equal(core.parseSpoken('please count fore'), 4);
});

test('parseSpoken reads repeated number words and digits', () => {
  assert.equal(core.parseSpoken('two two'), 2);
  assert.equal(core.parseSpoken('2 2'), 2);
});

test('parseSpoken reads embedded longer word matches', () => {
  assert.equal(core.parseSpoken('there are xxsevenxx'), 7);
});

test('getBestTranscript trims the preferred alternative and handles missing data', () => {
  assert.equal(core.getBestTranscript([{ transcript: ' two ' }]), 'two');
  assert.equal(core.getBestTranscript([]), '');
  assert.equal(core.getBestTranscript(null), '');
});

test('getParsedNumberFromResult returns the first parsed alternative', () => {
  assert.equal(core.getParsedNumberFromResult([{ transcript: 'nope' }, { transcript: 'three' }]), 3);
  assert.equal(core.getParsedNumberFromResult([{ transcript: 'nope' }]), null);
});

test('createSR creates the spaced-repetition state for numbers one through nine', () => {
  const sr = core.createSR();
  assert.deepEqual(Object.keys(sr), ['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  assert.deepEqual(sr[1], { box: 0, lastSeen: 0, errors: 0 });
});

test('getCandidateScores prioritizes weaker, error-prone, and less recent numbers', () => {
  const sr = core.createSR();
  sr[1] = { box: 5, lastSeen: 9, errors: 0 };
  sr[2] = { box: 1, lastSeen: 1, errors: 2 };
  sr[3] = { box: 0, lastSeen: 8, errors: 0 };

  const scores = core.getCandidateScores(sr, 10);

  assert.deepEqual(scores[0], { num: 2, score: 19 });
  assert.deepEqual(scores.at(-1), { num: 1, score: 2 });
});

test('pickNext chooses from the top three scored candidates with injected randomness', () => {
  const sr = core.createSR();
  sr[9].errors = 4;

  const picked = core.pickNext(sr, 0, (top) => {
    assert.equal(top.length, 3);
    assert.equal(top[0].num, 9);
    return top[0];
  });

  assert.equal(picked, 9);
});

test('summarizeSpeechEvent displays final speech and parses final alternatives', () => {
  const summary = core.summarizeSpeechEvent({
    resultIndex: 0,
    results: [
      speechResult(true, [' nope ', ' four ']),
      speechResult(false, ['two']),
    ],
  });

  assert.equal(summary.display, 'nope');
  assert.equal(summary.finalTranscript, 'nope ');
  assert.equal(summary.interimTranscript, 'two');
  assert.equal(summary.parsedFinal, 4);
  assert.equal(summary.parsedInterim, 2);
});

test('summarizeSpeechEvent displays interim speech when no final result exists', () => {
  const summary = core.summarizeSpeechEvent({
    resultIndex: 1,
    results: [
      speechResult(true, ['one']),
      speechResult(false, [' two ']),
    ],
  });

  assert.equal(summary.display, 'two');
  assert.equal(summary.finalTranscript, '');
  assert.equal(summary.interimTranscript, 'two');
  assert.equal(summary.parsedFinal, null);
  assert.equal(summary.parsedInterim, 2);
});

test('summarizeSpeechEvent uses stale earlier recognition results for display only', () => {
  const summary = core.summarizeSpeechEvent({
    resultIndex: 1,
    results: [
      speechResult(false, [' two two ']),
      speechResult(false, ['']),
    ],
  });

  assert.equal(summary.display, 'two two');
  assert.equal(summary.finalTranscript, '');
  assert.equal(summary.interimTranscript, '');
  assert.equal(summary.parsedFinal, null);
  assert.equal(summary.parsedInterim, null);
});

test('summarizeSpeechEvent ignores stale final words when a fresh interim answer is heard', () => {
  const summary = core.summarizeSpeechEvent({
    resultIndex: 1,
    results: [
      speechResult(true, ['random words']),
      speechResult(false, ['three']),
    ],
  });

  assert.equal(summary.display, 'three');
  assert.equal(summary.finalTranscript, '');
  assert.equal(summary.interimTranscript, 'three');
  assert.equal(summary.parsedFinal, null);
  assert.equal(summary.parsedInterim, 3);
});

test('getSpeechAnswer returns final answers even when wrong', () => {
  const answer = core.getSpeechAnswer({
    finalTranscript: 'three ',
    parsedFinal: 3,
    parsedInterim: null,
  }, 2, false, 'playing');

  assert.equal(answer, 3);
});

test('getSpeechAnswer advances on a matching interim answer', () => {
  const answer = core.getSpeechAnswer({
    finalTranscript: '',
    parsedFinal: null,
    parsedInterim: 2,
  }, 2, false, 'playing');

  assert.equal(answer, 2);
});

test('getSpeechAnswer ignores non-matching interim, processing, and inactive phases', () => {
  const summary = {
    finalTranscript: '',
    parsedFinal: null,
    parsedInterim: 3,
  };

  assert.equal(core.getSpeechAnswer(summary, 2, false, 'playing'), null);
  assert.equal(core.getSpeechAnswer(summary, 3, true, 'playing'), null);
  assert.equal(core.getSpeechAnswer(summary, 3, false, 'correct'), null);
});

test('getSpeechAnswer ignores final transcripts that do not parse', () => {
  const answer = core.getSpeechAnswer({
    finalTranscript: 'bunnies ',
    parsedFinal: null,
    parsedInterim: 2,
  }, 2, false, 'playing');

  assert.equal(answer, null);
});
