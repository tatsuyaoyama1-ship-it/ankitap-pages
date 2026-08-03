(() => {
  "use strict";

  const blankTokenPattern = /(?:【|［|\[|（|\()\s*(?:blank|空欄)\s*\d+\s*(?:】|］|\]|）|\))/gi;
  let availableVoices = [];

  function normalizeValue(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, "");
  }

  function isPrimaryPowerFillBlank(question) {
    const stage = normalizeValue(question?.stage || question?.examStage || question?.examType);
    const subject = normalizeValue(question?.subject);
    const type = normalizeValue(question?.questionType || question?.type || question?.category);
    const isPrimary = stage === "first" || stage === "primary" || stage.includes("一次");
    const isPower = subject === "denryoku" || subject === "電力";
    const isFillBlank = type === "fillblank" || type.includes("穴埋め") || type.includes("空欄");

    return isPrimary && isPower && isFillBlank;
  }

  function blankNumber(token) {
    const match = String(token ?? "").match(/\d+/);
    return match ? Number(match[0]) : null;
  }

  function blankNumbersInOrder(text) {
    const numbers = [];
    const seen = new Set();

    for (const match of String(text ?? "").matchAll(blankTokenPattern)) {
      const number = blankNumber(match[0]);
      if (number != null && !seen.has(number)) {
        seen.add(number);
        numbers.push(number);
      }
    }

    return numbers;
  }

  function cleanBlankAnswer(value) {
    const answer = String(value ?? "").trim();
    const choiceMatch = answer.match(/^[ァ-ヶー]\s*[（(]([\s\S]*)[）)]$/);
    return (choiceMatch ? choiceMatch[1] : answer).trim();
  }

  function parseBlankAnswersText(text) {
    const answers = {};

    String(text ?? "").split("|").forEach(pair => {
      const match = pair.match(/^\s*(?:blank|空欄)\s*(\d+)\s*[=:：]\s*([\s\S]+?)\s*$/i);
      if (match) {
        answers[Number(match[1])] = cleanBlankAnswer(match[2]);
      }
    });

    String(text ?? "").split(/\r?\n/).forEach(line => {
      const match = line.match(/^\s*(?:【|［|\[|（|\()?\s*(?:blank|空欄)\s*(\d+)\s*(?:】|］|\]|）|\))?\s*[:：=]?\s*(.+?)\s*$/i);
      if (match && !answers[Number(match[1])]) {
        answers[Number(match[1])] = cleanBlankAnswer(match[2]);
      }
    });

    return answers;
  }

  function extractBlankAnswers(question) {
    const answers = parseBlankAnswersText(question?.blankAnswersText);

    Object.entries(question?.blankAnswers || {}).forEach(([key, value]) => {
      const number = blankNumber(key);
      if (number != null) {
        answers[number] = cleanBlankAnswer(value);
      }
    });

    return answers;
  }

  function stripHtml(html) {
    const element = document.createElement("div");
    element.innerHTML = String(html ?? "");
    return element.textContent || "";
  }

  function extractNarrativeText(text) {
    let narrative = String(text ?? "").replace(/\r\n?/g, "\n");
    const answerGroupIndex = narrative.search(/\n\s*〔\s*問\s*\d+\s*の解答群\s*〕/);

    if (answerGroupIndex >= 0) {
      narrative = narrative.slice(0, answerGroupIndex);
    }

    narrative = narrative.replace(
      /^\s*次の文章は[\s\S]*?解答群の中から選べ[。．.]\s*/,
      ""
    );

    return narrative.trim();
  }

  function buildCompletedText(question) {
    const override = String(question?.speechOverride || question?.speech_override || "").trim();
    const source = override || String(question?.questionText || question?.question_text || "").trim();

    if (!source) {
      return { ok: false, error: "問題文がありません。", missing: [] };
    }

    let completed = source;

    if (!override) {
      const numbers = blankNumbersInOrder(source);
      if (numbers.length === 0) {
        return { ok: false, error: "問題文に空欄がありません。", missing: [] };
      }

      const answers = extractBlankAnswers(question);
      const missing = numbers.filter(number => !String(answers[number] ?? "").trim());

      if (missing.length > 0) {
        return {
          ok: false,
          error: `空欄${missing.join("、")}の解答がありません。`,
          missing
        };
      }

      completed = source.replace(blankTokenPattern, token => answers[blankNumber(token)]);
    }

    if (blankNumbersInOrder(completed).length > 0) {
      return { ok: false, error: "置換できない空欄が残っています。", missing: blankNumbersInOrder(completed) };
    }

    const displayText = stripHtml(extractNarrativeText(completed)).trim();
    if (!displayText) {
      return { ok: false, error: "読み上げ用文章を生成できません。", missing: [] };
    }

    return { ok: true, displayText };
  }

  function replaceSimpleLatex(text) {
    let result = text;

    for (let pass = 0; pass < 4; pass += 1) {
      result = result.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "$2分の$1");
      result = result.replace(/\\sqrt\s*\{([^{}]*)\}/g, "$1の平方根");
      result = result.replace(/\\(?:mathrm|text|operatorname)\s*\{([^{}]*)\}/g, "$1");
    }

    return result
      .replace(/\\(?:left|right)\b/g, "")
      .replace(/\\cos\b/gi, "コサイン")
      .replace(/\\sin\b/gi, "サイン")
      .replace(/\\tan\b/gi, "タンジェント")
      .replace(/\\theta\b/gi, "シータ")
      .replace(/\\(?:varphi|phi)\b/gi, "ファイ")
      .replace(/\\eta\b/gi, "イータ")
      .replace(/\\rho\b/gi, "ロー")
      .replace(/\\Delta\b/g, "デルタ")
      .replace(/\\(?:cdot|times)\b/g, "かける")
      .replace(/\\div\b/g, "割る")
      .replace(/\\pm\b/g, "プラスマイナス")
      .replace(/\^\s*\{?2\}?/g, "の二乗")
      .replace(/\^\s*\{?3\}?/g, "の三乗")
      .replace(/_\s*\{([^{}]+)\}/g, " $1")
      .replace(/_([A-Za-z0-9]+)/g, " $1")
      .replace(/\\([A-Za-z]+)/g, "$1")
      .replace(/[{}]/g, "")
      .replace(/\\[()[\]]/g, "")
      .replace(/\${1,2}/g, "");
  }

  function replaceUnitsAndSymbols(text) {
    const replacements = [
      [/(\d+(?:[.,]\d+)?)\s*MWh\b/gi, "$1メガワット時"],
      [/(\d+(?:[.,]\d+)?)\s*kWh\b/gi, "$1キロワット時"],
      [/(\d+(?:[.,]\d+)?)\s*MVA\b/g, "$1メガボルトアンペア"],
      [/(\d+(?:[.,]\d+)?)\s*kVA\b/g, "$1キロボルトアンペア"],
      [/(\d+(?:[.,]\d+)?)\s*MW\b/g, "$1メガワット"],
      [/(\d+(?:[.,]\d+)?)\s*kW\b/g, "$1キロワット"],
      [/(\d+(?:[.,]\d+)?)\s*kV\b/g, "$1キロボルト"],
      [/(\d+(?:[.,]\d+)?)\s*kA\b/g, "$1キロアンペア"],
      [/(\d+(?:[.,]\d+)?)\s*Hz\b/gi, "$1ヘルツ"],
      [/(\d+(?:[.,]\d+)?)\s*V\b/g, "$1ボルト"],
      [/(\d+(?:[.,]\d+)?)\s*A\b/g, "$1アンペア"],
      [/(\d+(?:[.,]\d+)?)\s*W\b/g, "$1ワット"],
      [/\[\s*kg\s*\/\s*m(?:³|3)\s*\]/gi, "キログラム毎立方メートル"],
      [/\[\s*m\s*\/\s*s\s*\]/gi, "メートル毎秒"],
      [/\[\s*m(?:²|2)\s*\]/gi, "平方メートル"],
      [/\[\s*(?:MVA|MV・A)\s*\]/g, "メガボルトアンペア"],
      [/\[\s*kVA\s*\]/g, "キロボルトアンペア"],
      [/\[\s*MW\s*\]/g, "メガワット"],
      [/\[\s*kW\s*\]/g, "キロワット"],
      [/\[\s*kV\s*\]/g, "キロボルト"],
      [/\[\s*kA\s*\]/g, "キロアンペア"],
      [/\[\s*Hz\s*\]/gi, "ヘルツ"],
      [/\[\s*W\s*\]/g, "ワット"],
      [/\[\s*V\s*\]/g, "ボルト"],
      [/\[\s*A\s*\]/g, "アンペア"],
      [/cos\s*[φϕ]/gi, "コサインファイ"],
      [/sin\s*[φϕ]/gi, "サインファイ"],
      [/tan\s*[φϕ]/gi, "タンジェントファイ"],
      [/[％%]/g, "パーセント"],
      [/Ω/g, "オーム"],
      [/θ/g, "シータ"],
      [/[φϕ]/g, "ファイ"],
      [/η/g, "イータ"],
      [/Δ/g, "デルタ"]
    ];

    return replacements.reduce((result, [pattern, replacement]) => {
      return result.replace(pattern, replacement);
    }, text);
  }

  function normalizeTextForSpeech(text) {
    let result = stripHtml(text)
      .replace(/\r\n?/g, "\n")
      .replace(/[，,]/g, "、")
      .replace(/[．]/g, "。");

    result = replaceSimpleLatex(result);
    result = replaceUnitsAndSymbols(result);
    result = result
      .replace(/(\d)\s*[～〜]\s*(\d)/g, "$1から$2")
      .replace(/\n+/g, "。")
      .replace(/[ \t\u3000]+/g, " ")
      .replace(/\s*([、。])\s*/g, "$1")
      .replace(/。{2,}/g, "。")
      .replace(/\s+/g, " ")
      .trim();

    return result;
  }

  function buildSpeechEntry(question) {
    const completed = buildCompletedText(question);
    if (!completed.ok) {
      return completed;
    }

    const speechText = normalizeTextForSpeech(completed.displayText);
    if (!speechText) {
      return { ok: false, error: "読み上げ用文章を生成できません。", missing: [] };
    }

    return {
      ok: true,
      question,
      displayText: completed.displayText,
      speechText
    };
  }

  function isSupported() {
    return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  }

  function loadVoices() {
    if (isSupported()) {
      availableVoices = window.speechSynthesis.getVoices();
    }
  }

  function getPreferredJapaneseVoice() {
    return availableVoices.find(voice => voice.lang === "ja-JP")
      || availableVoices.find(voice => voice.lang?.toLowerCase().startsWith("ja"))
      || null;
  }

  function shuffled(items) {
    const result = items.slice();
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function createPlayer(callbacks = {}) {
    const state = {
      active: false,
      paused: false,
      waiting: false,
      completed: false,
      currentIndex: 0,
      rate: 1,
      intervalMs: 1000,
      repeat: false,
      random: false,
      sessionId: 0,
      entries: [],
      questions: [],
      currentUtterance: null,
      timerId: null,
      timerDueAt: 0,
      remainingDelay: 0,
      status: "stopped"
    };

    function snapshot() {
      return {
        active: state.active,
        paused: state.paused,
        waiting: state.waiting,
        completed: state.completed,
        currentIndex: state.currentIndex,
        count: state.questions.length,
        rate: state.rate,
        intervalMs: state.intervalMs,
        repeat: state.repeat,
        random: state.random,
        status: state.status,
        currentEntry: state.questions[state.currentIndex] || null
      };
    }

    function emit() {
      callbacks.onStateChange?.(snapshot());
    }

    function emitEntry() {
      callbacks.onEntryChange?.(
        state.questions[state.currentIndex] || null,
        state.currentIndex,
        state.questions.length
      );
      emit();
    }

    function clearTimer() {
      if (state.timerId != null) {
        window.clearTimeout(state.timerId);
      }
      state.timerId = null;
      state.timerDueAt = 0;
    }

    function cancelCurrentSpeech() {
      state.sessionId += 1;
      clearTimer();
      state.currentUtterance = null;
      state.waiting = false;
      state.remainingDelay = 0;
      if (isSupported()) {
        window.speechSynthesis.cancel();
      }
      return state.sessionId;
    }

    function rebuildQuestions() {
      state.questions = state.random ? shuffled(state.entries) : state.entries.slice();
      state.currentIndex = Math.min(state.currentIndex, Math.max(0, state.questions.length - 1));
    }

    function finish() {
      state.active = false;
      state.paused = false;
      state.waiting = false;
      state.completed = true;
      state.currentUtterance = null;
      state.status = "completed";
      emit();
    }

    function advance(sessionId) {
      if (!state.active || sessionId !== state.sessionId) {
        return;
      }

      if (state.currentIndex < state.questions.length - 1) {
        state.currentIndex += 1;
      } else if (state.repeat) {
        if (state.random) {
          state.questions = shuffled(state.entries);
        }
        state.currentIndex = 0;
      } else {
        finish();
        return;
      }

      speakCurrent(sessionId);
    }

    function scheduleAdvance(sessionId, delay = state.intervalMs) {
      if (!state.active || sessionId !== state.sessionId) {
        return;
      }

      state.waiting = true;
      state.remainingDelay = Math.max(0, delay);
      state.status = state.paused ? "paused" : "waiting";
      emit();

      if (state.paused) {
        return;
      }

      state.timerDueAt = Date.now() + state.remainingDelay;
      state.timerId = window.setTimeout(() => {
        state.timerId = null;
        state.timerDueAt = 0;
        state.waiting = false;
        state.remainingDelay = 0;
        advance(sessionId);
      }, state.remainingDelay);
    }

    function speakCurrent(sessionId) {
      if (!state.active || sessionId !== state.sessionId) {
        return;
      }

      const entry = state.questions[state.currentIndex];
      if (!entry) {
        finish();
        return;
      }

      state.waiting = false;
      state.completed = false;
      state.status = "speaking";
      callbacks.onEntryChange?.(entry, state.currentIndex, state.questions.length);

      const utterance = new SpeechSynthesisUtterance(entry.speechText);
      utterance.lang = "ja-JP";
      utterance.rate = state.rate;
      const voice = getPreferredJapaneseVoice();
      if (voice) {
        utterance.voice = voice;
      }

      state.currentUtterance = utterance;
      utterance.onend = () => {
        if (sessionId !== state.sessionId || state.currentUtterance !== utterance || !state.active) {
          return;
        }
        state.currentUtterance = null;
        scheduleAdvance(sessionId);
      };
      utterance.onerror = event => {
        if (sessionId !== state.sessionId || state.currentUtterance !== utterance || !state.active) {
          return;
        }
        state.currentUtterance = null;
        if (event.error === "canceled" || event.error === "interrupted") {
          return;
        }
        callbacks.onError?.(new Error(`音声合成エラー: ${event.error || "unknown"}`), entry);
        scheduleAdvance(sessionId);
      };

      emit();
      window.speechSynthesis.speak(utterance);
    }

    function start() {
      if (!isSupported()) {
        callbacks.onError?.(new Error("このブラウザは音声読み上げに対応していません。"), null);
        return false;
      }
      if (state.questions.length === 0) {
        callbacks.onError?.(new Error("読み上げ対象の問題がありません。"), null);
        return false;
      }

      if (state.completed) {
        if (state.random) {
          state.questions = shuffled(state.entries);
        }
        state.currentIndex = 0;
      }

      const sessionId = cancelCurrentSpeech();
      state.active = true;
      state.paused = false;
      state.completed = false;
      speakCurrent(sessionId);
      return true;
    }

    function pause() {
      if (!state.active || state.paused) {
        return;
      }

      state.paused = true;
      state.status = "paused";
      if (state.waiting) {
        state.remainingDelay = Math.max(0, state.timerDueAt - Date.now());
        clearTimer();
      } else if (isSupported()) {
        window.speechSynthesis.pause();
      }
      emit();
    }

    function resume() {
      if (!state.active || !state.paused) {
        return;
      }

      state.paused = false;
      if (state.waiting) {
        scheduleAdvance(state.sessionId, state.remainingDelay);
      } else {
        state.status = "speaking";
        if (isSupported()) {
          window.speechSynthesis.resume();
        }
        emit();
      }
    }

    function stop() {
      cancelCurrentSpeech();
      state.active = false;
      state.paused = false;
      state.completed = false;
      state.status = "stopped";
      emit();
    }

    function move(offset) {
      if (state.questions.length === 0) {
        return;
      }

      let nextIndex = state.currentIndex + offset;
      if (nextIndex < 0) {
        nextIndex = state.repeat ? state.questions.length - 1 : 0;
      } else if (nextIndex >= state.questions.length) {
        nextIndex = state.repeat ? 0 : state.questions.length - 1;
      }

      const restart = state.active;
      const sessionId = cancelCurrentSpeech();
      state.currentIndex = nextIndex;
      state.paused = false;
      state.completed = false;

      if (restart) {
        state.active = true;
        speakCurrent(sessionId);
      } else {
        state.active = false;
        state.status = "stopped";
        emitEntry();
      }
    }

    function setEntries(entries) {
      stop();
      state.entries = Array.isArray(entries) ? entries.slice() : [];
      state.currentIndex = 0;
      rebuildQuestions();
      emitEntry();
    }

    function setRate(rate) {
      const numericRate = Number(rate);
      if (![0.8, 1, 1.2, 1.5].includes(numericRate)) {
        return;
      }
      state.rate = numericRate;
      if (state.active) {
        start();
      } else {
        emit();
      }
    }

    function setIntervalMs(intervalMs) {
      state.intervalMs = Math.max(0, Number(intervalMs) || 0);
      emit();
    }

    function setRepeat(repeat) {
      state.repeat = Boolean(repeat);
      emit();
    }

    function setRandom(random) {
      const restart = state.active;
      cancelCurrentSpeech();
      state.random = Boolean(random);
      state.currentIndex = 0;
      state.completed = false;
      rebuildQuestions();

      if (restart) {
        state.active = true;
        state.paused = false;
        speakCurrent(state.sessionId);
      } else {
        state.active = false;
        state.status = "stopped";
        emitEntry();
      }
    }

    loadVoices();

    return {
      getState: snapshot,
      setEntries,
      start,
      pause,
      resume,
      stop,
      previous: () => move(-1),
      next: () => move(1),
      setRate,
      setIntervalMs,
      setRepeat,
      setRandom
    };
  }

  loadVoices();
  if (isSupported()) {
    window.speechSynthesis.addEventListener?.("voiceschanged", loadVoices);
  }

  window.AnkiTapSpeech = {
    isSupported,
    isPrimaryPowerFillBlank,
    blankNumbersInOrder,
    extractBlankAnswers,
    buildCompletedText,
    normalizeTextForSpeech,
    buildSpeechEntry,
    createPlayer
  };
})();
