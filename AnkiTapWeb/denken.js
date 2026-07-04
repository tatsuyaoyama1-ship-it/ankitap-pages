const TSV_URL = assetUrl("data/denken_questions.tsv");

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

const state = {
  rows: [],
  subject: "all"
};

const list = document.querySelector("#questionList");
const message = document.querySelector("#message");
const filterButtons = [...document.querySelectorAll("[data-subject]")];

document.addEventListener("DOMContentLoaded", async () => {
  bindFilters();
  await loadQuestions();
});

function bindFilters() {
  filterButtons.forEach(button => {
    button.addEventListener("click", () => {
      state.subject = button.dataset.subject;
      filterButtons.forEach(item => item.classList.toggle("active", item === button));
      render();
    });
  });
}

async function loadQuestions() {
  try {
    const response = await fetch(TSV_URL, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`denken_questions.tsvを読み込めませんでした: ${response.status}`);
    }

    state.rows = parseTSV(await response.text());
    render();
  } catch (error) {
    console.error("denken_questions.tsv の読み込みに失敗しました。", { url: TSV_URL, error });
    message.textContent = error.message;
  }
}

function parseTSV(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().split("\n");
  const headers = lines.shift().split("\t");

  return lines.map(line => {
    const values = line.split("\t");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function render() {
  const rows = state.subject === "all"
    ? state.rows
    : state.rows.filter(row => row.subject === state.subject);

  list.replaceChildren(...rows.map(renderCard));
  message.textContent = rows.length === 0 ? "表示できる問題がありません。" : `${rows.length}問を表示しています。`;
}

function renderCard(row) {
  const card = document.createElement("article");
  card.className = "question-card";

  const subjectName = row.subject === "denryoku_kanri" ? "電力・管理" : "機械・制御";

  card.innerHTML = `
    <header>
      <div>
        <h2></h2>
        <span></span>
      </div>
      <span></span>
    </header>
    <img alt="">
    <div class="meta">
      <div><strong>source:</strong> <span class="source"></span></div>
      <div><strong>tags:</strong> <span class="tags"></span></div>
    </div>
  `;

  card.querySelector("h2").textContent = `${subjectName} 問${row.question_no}`;
  card.querySelector("header span").textContent = row.id;
  card.querySelector("header > span").textContent = row.year;
  const image = card.querySelector("img");
  setImageSource(image, row.question_image);
  image.alt = `${subjectName} 問${row.question_no}`;
  card.querySelector(".source").textContent = row.source;
  card.querySelector(".tags").textContent = row.tags;

  return card;
}
