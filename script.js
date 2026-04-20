const sampleRows = [
  {
    task: "Classification (IAB)",
    model: "zlm-v1-iab-classify-edge-enriched",
    tokens: 247,
    zeroGpu: 0.00005,
    llm: 0.00247,
  },
  {
    task: "Summarization",
    model: "t5-small",
    tokens: 76,
    zeroGpu: 0.000014,
    llm: 0.00076,
  },
  {
    task: "Follow-up generation",
    model: "zlm-v1-followup-questions-edge",
    tokens: 82,
    zeroGpu: 0.000026,
    llm: 0.00082,
  },
  {
    task: "Extraction (NER)",
    model: "gliner2-base-v1",
    tokens: 89,
    zeroGpu: 0.00002,
    llm: 0.00089,
  },
];

function usd(v) {
  return `$${v.toFixed(6)}`;
}

function renderRows() {
  const body = document.getElementById("results-body");
  if (!body) return;

  body.innerHTML = sampleRows
    .map((row) => {
      const savings = Math.max(0, row.llm - row.zeroGpu);
      return `<tr>
        <td>${row.task}</td>
        <td>${row.model}</td>
        <td>${row.tokens}</td>
        <td>${usd(row.zeroGpu)}</td>
        <td>${usd(row.llm)}</td>
        <td>${usd(savings)}</td>
      </tr>`;
    })
    .join("");
}

renderRows();
