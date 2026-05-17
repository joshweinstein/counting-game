(function (root, factory) {
  const core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  root.CountingCrittersCore = core;
/* c8 ignore next */
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const TOTAL_ROUNDS = 15;

  const WORD_TO_NUM = {
    one: 1, won: 1, want: 1, wan: 1, un: 1,
    two: 2, too: 2, to: 2, tu: 2,
    three: 3, tree: 3, free: 3, fee: 3,
    four: 4, for: 4, fore: 4, door: 4,
    five: 5, hive: 5, fie: 5,
    six: 6, sicks: 6, sick: 6, sit: 6,
    seven: 7, sev: 7,
    eight: 8, ate: 8, age: 8,
    nine: 9, mine: 9, nye: 9,
  };

  function normalizeTranscript(transcript) {
    return transcript
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseSpoken(transcript) {
    const cleaned = normalizeTranscript(transcript);
    if (!cleaned) return null;

    const digitMatch = cleaned.match(/\d/);
    if (digitMatch) {
      const n = parseInt(digitMatch[0], 10);
      if (n >= 1 && n <= 9) return n;
    }

    const words = cleaned.split(/\s+/);
    for (const word of words) {
      if (WORD_TO_NUM[word] !== undefined) return WORD_TO_NUM[word];
    }

    for (const [word, number] of Object.entries(WORD_TO_NUM)) {
      if (word.length > 2 && cleaned.includes(word)) return number;
    }

    return null;
  }

  function getSpokenNumbers(transcript) {
    const cleaned = normalizeTranscript(transcript);
    if (!cleaned) return [];

    const numbers = [];
    const tokens = cleaned.split(/\s+/);
    for (const token of tokens) {
      const digits = token.match(/\d/g);
      if (digits) {
        for (const digit of digits) {
          const n = parseInt(digit, 10);
          if (n >= 1 && n <= 9) numbers.push(n);
        }
        continue;
      }

      const parsed = parseSpoken(token);
      if (parsed !== null) numbers.push(parsed);
    }

    return numbers;
  }

  function getBestTranscript(result) {
    return (result && result[0] && result[0].transcript ? result[0].transcript : '').trim();
  }

  function getParsedNumberFromResult(result) {
    for (let i = 0; i < result.length; i++) {
      const parsed = parseSpoken(result[i].transcript);
      if (parsed !== null) return parsed;
    }
    return null;
  }

  function getSpokenNumbersFromResult(result) {
    for (let i = 0; i < result.length; i++) {
      const numbers = getSpokenNumbers(result[i].transcript);
      if (numbers.length > 0) return numbers;
    }
    return [];
  }

  function createSR() {
    const s = {};
    for (let i = 1; i <= 9; i++) s[i] = { box: 0, lastSeen: 0, errors: 0 };
    return s;
  }

  function getCandidateScores(srSystem, round) {
    return Object.entries(srSystem).map(([num, data]) => {
      const weight = Math.max(1, 10 - data.box * 2) + data.errors * 3;
      const recencyBoost = Math.min(round - data.lastSeen, 5);
      return { num: parseInt(num, 10), score: weight + recencyBoost };
    }).sort((a, b) => b.score - a.score);
  }

  function pickNext(srSystem, round, randItem) {
    const top = getCandidateScores(srSystem, round).slice(0, 3);
    return randItem(top).num;
  }

  function summarizeSpeechResults(results, startIndex) {
    let finalTranscript = '';
    let interimTranscript = '';
    let parsedFinal = null;
    let parsedInterim = null;
    let finalNumbers = [];
    let interimNumbers = [];

    for (let i = startIndex; i < results.length; i++) {
      const result = results[i];
      if (result.isFinal) {
        finalTranscript += `${getBestTranscript(result)} `;
        if (parsedFinal === null) {
          parsedFinal = getParsedNumberFromResult(result);
        }
        if (finalNumbers.length === 0) {
          finalNumbers = getSpokenNumbersFromResult(result);
        }
      } else {
        interimTranscript += getBestTranscript(result);
        if (parsedInterim === null) {
          parsedInterim = getParsedNumberFromResult(result);
        }
        if (interimNumbers.length === 0) {
          interimNumbers = getSpokenNumbersFromResult(result);
        }
      }
    }

    return { finalTranscript, interimTranscript, parsedFinal, parsedInterim, finalNumbers, interimNumbers };
  }

  function summarizeSpeechEvent(event) {
    const changed = summarizeSpeechResults(event.results, event.resultIndex);
    const hasChangedAnswer = changed.parsedFinal !== null || changed.parsedInterim !== null;
    const displaySummary = hasChangedAnswer ? changed : summarizeSpeechResults(event.results, 0);

    return {
      display: (displaySummary.finalTranscript || displaySummary.interimTranscript).trim(),
      finalTranscript: changed.finalTranscript,
      interimTranscript: changed.interimTranscript,
      parsedFinal: changed.parsedFinal,
      parsedInterim: changed.parsedInterim,
      finalNumbers: changed.finalNumbers,
      interimNumbers: changed.interimNumbers,
    };
  }

  function getSpeechAnswer(summary, currentNum, processing, phase) {
    if (processing || phase !== 'playing') return null;
    if (summary.finalNumbers && summary.finalNumbers.length > 1) return null;
    if (summary.interimNumbers && summary.interimNumbers.length > 1) return null;
    if (summary.finalTranscript && summary.parsedFinal !== null) return summary.parsedFinal;
    if (!summary.finalTranscript && summary.parsedInterim === currentNum) return summary.parsedInterim;
    return null;
  }

  function getCountingSequenceAnswer(summary) {
    const numbers = summary.finalNumbers && summary.finalNumbers.length > 1
      ? summary.finalNumbers
      : summary.interimNumbers;
    if (!numbers || numbers.length < 2) return null;
    return numbers[numbers.length - 1];
  }

  return {
    TOTAL_ROUNDS,
    WORD_TO_NUM,
    normalizeTranscript,
    parseSpoken,
    getSpokenNumbers,
    getBestTranscript,
    getParsedNumberFromResult,
    getSpokenNumbersFromResult,
    summarizeSpeechResults,
    createSR,
    getCandidateScores,
    pickNext,
    summarizeSpeechEvent,
    getSpeechAnswer,
    getCountingSequenceAnswer,
  };
});
