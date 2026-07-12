const DATA_URLS = [
  assetUrl("data/cards.csv"),
  assetUrl("AnkiTap/AnkiTap/cards.csv")
];
const DENKEN_URL = assetUrl("data/denken_questions.tsv");

function assetUrl(path) {
  return new URL(`../${path.replace(/^\/+/, "")}`, document.baseURI).href;
}

function imageAssetUrl(path) {
  return assetUrl(path.replace(/\.png$/i, ".webp"));
}

function setImageSource(image, path) {
  const originalUrl = assetUrl(path);
  const webpUrl = imageAssetUrl(path);
  image.onerror = () => {
    if (image.src !== originalUrl) {
      console.error("画像のWebP読み込みに失敗しました。PNGへフォールバックします。", { url: image.src, fallbackUrl: originalUrl });
      image.onerror = null;
      image.src = originalUrl;
    }
  };
  image.src = webpUrl;
}

async function fetchTextFromUrls(urls, label) {
  const errors = [];

  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      errors.push({ url, error });
      console.error(`${label} の読み込みに失敗しました。`, { url, error });
    }
  }

  const triedUrls = errors.map(item => item.url).join(", ");
  throw new Error(`${label}を読み込めませんでした。確認したURL: ${triedUrls}`);
}

const fillBlankSteps = [
  { key: "blank_answers_list", label: "解答" },
  { key: "supplement_only", label: "補足" }
];

const essaySteps = [
  { key: "final_answer", label: "模範解答" },
  { key: "study_tips", label: "補足" }
];

const subQuestionSections = [
  { key: "formulas", label: "使用公式" },
  { key: "calculation", label: "計算過程" },
  { key: "answer", label: "解答" }
];

const subjectLabels = {
  denryoku_kanri: "電力・管理",
  kikai_seigyo: "機械・制御"
};

const state = {
  mode: null,
  allCards: [],
  cards: [],
  currentIndex: 0,
  showingAnswer: false,
  selectedCategory: null,
  pastQuestions: [],
  visiblePastQuestions: [],
  pastIndex: 0,
  pastStep: 0,
  pastTabsRevealed: false,
  selectedPastFilter: null
};

const elements = {
  backToCategories: document.querySelector("#backToCategories"),
  shuffleButton: document.querySelector("#shuffleButton"),
  modeView: document.querySelector("#modeView"),
  formulaModeButton: document.querySelector("#formulaModeButton"),
  pastQuestionModeButton: document.querySelector("#pastQuestionModeButton"),
  printReviewModeButton: document.querySelector("#printReviewModeButton"),
  categoryView: document.querySelector("#categoryView"),
  categoryList: document.querySelector("#categoryList"),
  pastFilterView: document.querySelector("#pastFilterView"),
  pastFilterList: document.querySelector("#pastFilterList"),
  studyView: document.querySelector("#studyView"),
  pastStudyView: document.querySelector("#pastStudyView"),
  printReviewView: document.querySelector("#printReviewView"),
  printYearFilter: document.querySelector("#printYearFilter"),
  printStageFilter: document.querySelector("#printStageFilter"),
  printSubjectFilter: document.querySelector("#printSubjectFilter"),
  printReviewStatusFilter: document.querySelector("#printReviewStatusFilter"),
  printReviewCount: document.querySelector("#printReviewCount"),
  printButton: document.querySelector("#printButton"),
  printReviewPages: document.querySelector("#printReviewPages"),
  emptyView: document.querySelector("#emptyView"),
  emptyMessage: document.querySelector("#emptyMessage"),
  cardCounter: document.querySelector("#cardCounter"),
  cardState: document.querySelector("#cardState"),
  progressBar: document.querySelector("#progressBar"),
  debugMeta: document.querySelector("#debugMeta"),
  cardButton: document.querySelector("#cardButton"),
  cardCategory: document.querySelector("#cardCategory"),
  modeLabel: document.querySelector("#modeLabel"),
  cardContent: document.querySelector("#cardContent"),
  tapHint: document.querySelector("#tapHint"),
  explanationButton: document.querySelector("#explanationButton"),
  previousButton: document.querySelector("#previousButton"),
  nextButton: document.querySelector("#nextButton"),
  pastCounter: document.querySelector("#pastCounter"),
  pastSubject: document.querySelector("#pastSubject"),
  pastDebugMeta: document.querySelector("#pastDebugMeta"),
  pastReviewStatus: document.querySelector("#pastReviewStatus"),
  pastQuestionText: document.querySelector("#pastQuestionText"),
  pastQuestionImageLabel: document.querySelector("#pastQuestionImageLabel"),
  pastQuestionImage: document.querySelector("#pastQuestionImage"),
  pastTabs: document.querySelector("#pastTabs"),
  pastAnswerContent: document.querySelector("#pastAnswerContent"),
  pastPreviousButton: document.querySelector("#pastPreviousButton"),
  pastNextButton: document.querySelector("#pastNextButton"),
  explanationDialog: document.querySelector("#explanationDialog"),
  explanationContent: document.querySelector("#explanationContent"),
  closeExplanation: document.querySelector("#closeExplanation")
};

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  loadCards();
});

function bindEvents() {
  elements.formulaModeButton.addEventListener("click", enterFormulaMode);
  elements.pastQuestionModeButton.addEventListener("click", enterPastQuestionMode);
  elements.printReviewModeButton.addEventListener("click", enterPrintReviewMode);
  elements.backToCategories.addEventListener("click", handleBack);
  elements.shuffleButton.addEventListener("click", shuffleCards);
  elements.cardButton.addEventListener("click", handleCardTap);
  elements.previousButton.addEventListener("click", () => handleMove(-1));
  elements.nextButton.addEventListener("click", () => handleMove(1));
  elements.pastPreviousButton.addEventListener("click", () => movePastQuestion(-1));
  elements.pastNextButton.addEventListener("click", () => movePastQuestion(1));
  elements.pastAnswerContent.addEventListener("click", revealPastTabs);
  elements.explanationButton.addEventListener("click", showExplanation);
  elements.closeExplanation.addEventListener("click", () => elements.explanationDialog.close());
  [elements.printYearFilter, elements.printStageFilter, elements.printSubjectFilter, elements.printReviewStatusFilter].forEach(select => {
    select.addEventListener("change", renderPrintReviewPages);
  });
  elements.printButton.addEventListener("click", printReviewPages);
}

async function loadCards() {
  try {
    const text = await fetchTextFromUrls(DATA_URLS, "cards.csv");
    state.allCards = parseDelimitedCards(text);

    if (state.allCards.length === 0) {
      showEmpty("cards.csvにquestionとanswerの列を追加してください。");
      return;
    }

    showModeSelection();
  } catch (error) {
    showEmpty(`${error.message} ローカルサーバーから開いているか確認してください。`);
  }
}

async function loadPastQuestions() {
  if (state.pastQuestions.length > 0) {
    return;
  }

  const text = await fetchTextFromUrls([DENKEN_URL], "denken_questions.tsv");
  state.pastQuestions = parsePastQuestions(text);

  if (state.pastQuestions.length === 0) {
    throw new Error("denken_questions.tsvに表示できる問題がありません。");
  }
}

function parseDelimitedCards(text) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const candidates = [",", "\t", ";"].map(delimiter => parseDelimited(normalized, delimiter));
  const rows = candidates.find(hasKnownHeader) ?? candidates.sort((a, b) => maxColumns(b) - maxColumns(a))[0] ?? [];

  if (rows.length === 0) {
    return [];
  }

  const header = rows[0].map(normalizeHeader);
  const column = name => header.indexOf(name);
  const questionIndex = column("question");
  const answerIndex = column("answer");
  const categoryIndex = column("category");
  const explanationIndex = column("explanation");

  if (questionIndex < 0 || answerIndex < 0) {
    return [];
  }

  return rows.slice(1).flatMap(row => {
    const question = (row[questionIndex] ?? "").trim();
    const answer = (row[answerIndex] ?? "").trim();

    if (!question || !answer) {
      return [];
    }

    return {
      question,
      answer,
      category: (row[categoryIndex] ?? "").trim() || null,
      explanation: (row[explanationIndex] ?? "").trim() || null
    };
  });
}

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === delimiter && !inQuotes) {
      row.push(field);
      field = "";
    } else if (character === "\n" && !inQuotes) {
      row.push(field);
      if (row.some(value => value.trim())) {
        rows.push(row);
      }
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    if (row.some(value => value.trim())) {
      rows.push(row);
    }
  }

  return rows;
}

function normalizeHeader(value) {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase();
}

function hasKnownHeader(rows) {
  if (rows.length === 0) {
    return false;
  }

  const header = rows[0].map(normalizeHeader);
  return header.includes("question") && header.includes("answer");
}

function maxColumns(rows) {
  return rows.reduce((count, row) => Math.max(count, row.length), 0);
}

function parsePastQuestions(text) {
  const rows = parseDelimited(text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "\t");

  if (rows.length === 0) {
    return [];
  }

  const header = rows[0].map(normalizeHeader);
  const column = name => header.indexOf(name);
  const value = (row, name) => {
    const index = column(name);
    return index < 0 ? "" : (row[index] ?? "").trim();
  };
  const required = ["id", "year", "stage", "subject", "question_no"];

  if (required.some(name => column(name) < 0)) {
    return [];
  }

  return rows.slice(1).flatMap(row => {
    const questionImage = value(row, "question_image");
    const questionText = value(row, "question_text");

    if (!questionImage && !questionText) {
      return [];
    }

    return {
      id: value(row, "id"),
      year: value(row, "year"),
      stage: value(row, "stage"),
      subject: value(row, "subject"),
      questionNo: value(row, "question_no"),
      questionType: value(row, "question_type") || "calculation",
      reviewStatus: value(row, "review_status") || "draft",
      questionText,
      questionImage,
      answerImages: imageList(value(row, "answer_images") || value(row, "answer_image")),
      blankAnswersText: value(row, "blank_answers"),
      blankAnswers: parseBlankAnswers(value(row, "blank_answers")),
      answer_policy: value(row, "answer_policy"),
      formulas: value(row, "formulas"),
      calculation_tips: value(row, "calculation_tips"),
      study_tips: value(row, "study_tips"),
      explanation: value(row, "explanation"),
      final_answer: value(row, "final_answer"),
      subQuestions: parseSubQuestions(row, value),
      essay_outline: value(row, "essay_outline") || value(row, "answer_outline") || value(row, "answer_policy"),
      keywords: value(row, "keywords") || value(row, "important_keywords") || value(row, "formulas"),
      answer_outline: value(row, "answer_outline") || value(row, "answer_policy"),
      important_keywords: value(row, "important_keywords") || value(row, "keywords") || value(row, "formulas"),
      model_answer: value(row, "model_answer") || value(row, "final_answer"),
      supplement: value(row, "supplement") || value(row, "supplemental") || value(row, "explanation") || value(row, "calculation_tips"),
      source: value(row, "source"),
      tags: value(row, "tags"),
      official_answer_ref: value(row, "official_answer_ref"),
      formula_ids: value(row, "formula_ids")
    };
  });
}

function imageList(text) {
  return text
    .split("|")
    .map(item => item.trim())
    .filter(Boolean);
}

function parseSubQuestions(row, value) {
  const suffixes = ["", "a", "b", "c", "d", "e"];

  return [1, 2, 3, 4, 5, 6, 7, 8].flatMap(number => suffixes.flatMap(suffix => {
    const prefix = `sub${number}${suffix}`;
    const subQuestion = {
      label: value(row, `${prefix}_label`) || (suffix ? `(${number})(${suffix})` : `小問${number}`),
      policy: value(row, `${prefix}_policy`),
      formulas: value(row, `${prefix}_formulas`),
      calculation: value(row, `${prefix}_calculation`),
      tips: value(row, `${prefix}_tips`),
      answer: value(row, `${prefix}_answer`),
      answerImages: imageList(value(row, `${prefix}_answer_images`) || value(row, `${prefix}_answer_image`))
    };
    const hasContent = Object.entries(subQuestion).some(([key, item]) => {
      if (key === "label") {
        return false;
      }
      if (Array.isArray(item)) {
        return item.length > 0;
      }
      return Boolean(item);
    });
    return hasContent ? [subQuestion] : [];
  }));
}

function parseBlankAnswers(text) {
  return text.split("|").reduce((answers, pair) => {
    const separatorIndex = pair.indexOf("=");

    if (separatorIndex <= 0) {
      return answers;
    }

    const key = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();

    if (key && value) {
      answers[key] = value;
    }

    return answers;
  }, {});
}

function showModeSelection() {
  state.mode = null;
  state.selectedCategory = null;
  state.cards = [];
  state.currentIndex = 0;
  state.showingAnswer = false;
  state.pastIndex = 0;
  state.pastStep = 0;
  state.pastTabsRevealed = false;
  state.visiblePastQuestions = [];
  state.selectedPastFilter = null;

  elements.modeView.classList.remove("hidden");
  elements.categoryView.classList.add("hidden");
  elements.pastFilterView.classList.add("hidden");
  elements.studyView.classList.add("hidden");
  elements.pastStudyView.classList.add("hidden");
  elements.printReviewView.classList.add("hidden");
  elements.emptyView.classList.add("hidden");
  elements.backToCategories.classList.add("hidden");
  elements.shuffleButton.disabled = true;
  hideDebugMeta();
}

function enterFormulaMode() {
  state.mode = "formula";
  renderCategories();
}

async function enterPastQuestionMode() {
  try {
    state.mode = "past";
    await loadPastQuestions();
    renderPastFilters();
  } catch (error) {
    showEmpty(`${error.message} ローカルサーバーから開いているか確認してください。`);
  }
}

async function enterPrintReviewMode() {
  try {
    state.mode = "print";
    await loadPastQuestions();
    renderPrintReviewFilters();
    renderPrintReviewPages();
  } catch (error) {
    showEmpty(`${error.message} ローカルサーバーから開いているか確認してください。`);
  }
}

function renderPastFilters() {
  const filters = pastQuestionFilters();

  elements.pastFilterList.replaceChildren(...filters.map(filter => {
    const button = document.createElement("button");
    button.className = "category-card";
    button.type = "button";
    button.innerHTML = `<strong></strong><span></span><span aria-hidden="true">›</span>`;
    button.querySelector("strong").textContent = `${formatYear(filter.year)} ${subjectLabels[filter.subject] ?? filter.subject}`;
    button.querySelector("span").textContent = `${filter.count}問`;
    button.addEventListener("click", () => selectPastFilter(filter));
    return button;
  }));

  elements.modeView.classList.add("hidden");
  elements.categoryView.classList.add("hidden");
  elements.studyView.classList.add("hidden");
  elements.pastStudyView.classList.add("hidden");
  elements.printReviewView.classList.add("hidden");
  elements.emptyView.classList.add("hidden");
  elements.pastFilterView.classList.remove("hidden");
  elements.backToCategories.classList.remove("hidden");
  elements.shuffleButton.disabled = true;
  hideDebugMeta();
}

function pastQuestionFilters() {
  const sortYear = year => {
    if (/^r\d+$/.test(year)) {
      return 300 + Number(year.slice(1));
    }
    if (/^h\d+$/.test(year)) {
      return 200 + Number(year.slice(1));
    }
    return 0;
  };
  const grouped = new Map();

  state.pastQuestions.forEach(question => {
    const key = `${question.year}\t${question.subject}`;
    const current = grouped.get(key) ?? { year: question.year, subject: question.subject, count: 0 };
    current.count += 1;
    grouped.set(key, current);
  });

  return [...grouped.values()].sort((a, b) => {
    const yearDiff = sortYear(b.year) - sortYear(a.year);
    if (yearDiff !== 0) {
      return yearDiff;
    }
    return (subjectLabels[a.subject] ?? a.subject).localeCompare(subjectLabels[b.subject] ?? b.subject, "ja");
  });
}

function formatYear(year) {
  if (/^r\d+$/.test(year)) {
    return `令和${Number(year.slice(1))}年`;
  }

  if (/^h\d+$/.test(year)) {
    return `平成${Number(year.slice(1))}年`;
  }

  return year;
}

function selectPastFilter(filter) {
  state.selectedPastFilter = filter;
  state.visiblePastQuestions = state.pastQuestions.filter(question => (
    question.year === filter.year && question.subject === filter.subject
  ));
  state.pastIndex = 0;
  state.pastStep = 0;
  state.pastTabsRevealed = false;

  elements.modeView.classList.add("hidden");
  elements.categoryView.classList.add("hidden");
  elements.pastFilterView.classList.add("hidden");
  elements.emptyView.classList.add("hidden");
  elements.studyView.classList.add("hidden");
  elements.printReviewView.classList.add("hidden");
  elements.pastStudyView.classList.remove("hidden");
  elements.backToCategories.classList.remove("hidden");

  renderPastQuestion();
}

function renderCategories() {
  const categories = [...new Set(state.allCards.map(card => card.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));

  elements.categoryList.replaceChildren(...categories.map(category => {
    const button = document.createElement("button");
    button.className = "category-card";
    button.type = "button";
    button.innerHTML = `<strong></strong><span></span><span aria-hidden="true">›</span>`;
    button.querySelector("strong").textContent = category;
    button.querySelector("span").textContent = `${countCards(category)}枚`;
    button.addEventListener("click", () => selectCategory(category));
    return button;
  }));

  elements.emptyView.classList.add("hidden");
  elements.modeView.classList.add("hidden");
  elements.studyView.classList.add("hidden");
  elements.pastStudyView.classList.add("hidden");
  elements.printReviewView.classList.add("hidden");
  elements.pastFilterView.classList.add("hidden");
  elements.categoryView.classList.remove("hidden");
  elements.backToCategories.classList.remove("hidden");
  elements.shuffleButton.disabled = true;
  hideDebugMeta();
}

function selectCategory(category) {
  state.selectedCategory = category;
  state.cards = state.allCards.filter(card => card.category === category);
  state.currentIndex = 0;
  state.showingAnswer = false;

  elements.categoryView.classList.add("hidden");
  elements.pastFilterView.classList.add("hidden");
  elements.emptyView.classList.add("hidden");
  elements.pastStudyView.classList.add("hidden");
  elements.printReviewView.classList.add("hidden");
  elements.studyView.classList.remove("hidden");
  elements.backToCategories.classList.remove("hidden");

  renderCard();
}

function renderPrintReviewFilters() {
  setSelectOptions(elements.printYearFilter, uniqueValues(state.pastQuestions, "year"), "すべて", formatYear);
  setSelectOptions(elements.printStageFilter, uniqueValues(state.pastQuestions, "stage"), "すべて");
  setSelectOptions(elements.printSubjectFilter, uniqueValues(state.pastQuestions, "subject"), "すべて", value => subjectLabels[value] ?? value);
  setSelectOptions(elements.printReviewStatusFilter, uniqueValues(state.pastQuestions, "reviewStatus"), "すべて");

  elements.modeView.classList.add("hidden");
  elements.categoryView.classList.add("hidden");
  elements.pastFilterView.classList.add("hidden");
  elements.studyView.classList.add("hidden");
  elements.pastStudyView.classList.add("hidden");
  elements.emptyView.classList.add("hidden");
  elements.printReviewView.classList.remove("hidden");
  elements.backToCategories.classList.remove("hidden");
  elements.shuffleButton.disabled = true;
  hideDebugMeta();
}

function uniqueValues(items, key) {
  return [...new Set(items.map(item => item[key]).filter(Boolean))].sort((a, b) => {
    if (key === "year") {
      return yearSortValue(b) - yearSortValue(a);
    }
    return String(a).localeCompare(String(b), "ja");
  });
}

function yearSortValue(year) {
  if (/^r\d+$/.test(year)) {
    return 300 + Number(year.slice(1));
  }

  if (/^h\d+$/.test(year)) {
    return 200 + Number(year.slice(1));
  }

  return 0;
}

function setSelectOptions(select, values, allLabel, labelFor = value => value) {
  const previousValue = select.value;
  select.replaceChildren();

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = allLabel;
  select.append(allOption);

  values.forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labelFor(value);
    select.append(option);
  });

  if ([...select.options].some(option => option.value === previousValue)) {
    select.value = previousValue;
  }
}

function renderPrintReviewPages() {
  const questions = filteredPrintQuestions();
  const mathTargets = [];

  elements.printReviewCount.textContent = `${questions.length}問`;
  elements.printReviewPages.replaceChildren(...questions.map(question => renderPrintQuestionPage(question, mathTargets)));

  if (window.MathJax?.typesetPromise && mathTargets.length > 0) {
    MathJax.typesetPromise(mathTargets).catch(error => console.error(error));
  }
}

function filteredPrintQuestions() {
  const year = elements.printYearFilter.value;
  const stage = elements.printStageFilter.value;
  const subject = elements.printSubjectFilter.value;
  const reviewStatus = elements.printReviewStatusFilter.value;

  return state.pastQuestions.filter(question => (
    (!year || question.year === year)
    && (!stage || question.stage === stage)
    && (!subject || question.subject === subject)
    && (!reviewStatus || question.reviewStatus === reviewStatus)
  ));
}

function renderPrintQuestionPage(question, mathTargets) {
  const article = document.createElement("article");
  article.className = "print-question-page";

  const header = document.createElement("header");
  header.className = "print-question-header";
  header.append(
    textBlock("年度", formatYear(question.year)),
    textBlock("試験区分", question.stage || "-"),
    textBlock("科目", subjectLabels[question.subject] ?? question.subject),
    textBlock("問題番号", `問${question.questionNo || "-"}`),
    textBlock("question_type", question.questionType || "calculation"),
    textBlock("review_status", question.reviewStatus || "draft")
  );

  const top = document.createElement("section");
  top.className = "print-question-top";
  appendPrintSection(top, "問題文", printQuestionText(question), mathTargets);
  appendPrintImage(top, question);

  const bottom = document.createElement("section");
  bottom.className = "print-question-bottom";
  renderPrintAnswerSections(bottom, question, mathTargets);
  appendPrintSection(bottom, "公式解答参照", question.official_answer_ref, mathTargets);
  appendPrintSection(bottom, "公式ID", question.formula_ids, mathTargets);
  appendPrintSection(bottom, "出典", question.source, mathTargets);

  article.append(header, top, bottom);
  return article;
}

function printQuestionText(question) {
  if (question.questionType === "fill_blank") {
    return blankedQuestionText(question);
  }

  return question.questionText || "未入力です。";
}

function appendPrintImage(target, question) {
  if (!question.questionImage) {
    return;
  }

  const section = document.createElement("section");
  section.className = "print-section print-image-section";
  const heading = document.createElement("h3");
  heading.textContent = "問題図";
  const image = document.createElement("img");
  image.className = "print-question-image";
  image.alt = "問題図";
  setImageSource(image, question.questionImage);
  section.append(heading, image);
  target.append(section);
}

function renderPrintAnswerSections(target, question, mathTargets) {
  if (question.questionType === "essay") {
    appendPrintSection(target, "模範解答", question.final_answer || question.model_answer, mathTargets);
    appendPrintAnswerImages(target, question);
    appendPrintSection(target, "補足", question.supplement || question.explanation, mathTargets);
    appendPrintSection(target, "学習ポイント", question.study_tips, mathTargets);
    return;
  }

  if (question.questionType === "fill_blank") {
    appendPrintSection(target, "空欄状態の問題文", blankedQuestionText(question), mathTargets);
    appendPrintSection(target, "解答を埋めた問題文", filledQuestionText(question), mathTargets);
    appendPrintSection(target, "blank_answers", question.blankAnswersText, mathTargets);
    appendPrintSection(target, "補足", question.supplement || question.explanation, mathTargets);
    appendPrintSection(target, "解答", question.final_answer, mathTargets);
    appendPrintAnswerImages(target, question);
    return;
  }

  appendPrintSection(target, "使用公式", question.formulas, mathTargets);
  appendPrintSection(target, "解答方針", question.answer_policy, mathTargets);
  appendPrintSection(target, "計算過程", question.calculation_tips, mathTargets);
  appendPrintSection(target, "学習ポイント", question.study_tips, mathTargets);
  appendPrintSection(target, "解答", question.final_answer, mathTargets);
  appendPrintAnswerImages(target, question);

  question.subQuestions.forEach((subQuestion, index) => {
    const section = document.createElement("section");
    section.className = "print-sub-question";
    const heading = document.createElement("h3");
    heading.textContent = subQuestion.label || `小問(${index + 1})`;
    section.append(heading);
    appendPrintSection(section, "使用公式", subQuestion.formulas, mathTargets);
    appendPrintSection(section, "計算過程", subQuestionSectionText(subQuestion, "calculation"), mathTargets);
    appendPrintSection(section, "解答", subQuestion.answer, mathTargets);
    appendPrintAnswerImages(section, { answerImages: subQuestion.answerImages });
    target.append(section);
  });
}

function appendPrintAnswerImages(target, question) {
  if (!question.answerImages || question.answerImages.length === 0) {
    return;
  }

  const section = document.createElement("section");
  section.className = "print-section print-answer-image-section";
  const heading = document.createElement("h3");
  heading.textContent = "解答図";
  section.append(heading, ...question.answerImages.map((path, index) => {
    const image = document.createElement("img");
    image.className = "print-question-image";
    image.alt = `解答図${index + 1}`;
    setImageSource(image, path);
    return image;
  }));
  target.append(section);
}

function appendPrintSection(target, title, text, mathTargets) {
  if (!text) {
    return;
  }

  const section = document.createElement("section");
  section.className = "print-section";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const body = document.createElement("div");
  body.className = "print-section-body math";
  body.innerHTML = mathMarkup(wrapAnswerText(text));
  section.append(heading, body);
  target.append(section);
  mathTargets.push(body);
}

function textBlock(label, value) {
  const block = document.createElement("div");
  block.className = "print-meta-item";
  const labelElement = document.createElement("span");
  labelElement.textContent = label;
  const valueElement = document.createElement("strong");
  valueElement.textContent = value || "-";
  block.append(labelElement, valueElement);
  return block;
}

async function printReviewPages() {
  if (window.MathJax?.typesetPromise) {
    await MathJax.typesetPromise([...elements.printReviewPages.querySelectorAll(".math")]);
  }
  window.print();
}

function renderPastQuestion() {
  const questions = currentPastQuestions();

  if (questions.length === 0) {
    showEmpty("denken_questions.tsvに表示できる問題がありません。");
    return;
  }

  const question = questions[state.pastIndex];
  const tabs = pastTabsFor(question);
  const selectedIndex = Math.min(state.pastStep, tabs.length - 1);
  state.pastStep = Math.max(selectedIndex, 0);
  const tab = tabs[state.pastStep];
  const waitsForTap = waitsForAnswerTap(question);

  elements.pastCounter.textContent = `${state.pastIndex + 1} / ${questions.length}`;
  elements.pastSubject.textContent = `${formatYear(question.year)} ${subjectLabels[question.subject] ?? question.subject} 問${question.questionNo}`;
  renderDebugMeta(question);
  elements.pastPreviousButton.disabled = state.pastIndex === 0;
  elements.pastNextButton.textContent = state.pastIndex === questions.length - 1 ? "最初へ" : "次へ";
  elements.shuffleButton.disabled = true;
  renderPastProblem(question);

  if (waitsForTap && !state.pastTabsRevealed) {
    elements.pastTabs.classList.add("hidden");
    elements.pastTabs.replaceChildren();
    renderAnswerPlaceholder(elements.pastAnswerContent);
    return;
  }

  renderPastTabs(tabs);
  renderPastTabContent(question, tab);
}

function waitsForAnswerTap(question) {
  return question.questionType === "essay" || question.questionType === "fill_blank";
}

function pastTabsFor(question) {
  if (question.questionType === "fill_blank") {
    return tabsWithContent(question, fillBlankSteps);
  }

  if (question.questionType === "essay") {
    return [{
      key: "essay_questions",
      label: "小問"
    }];
  }

  return calculationTabsFor(question);
}

function tabsWithContent(question, tabs) {
  const filteredTabs = tabs.filter(tab => tabHasContent(question, tab));
  return filteredTabs.length > 0 ? filteredTabs : tabs.slice(0, 1);
}

function tabHasContent(question, tab) {
  if (tab.key === "supplement_only") {
    return Boolean(question.supplement || question.explanation || question.study_tips);
  }

  if (tab.key === "blank_answers_list") {
    return Boolean(Object.keys(question.blankAnswers).length > 0 || question.final_answer);
  }

  if (tab.key === "filled_question") {
    return Boolean(question.questionText || question.final_answer || question.answerImages.length > 0);
  }

  if (tab.key === "final_answer" || tab.key === "model_answer") {
    return Boolean(question[tab.key] || question.answerImages.length > 0);
  }

  return Boolean(question[tab.key]);
}

function calculationTabsFor(question) {
  return [{
    key: "calculation_questions",
    label: "小問"
  }];
}

function renderDebugMeta(question) {
  const values = [
    `year: ${question.year || "-"}`,
    `stage: ${question.stage || "-"}`,
    `subject: ${question.subject || "-"}`,
    `question_no: ${question.questionNo || "-"}`,
    `question_type: ${question.questionType || "calculation"}`
  ];

  elements.debugMeta.textContent = values.join(" / ");
  elements.debugMeta.classList.remove("hidden");
  elements.pastDebugMeta.textContent = values.join(" / ");
  elements.pastDebugMeta.classList.remove("hidden");
  elements.pastReviewStatus.textContent = `確認状態: ${question.reviewStatus || "draft"}`;
  elements.pastReviewStatus.classList.remove("hidden");
}

function hideDebugMeta() {
  elements.debugMeta.textContent = "";
  elements.debugMeta.classList.add("hidden");
  elements.pastDebugMeta.textContent = "";
  elements.pastDebugMeta.classList.add("hidden");
  elements.pastReviewStatus.textContent = "";
  elements.pastReviewStatus.classList.add("hidden");
}

function renderPastProblem(question) {
  if (question.questionText) {
    const text = question.questionType === "fill_blank" ? blankedQuestionText(question) : question.questionText;
    renderMath(elements.pastQuestionText, text);
  } else {
    elements.pastQuestionText.textContent = "問題文は画像を確認してください。";
  }

  elements.pastQuestionImage.textContent = "";

  if (!question.questionImage) {
    elements.pastQuestionImage.closest(".past-question-panel").classList.add("no-question-image");
    elements.pastQuestionImageLabel.classList.add("hidden");
    elements.pastQuestionImage.classList.add("hidden");
    return;
  }

  elements.pastQuestionImage.closest(".past-question-panel").classList.remove("no-question-image");
  elements.pastQuestionImageLabel.classList.remove("hidden");
  elements.pastQuestionImage.classList.remove("hidden");

  const image = document.createElement("img");
  image.className = "past-question-img";
  if (isFitWidthQuestionFigure(question)) {
    image.classList.add("past-question-img-fit-width");
  }
  image.alt = "過去問の問題図";
  setImageSource(image, question.questionImage);
  elements.pastQuestionImage.append(image);
}

function isFitWidthQuestionFigure(question) {
  return [
    "r06_second_kikai_seigyo_q03",
    "r06_second_denryoku_kanri_q04",
    "r05_second_kikai_seigyo_q02",
    "r05_second_kikai_seigyo_q04",
    "r05_second_denryoku_kanri_q03",
    "r05_second_denryoku_kanri_q04"
  ].includes(question.id);
}

function renderPastTabs(tabs) {
  if (tabs.length <= 1) {
    elements.pastTabs.classList.add("hidden");
    elements.pastTabs.replaceChildren();
    return;
  }

  elements.pastTabs.classList.remove("hidden");
  elements.pastTabs.replaceChildren(...tabs.map((tab, index) => {
    const button = document.createElement("button");
    button.className = "past-tab";
    button.type = "button";
    button.textContent = tab.label;
    button.setAttribute("aria-selected", index === state.pastStep ? "true" : "false");
    button.addEventListener("click", () => {
      state.pastStep = index;
      renderPastQuestion();
    });
    return button;
  }));
}

function renderPastTabContent(question, tab) {
  if (tab.key === "calculation_questions") {
    renderCalculationContent(elements.pastAnswerContent, question);
    return;
  }

  if (tab.key === "essay_questions") {
    renderEssayContent(elements.pastAnswerContent, question);
    return;
  }

  if (tab.key === "blank_question") {
    renderMath(elements.pastAnswerContent, wrapAnswerText(blankedQuestionText(question)));
    return;
  }

  if (tab.key === "blank_answers_list") {
    renderAnswerTextWithImages(elements.pastAnswerContent, blankAnswersListText(question), null);
    return;
  }

  if (tab.key === "filled_question") {
    renderAnswerTextWithImages(elements.pastAnswerContent, filledQuestionText(question), null);
    return;
  }

  if (tab.key === "supplement_only") {
    renderMath(elements.pastAnswerContent, wrapAnswerText(question.supplement || question.explanation || question.study_tips || "未入力です。"));
    return;
  }

  const shouldShowAnswerImages = ["final_answer", "model_answer"].includes(tab.key);
  renderAnswerTextWithImages(elements.pastAnswerContent, question[tab.key] || "未入力です。", shouldShowAnswerImages ? question : null);
}

function renderAnswerTextWithImages(target, text, question) {
  target.textContent = "";
  const body = document.createElement("div");
  body.className = "math";
  body.innerHTML = mathMarkup(wrapAnswerText(text));
  target.append(body);
  appendAnswerImages(target, question?.answerImages);

  if (window.MathJax?.typesetPromise) {
    MathJax.typesetPromise([body]).catch(error => console.error(error));
  }
}

function renderAnswerPlaceholder(target) {
  target.textContent = "";
  target.classList.remove("sub-question-content");

  const button = document.createElement("button");
  button.className = "answer-reveal-button";
  button.type = "button";
  button.textContent = "タップして解答タブを表示";
  button.addEventListener("click", revealPastTabs);
  target.append(button);
}

function revealPastTabs() {
  if (state.mode !== "past") {
    return;
  }

  const question = currentPastQuestions()[state.pastIndex];

  if (!question || !waitsForAnswerTap(question) || state.pastTabsRevealed) {
    return;
  }

  state.pastTabsRevealed = true;
  renderPastQuestion();
}

function renderCalculationContent(target, question) {
  target.textContent = "";
  target.classList.add("sub-question-content");

  const fragment = document.createDocumentFragment();
  const mathTargets = [];
  const subQuestions = subQuestionsForDisplay(question);

  subQuestions.forEach((subQuestion, index) => {
    appendSubQuestionDetails(fragment, mathTargets, subQuestion, index);
  });

  target.append(fragment);
  appendAnswerImages(target, question.answerImages);

  if (window.MathJax?.typesetPromise) {
    MathJax.typesetPromise(mathTargets).catch(error => console.error(error));
  }
}

function renderEssayContent(target, question) {
  target.textContent = "";
  target.classList.add("sub-question-content");

  const fragment = document.createDocumentFragment();
  const mathTargets = [];
  const subQuestions = essaySubQuestionsForDisplay(question);

  subQuestions.forEach((subQuestion, index) => {
    appendSubQuestionDetails(fragment, mathTargets, subQuestion, index);
  });

  target.append(fragment);
  appendAnswerImages(target, question.answerImages);

  if (window.MathJax?.typesetPromise) {
    MathJax.typesetPromise(mathTargets).catch(error => console.error(error));
  }
}

function subQuestionsForDisplay(question) {
  return question.subQuestions.length > 0 ? question.subQuestions : [{
    label: "解答",
    policy: question.answer_policy,
    formulas: question.formulas,
    calculation: question.calculation_tips,
    tips: question.study_tips,
    answer: question.final_answer
  }];
}

function essaySubQuestionsForDisplay(question) {
  if (question.subQuestions.length > 0) {
    return question.subQuestions;
  }

  const labels = splitNumberedBlocks(question.questionText).map(item => item.text);
  const answers = splitNumberedBlocks(question.final_answer || question.model_answer);

  if (labels.length > 0 && answers.length > 0) {
    return labels.map((label, index) => ({
      label,
      policy: "",
      formulas: "",
      calculation: "",
      tips: "",
      answer: answers[index]?.text || "",
      answerImages: []
    })).filter(item => item.answer || item.label);
  }

  return [{
    label: "模範解答",
    policy: "",
    formulas: "",
    calculation: "",
    tips: "",
    answer: question.final_answer || question.model_answer || "未入力です。",
    answerImages: question.answerImages
  }];
}

function splitNumberedBlocks(text) {
  const source = (text || "").trim();
  if (!source) {
    return [];
  }

  const matches = [...source.matchAll(/(?:^|\n)\s*\((\d+)\)\s*/g)];
  if (matches.length === 0) {
    return [];
  }

  return matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : source.length;
    return {
      number: match[1],
      text: `(${match[1]}) ${source.slice(start, end).trim()}`
    };
  });
}

function appendSubQuestionDetails(fragment, mathTargets, subQuestion, index) {
  const details = document.createElement("details");
  details.className = "sub-question-details";

  const summary = document.createElement("summary");
  summary.className = "sub-question-summary math";
  summary.innerHTML = mathMarkup(wrapAnswerText(subQuestion.label || `小問${index + 1}`));
  mathTargets.push(summary);

  const content = document.createElement("div");
  content.className = "sub-question-expanded";

  renderSubQuestionSections(content, subQuestion, mathTargets);
  details.append(summary, content);
  fragment.append(details);
}

function renderSubQuestionSections(target, subQuestion, mathTargets) {
  subQuestionSections.forEach(section => {
    const sectionText = subQuestionSectionText(subQuestion, section.key);
    const hasAnswerImages = section.key === "answer" && subQuestion.answerImages.length > 0;

    if (!sectionText && !hasAnswerImages) {
      return;
    }

    const sectionElement = document.createElement("section");
    sectionElement.className = "sub-answer-section";

    const heading = document.createElement("h3");
    heading.textContent = section.label;

    const body = document.createElement("div");
    body.className = "sub-answer-body math";
    body.innerHTML = mathMarkup(wrapAnswerText(sectionText));

    sectionElement.append(heading, body);
    if (hasAnswerImages) {
      appendAnswerImages(sectionElement, subQuestion.answerImages);
    }
    target.append(sectionElement);
    mathTargets.push(body);
  });
}

function appendAnswerImages(target, images) {
  if (!images || images.length === 0) {
    return;
  }

  const section = document.createElement("section");
  section.className = "answer-image-section";
  const heading = document.createElement("h3");
  heading.textContent = "解答図";
  section.append(heading, ...images.map((path, index) => {
    const image = document.createElement("img");
    image.className = "answer-image";
    image.alt = `解答図${index + 1}`;
    setImageSource(image, path);
    return image;
  }));
  target.append(section);
}

function subQuestionSectionText(subQuestion, key) {
  if (key === "calculation") {
    return [subQuestion.policy, subQuestion.calculation, subQuestion.tips]
      .filter(Boolean)
      .join("\n\n");
  }

  return subQuestion[key];
}

function renderQuestionStep(target, question) {
  target.classList.remove("question-image-content");

  if (question.questionText) {
    renderMath(target, question.questionText);
    return;
  }

  if (question.questionImage) {
    renderQuestionImage(target, question.questionImage);
    return;
  }

  renderMath(target, "未入力です。");
}

function renderFillBlankQuestion(target, question, filled) {
  target.classList.remove("question-image-content");

  if (question.questionText) {
    renderMath(target, filled ? filledQuestionText(question) : blankedQuestionText(question));
    return;
  }

  if (question.questionImage) {
    renderQuestionImage(target, question.questionImage);
    return;
  }

  renderMath(target, "未入力です。");
}

function blankedQuestionText(question) {
  return (question.questionText || "未入力です。").replace(/【blank(\d+)】/g, (_match, number) => `【空欄${number}】`);
}

function filledQuestionText(question) {
  return (question.questionText || "未入力です。").replace(/【(blank\d+)】/g, (_match, key) => {
    return question.blankAnswers[key] ?? "＿＿＿";
  });
}

function blankAnswersListText(question) {
  const answers = Object.entries(question.blankAnswers)
    .map(([key, answer]) => {
      const number = key.replace(/^blank/, "");
      return `空欄${number}: ${answer}`;
    });

  if (answers.length > 0) {
    return answers.join("\n");
  }

  return question.final_answer || "未入力です。";
}

function countCards(category) {
  return state.allCards.filter(card => card.category === category).length;
}

function renderCard() {
  if (state.cards.length === 0) {
    showEmpty("選択したカテゴリにカードがありません。");
    return;
  }

  const card = state.cards[state.currentIndex];
  const text = state.showingAnswer ? card.answer : card.question;

  elements.cardCounter.textContent = `${state.currentIndex + 1} / ${state.cards.length}`;
  elements.cardState.textContent = state.showingAnswer ? "回答表示中" : "出題中";
  elements.progressBar.max = state.cards.length;
  elements.progressBar.value = state.currentIndex + 1;
  elements.cardCategory.textContent = card.category ?? "";
  elements.modeLabel.textContent = state.showingAnswer ? "回答" : "問題";
  elements.tapHint.textContent = `タップして${state.showingAnswer ? "問題" : "回答"}を表示`;
  elements.explanationButton.classList.toggle("hidden", !(state.showingAnswer && card.explanation));
  elements.previousButton.disabled = state.currentIndex === 0;
  elements.nextButton.textContent = state.currentIndex === state.cards.length - 1 ? "最初へ" : "次へ";
  elements.shuffleButton.disabled = state.cards.length < 2;
  elements.cardButton.classList.remove("past-question-card");
  elements.cardContent.classList.remove("question-image-content");
  hideDebugMeta();

  renderMath(elements.cardContent, text);
}

function renderQuestionImage(target, imagePath) {
  target.textContent = "";
  target.classList.add("question-image-content");

  const image = document.createElement("img");
  image.className = "question-image";
  image.alt = "過去問の問題画像";
  setImageSource(image, imagePath);
  target.append(image);
}

function renderMath(target, text) {
  target.textContent = "";
  target.classList.remove("sub-question-content");

  const wrapper = document.createElement("span");
  wrapper.innerHTML = mathMarkup(text);
  target.append(wrapper);

  if (window.MathJax?.typesetPromise) {
    MathJax.typesetPromise([target]).catch(error => {
      target.textContent = text;
      console.error(error);
    });
  }
}

function mathMarkup(text) {
  if (text.includes("\\(") || text.includes("\\[") || text.includes("$$") || text.includes("$")) {
    return escapeHTML(String(text ?? "")).replace(/\n/g, "<br>");
  }

  const normalizedText = targetAwareWrapText(text);
  return mathTextMarkup(normalizedText);
}

function mathTextMarkup(text) {
  return String(text ?? "")
    .split("\n")
    .map(line => inlineFormulaMarkup(line))
    .join("<br>");
}

function inlineFormulaMarkup(line) {
  if (!looksLikeFormulaLine(line)) {
    return escapeHTML(line);
  }

  const formulaPattern = /(?:\((?:[^()\n]*?(?:[=×√]|[A-Z]\u0307|[A-Za-z]_[A-Za-z0-9{}]+|[₀₁₂₃₄₅₆₇₈₉ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ])[^()\n]*?)\))|(?:(?:\|?[A-Za-z]\u0307[₀₁₂₃₄₅₆₇₈₉ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ]*\|?|[A-Za-z]+_[A-Za-z0-9{}]+|[A-Za-z][₀₁₂₃₄₅₆₇₈₉ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ]+|[A-Z]_[A-Za-z0-9{}]+|[A-Z][A-Za-z]*|[0-9.]+)\s*=\s*[^。\n、,，]*?(?:p\.u\.|MV・A|kV|A|%|(?=[。、,，\n]|$)))|(?:\|[A-Za-z]\u0307[₀₁₂₃₄₅₆₇₈₉ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ]*\|\s*=\s*[^。\n、,，]*?(?:p\.u\.|MV・A|kV|A|%|(?=[。、,，\n]|$)))/g;
  let cursor = 0;
  let html = "";
  let matched = false;

  for (const match of line.matchAll(formulaPattern)) {
    const before = line.slice(cursor, match.index);
    const formula = match[0].startsWith("(") && match[0].endsWith(")") ? match[0].slice(1, -1) : match[0].trim();

    html += escapeHTML(before);
    html += formulaToMathHtml(formula);
    cursor = match.index + match[0].length;
    matched = true;
  }

  html += escapeHTML(line.slice(cursor));

  if (matched) {
    return html;
  }

  if (/^[\s\dA-Za-z₀₁₂₃₄₅₆₇₈₉ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ+\-*/=×√.^|%{}_,\u0307]+$/.test(line)) {
    return formulaToMathHtml(line);
  }

  return escapeHTML(line);
}

function formulaToMathHtml(formula) {
  const parts = String(formula ?? "").split("=");

  if (parts.length <= 1) {
    return `\\(${formulaTextToLatex(formula)}\\)`;
  }

  return parts
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => `\\(${formulaTextToLatex(part)}\\)`)
    .join('<span class="formula-equals">=</span>');
}

function formulaTextToLatex(text) {
  return String(text ?? "")
    .replace(/([A-Za-z])_\{?([A-Za-z0-9]+)\}?/g, (_match, variable, subscript) => {
      if (variable.length !== 1) {
        return _match;
      }
      return `${variable}_{${subscript}}`;
    })
    .replace(/([A-Za-z])\u0307([₀₁₂₃₄₅₆₇₈₉ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ]+)/g, (_match, variable, subscript) => `\\dot{${variable}}_{${fromSubscript(subscript)}}`)
    .replace(/([A-Za-z])\u0307/g, (_match, variable) => `\\dot{${variable}}`)
    .replace(/([A-Za-z])([₀₁₂₃₄₅₆₇₈₉ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ]+)/g, (_match, variable, subscript) => `${variable}_{${fromSubscript(subscript)}}`)
    .replace(/([0-9.]+)\s*\/\s*([0-9.]+)/g, "\\frac{$1}{$2}")
    .replace(/([A-Za-z]_\{?[A-Za-z0-9]+\}?|[A-Za-z])\s*\/\s*([A-Za-z]_\{?[A-Za-z0-9]+\}?|[A-Za-z])/g, "\\frac{$1}{$2}")
    .replace(/√\s*([A-Za-z0-9.]+)/g, "\\sqrt{$1}")
    .replace(/×/g, "\\times ")
    .replace(/tanδ/g, "\\tan\\delta ")
    .replace(/ω/g, "\\omega ")
    .replace(/δ/g, "\\delta ")
    .replace(/\|([^|]+)\|/g, "\\lvert $1 \\rvert")
    .replace(/\s*(p\.u\.|MV・A|kV|A)\s*$/g, "\\,\\mathrm{$1}")
    .replace(/%/g, "\\%");
}

function targetAwareWrapText(text) {
  return normalizeFormulaText(normalizeNestedQuestionLabels(typeof text === "string" ? text : String(text ?? "")));
}

function wrapAnswerText(text) {
  const normalizedText = normalizeNestedQuestionLabels(String(text ?? ""));

  if (normalizedText.includes("\\(") || normalizedText.includes("\\[")) {
    return normalizedText.trim();
  }

  return cleanupWrappedLines(normalizedText
    .replace(/\s+\/\s+/g, "\n")
    .replace(/\s*、\s*(?=\()/g, "\n")
    .replace(/\s*。\s*(?=\()/g, "。\n")
    .replace(/\s*(?=\((?:dot|\\dot|\\frac|frac|sqrt|\\sqrt))/g, "\n")
    .replace(/(?<=\))\s*(?=\()/g, "\n")
    .replace(/。(?=[\\(A-Z0-9（])/g, "。\n")
    .replace(/、(?=[\\(A-Z0-9（])/g, "、\n")
    .replace(/(p\.u\.)(?=。|、|\s)/g, "$1\n")
    .replace(/(\\\([^)]{34,}\\\))/g, "\n$1\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim());
}

function normalizeNestedQuestionLabels(text) {
  return String(text ?? "")
    .replace(/\((\d+)\)(?:\s|<br\s*\/?>)+\(([a-z])\)/gi, "($1)($2)")
    .replace(/\((\d+)\)\(([a-z])\)/gi, "($1)\u2060($2)");
}

function cleanupWrappedLines(text) {
  return text
    .split("\n")
    .map(line => cleanWrappedLine(line.trim()))
    .filter(Boolean)
    .join("\n");
}

function cleanWrappedLine(line) {
  if (/^[。、,.，]+$/.test(line)) {
    return "";
  }

  if (!looksLikeFormulaLine(line)) {
    return line;
  }

  return line
    .replace(/^[。、,.，]\s*/, "")
    .replace(/\s*[。、，]+$/, "")
    .replace(/\s+\.$/, "")
    .trim();
}

function looksLikeFormulaLine(line) {
  return /[=×√]|p\.u\.|%|[A-Z]\u0307|_[A-Za-z0-9{]/.test(normalizeFormulaText(line));
}

function normalizeFormulaText(text) {
  return String(text ?? "")
    .replace(/\u000c\s*rac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)")
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)")
    .replace(/\bfrac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)")
    .replace(/\u000c\s*rac/g, "/")
    .replace(/\t\s*imes/g, "×")
    .replace(/\t\s*andelta/g, "tanδ")
    .replace(/\bandelta\b/g, "tanδ")
    .replace(/\bomega\b/g, "ω")
    .replace(/\bsqrt\{([^{}]+)\}/g, "√$1")
    .replace(/\\sqrt\{([^{}]+)\}/g, "√$1")
    .replace(/\\times/g, "×")
    .replace(/\\dot\{([A-Za-z])\}/g, "$1\u0307")
    .replace(/dot\{([A-Za-z])\}/g, "$1\u0307")
    .replace(/([A-Z]\u0307)_\{?([A-Za-z0-9]+)\}?/g, (_match, variable, subscript) => `${variable}${toSubscript(subscript)}`)
    .replace(/([A-Za-z0-9}_])([A-Z]\u0307)/g, "$1 $2");
}

function toSubscript(text) {
  const subscripts = {
    0: "₀",
    1: "₁",
    2: "₂",
    3: "₃",
    4: "₄",
    5: "₅",
    6: "₆",
    7: "₇",
    8: "₈",
    9: "₉",
    a: "ₐ",
    e: "ₑ",
    h: "ₕ",
    i: "ᵢ",
    j: "ⱼ",
    k: "ₖ",
    l: "ₗ",
    m: "ₘ",
    n: "ₙ",
    o: "ₒ",
    p: "ₚ",
    r: "ᵣ",
    s: "ₛ",
    t: "ₜ",
    u: "ᵤ",
    v: "ᵥ",
    x: "ₓ",
    "+": "₊",
    "-": "₋"
  };

  return String(text ?? "")
    .split("")
    .map(character => subscripts[character] ?? subscripts[character.toLowerCase()] ?? character)
    .join("");
}

function fromSubscript(text) {
  const normal = {
    "₀": "0",
    "₁": "1",
    "₂": "2",
    "₃": "3",
    "₄": "4",
    "₅": "5",
    "₆": "6",
    "₇": "7",
    "₈": "8",
    "₉": "9",
    "ₐ": "a",
    "ₑ": "e",
    "ₕ": "h",
    "ᵢ": "i",
    "ⱼ": "j",
    "ₖ": "k",
    "ₗ": "l",
    "ₘ": "m",
    "ₙ": "n",
    "ₒ": "o",
    "ₚ": "p",
    "ᵣ": "r",
    "ₛ": "s",
    "ₜ": "t",
    "ᵤ": "u",
    "ᵥ": "v",
    "ₓ": "x",
    "₊": "+",
    "₋": "-"
  };

  return String(text ?? "")
    .split("")
    .map(character => normal[character] ?? character)
    .join("");
}

function containsLaTeX(text) {
  return text.includes("\\") || text.includes("^") || text.includes("_");
}

function escapeHTML(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function handleCardTap() {
  if (state.mode === "past") {
    advancePastStep();
    return;
  }

  toggleAnswer();
}

function toggleAnswer() {
  state.showingAnswer = !state.showingAnswer;
  renderCard();
}

function handleMove(offset) {
  if (state.mode === "past") {
    movePastQuestion(offset);
    return;
  }

  moveCard(offset);
}

function moveCard(offset) {
  if (state.currentIndex === state.cards.length - 1 && offset > 0) {
    state.currentIndex = 0;
  } else {
    state.currentIndex = Math.min(Math.max(state.currentIndex + offset, 0), state.cards.length - 1);
  }

  state.showingAnswer = false;
  renderCard();
}

function advancePastStep() {
  const question = currentPastQuestions()[state.pastIndex];

  if (waitsForAnswerTap(question) && !state.pastTabsRevealed) {
    state.pastTabsRevealed = true;
    renderPastQuestion();
    return;
  }

  state.pastStep = (state.pastStep + 1) % pastTabsFor(question).length;
  renderPastQuestion();
}

function movePastQuestion(offset) {
  const questions = currentPastQuestions();

  if (state.pastIndex === questions.length - 1 && offset > 0) {
    state.pastIndex = 0;
  } else {
    state.pastIndex = Math.min(Math.max(state.pastIndex + offset, 0), questions.length - 1);
  }

  state.pastStep = 0;
  state.pastTabsRevealed = false;
  renderPastQuestion();
}

function shuffleCards() {
  for (let index = state.cards.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [state.cards[index], state.cards[swapIndex]] = [state.cards[swapIndex], state.cards[index]];
  }

  state.currentIndex = 0;
  state.showingAnswer = false;
  renderCard();
}

function handleBack() {
  if (state.mode === "formula" && state.selectedCategory) {
    showCategories();
    return;
  }

  if (state.mode === "past" && state.selectedPastFilter) {
    state.selectedPastFilter = null;
    state.visiblePastQuestions = [];
    renderPastFilters();
    return;
  }

  showModeSelection();
}

function currentPastQuestions() {
  return state.visiblePastQuestions.length > 0 ? state.visiblePastQuestions : state.pastQuestions;
}

function showCategories() {
  state.selectedCategory = null;
  state.cards = [];
  state.currentIndex = 0;
  state.showingAnswer = false;
  renderCategories();
}

function showExplanation() {
  const card = state.cards[state.currentIndex];
  elements.explanationContent.textContent = card.explanation ?? "";
  elements.explanationDialog.showModal();
}

function showEmpty(message) {
  elements.emptyMessage.textContent = message;
  hideDebugMeta();
  elements.modeView.classList.add("hidden");
  elements.categoryView.classList.add("hidden");
  elements.pastFilterView.classList.add("hidden");
  elements.studyView.classList.add("hidden");
  elements.pastStudyView.classList.add("hidden");
  elements.printReviewView.classList.add("hidden");
  elements.emptyView.classList.remove("hidden");
}
