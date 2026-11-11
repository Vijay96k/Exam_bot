const $ = s => document.querySelector(s);
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: k => { try { localStorage.removeItem(k); } catch {} }
};

let apiKey = store.get('oa_key') || '';
let model = store.get('oa_model') || 'gpt-4o-mini';
let questions = [], idx = 0, results = [];

function show(id) {
  document.querySelectorAll('main > section').forEach(s => (s.hidden = s.id !== id));
  $('#reset').hidden = !apiKey;
  say('');
}
function say(text, ok) {
  const m = $('#msg');
  m.textContent = text;
  m.className = ok ? 'ok' : '';
}
function busy(btn, on, label) {
  btn.disabled = on;
  if (label) btn.textContent = label;
}

async function ai(system, user) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  });
  const d = await r.json();
  if (!r.ok) {
    if (r.status === 401) throw new Error('Your API key was rejected. Use "Change API key" to enter it again.');
    throw new Error(d.error?.message || 'Request failed (' + r.status + ')');
  }
  return JSON.parse(d.choices[0].message.content);
}

/* 1. API key */
$('#saveKey').onclick = () => {
  const k = $('#keyIn').value.trim();
  if (!k.startsWith('sk-')) return say('That does not look like an OpenAI key. It should start with "sk-".');
  apiKey = k;
  model = $('#modelIn').value.trim() || 'gpt-4o-mini';
  store.set('oa_key', apiKey);
  store.set('oa_model', model);
  $('#keyIn').value = '';
  show('setup');
};
$('#reset').onclick = () => {
  store.del('oa_key');
  apiKey = '';
  $('#modelIn').value = model;
  show('key');
};

/* 2. Setup and question generation */
$('#start').onclick = async () => {
  const topics = $('#topics').value.trim();
  if (!topics) return say('Add at least one syllabus topic.');
  const n = $('#count').value, level = $('#level').value;
  const btn = $('#start');
  busy(btn, true, 'Writing your paper...');
  say('');
  try {
    const data = await ai(
      'You are a strict university examiner. Return JSON only: {"questions":[{"topic":"","question":""}]}. ' +
      'Cover the given topics, spread evenly. Each question must be answerable with a short written answer and name its topic.',
      `Topics: ${topics}\nNumber of questions: ${n}\nDifficulty: ${level}`
    );
    questions = (data.questions || []).slice(0, Number(n));
    if (!questions.length) throw new Error('No questions came back. Try again.');
    idx = 0;
    results = [];
    show('exam');
    showQuestion();
  } catch (e) {
    say(e.message);
  } finally {
    busy(btn, false, 'Start exam');
  }
};

/* 3. Exam */
function showQuestion() {
  const q = questions[idx];
  $('#progress').textContent = `Question ${idx + 1} of ${questions.length} · ${q.topic}`;
  $('#question').textContent = q.question;
  $('#answer').value = '';
  $('#answer').disabled = false;
  $('#submit').hidden = false;
  $('#result').hidden = true;
  $('#next').textContent = idx === questions.length - 1 ? 'See result' : 'Next question';
  $('#answer').focus();
}

$('#submit').onclick = async () => {
  const answer = $('#answer').value.trim();
  if (!answer) return say('Write an answer first.');
  const q = questions[idx];
  const btn = $('#submit');
  busy(btn, true, 'Marking...');
  say('');
  try {
    const g = await ai(
      'You are a strict but fair examiner. Grade the student answer. Return JSON only: ' +
      '{"score": integer 0-10, "feedback": "what was correct, what was missing or wrong", "model_answer": "ideal concise answer"}.',
      `Question: ${q.question}\nStudent answer: ${answer}`
    );
    const score = Math.max(0, Math.min(10, Math.round(Number(g.score) || 0)));
    results.push({ topic: q.topic, score });
    $('#scoreNum').textContent = score;
    $('#feedback').textContent = g.feedback || '';
    $('#model').textContent = g.model_answer || '';
    $('#answer').disabled = true;
    btn.hidden = true;
    $('#result').hidden = false;
  } catch (e) {
    say(e.message);
  } finally {
    busy(btn, false, 'Mark my answer');
  }
};

$('#next').onclick = () => {
  idx++;
  idx < questions.length ? showQuestion() : showSummary();
};

/* 4. Summary */
let weakTopics = [];
function showSummary() {
  const sum = results.reduce((a, r) => a + r.score, 0);
  $('#total').textContent = `${sum} / ${results.length * 10}`;
  const by = {};
  results.forEach(r => (by[r.topic] ||= []).push(r.score));
  const rows = Object.entries(by).map(([t, s]) => [t, s.reduce((a, b) => a + b, 0) / s.length]);
  rows.sort((a, b) => a[1] - b[1]);
  weakTopics = rows.filter(r => r[1] < 6).map(r => r[0]);
  const list = $('#byTopic');
  list.innerHTML = '';
  rows.forEach(([t, avg]) => {
    const li = document.createElement('li');
    if (avg < 6) li.className = 'weak';
    const name = document.createElement('span');
    name.textContent = t;
    const val = document.createElement('b');
    val.textContent = avg.toFixed(1) + '/10';
    li.append(name, val);
    list.append(li);
  });
  $('#retryWeak').hidden = !weakTopics.length;
  show('summary');
}
$('#retryWeak').onclick = () => {
  $('#topics').value = weakTopics.join(', ');
  show('setup');
};
$('#again').onclick = () => show('setup');

show(apiKey ? 'setup' : 'key');
