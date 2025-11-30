/* Multiplication flashcard logic (2..9)
   - Adds a "attempt" mode: 20 random questions per attempt
   - Tracks attempt duration and stores the latest 5 attempts in localStorage
*/
(function(){
  const questionEl = document.getElementById('question');
  const answerInput = document.getElementById('answer');
  const submitBtn = document.getElementById('submitBtn');
  const showBtn = document.getElementById('showBtn');
  const nextBtn = document.getElementById('nextBtn');
  const startAttemptBtn = document.getElementById('startAttemptBtn');
  const modeNormalBtn = document.getElementById('modeNormalBtn');
  const modeChallengeBtn = document.getElementById('modeChallengeBtn');
  const feedbackEl = document.getElementById('feedback');
  const correctEl = document.getElementById('correct');
  const incorrectEl = document.getElementById('incorrect');
  const historyList = document.getElementById('historyList');
  const progressEl = document.getElementById('progress');
  const timerEl = document.getElementById('timer');
  const cardEl = document.getElementById('card');
  const cardPlaceholderEl = document.getElementById('cardPlaceholder');
  const accuracyEl = document.getElementById('accuracy');

  let state = {
    // global counters (non-attempt quick practice)
    correct:0,
    incorrect:0,
    // store latest attempts (max 5)
    attempts: [] // {startedAt, durationSec, correct, incorrect, total, mode}
  };

  // attempt runtime state
  let inAttempt = false;
  let attemptQuestions = []; // array of {a,b}
  let attemptIndex = 0; // 0..19
  let attemptCorrect = 0;
  let attemptIncorrect = 0;
  let attemptStart = null; // ms timestamp
  let timerInterval = null;
  // current question for normal (quick) mode
  let currentQuestion = null;
  // normal-mode question counter (starts at 0, increments each time the question changes)
  let normalQuestionCount = 0;

  // random integer between 2 and 9 (inclusive) — we avoid 1 to keep difficulty reasonable
  function rand1to9(){ return Math.floor(Math.random()*8)+2 }
  function genQuestion(){ return { a: rand1to9(), b: rand1to9() } }

  function renderQuestion(q){
    currentQuestion = q;
    questionEl.textContent = `${q.a} × ${q.b}`;
    // reset font-size in case celebration changed it
    questionEl.style.fontSize = '';
  }
  function clearFeedback(){ feedbackEl.textContent=''; feedbackEl.className='feedback' }

  function saveState(){ try{ localStorage.setItem('timesState', JSON.stringify(state)) }catch(e){} }
  function loadState(){ try{ const raw = localStorage.getItem('timesState'); if(raw){ state = Object.assign(state, JSON.parse(raw)) } }catch(e){} }

  function updateStats(){
    // show correct/incorrect for the current try (attempt or normal session)
    if(inAttempt){
      correctEl.textContent = attemptCorrect;
      incorrectEl.textContent = attemptIncorrect;
    } else {
      correctEl.textContent = state.correct;
      incorrectEl.textContent = state.incorrect;
    }
    // still render history list (unchanged), but accuracy is now current-try accuracy
    renderHistory();
    try{
      const correct = inAttempt ? attemptCorrect : state.correct;
      const wrong = inAttempt ? attemptIncorrect : state.incorrect;
      const total = (correct || 0) + (wrong || 0);
      const pct = total ? Math.round((correct * 100) / total) : 0;
      if(accuracyEl) accuracyEl.textContent = `${pct}%`;
      // ensure accuracy element is visible for both modes
      try{ if(accuracyEl && accuracyEl.parentElement) accuracyEl.parentElement.style.display = ''; }catch(e){}
    }catch(e){ if(accuracyEl) accuracyEl.textContent = '0%'; }
  }

  function renderHistory(){
    historyList.innerHTML = '';
    state.attempts.slice().reverse().forEach(at=>{
      const li = document.createElement('li');
      const started = new Date(at.startedAt);
      const t = started.toLocaleString();
      const modeLabel = at.mode === 'attempt' ? '【挑戦】' : '【通常】';
      // compute percent correct for this attempt
      const pct = at.total ? Math.round(( (at.correct||0) * 100 ) / at.total) : 0;
      li.textContent = `${t} ${modeLabel} ${at.correct}/${at.total} 正解 (${pct}%) — ${at.durationSec}s`;
      historyList.appendChild(li);
    })
  }

  function formatTimeElapsed(ms){
    const sec = Math.floor(ms/1000);
    const m = Math.floor(sec/60).toString().padStart(2,'0');
    const s = (sec%60).toString().padStart(2,'0');
    return `${m}:${s}`;
  }

  function startTimer(){ if(timerInterval) clearInterval(timerInterval); timerInterval = setInterval(()=>{ const now = Date.now(); timerEl.textContent = formatTimeElapsed(now - attemptStart); },250); }
  function stopTimer(){ if(timerInterval) { clearInterval(timerInterval); timerInterval = null } }

  // normal-mode timer state (separate from attempt timer)
  let normalTimerStart = null;
  let normalTimerInterval = null;
  let normalTimerRunning = false;

  function startNormalTimer(){ if(normalTimerInterval) clearInterval(normalTimerInterval); normalTimerStart = Date.now(); normalTimerInterval = setInterval(()=>{ timerEl.textContent = formatTimeElapsed(Date.now() - normalTimerStart); },250); normalTimerRunning = true; }
  function stopNormalTimer(){ if(normalTimerInterval){ clearInterval(normalTimerInterval); normalTimerInterval = null } normalTimerStart = null; normalTimerRunning = false; timerEl.textContent = '00:00'; }
  function toggleNormalTimer(){ if(normalTimerRunning) stopNormalTimer(); else startNormalTimer(); }

  function startAttempt(){
    inAttempt = true;
    // allow overriding attempt length via URL parameter `cnt`
    try{
      const raw = new URLSearchParams(window.location.search).get('cnt');
      const cnt = raw ? Number(raw) : 0;
      const total = (Number.isFinite(cnt) && cnt > 10) ? cnt : 20;
      attemptQuestions = Array.from({length: total}, () => genQuestion());
    }catch(e){
      attemptQuestions = Array.from({length:20}, () => genQuestion());
    }
    attemptIndex = 0;
    attemptCorrect = 0; attemptIncorrect = 0;
    attemptStart = Date.now();
    // reinitialize displayed stats and attempt-info for the new challenge
    try{ updateStats(); }catch(e){}
    startAttemptBtn.disabled = true;
    startAttemptBtn.style.display = 'none'; // hide start button during attempt
    startAttemptBtn.classList.remove('pulse'); // remove animation
    submitBtn.disabled = false;
    submitBtn.classList.add('green'); // make submit button green
    nextBtn.style.display = 'none'; // hide Next in attempt
    showBtn.style.display = 'none'; // hide Show in attempt
    // hide mode toggle to prevent accidental clicks
    document.querySelector('.mode-toggle').classList.add('hidden');
    // show the card
    cardEl.style.display = '';
    cardPlaceholderEl.style.display = 'none';
    renderQuestion(attemptQuestions[attemptIndex]);
    updateProgress();
    // reset timer display before starting
    timerEl.textContent = '00:00';
    startTimer();
    clearFeedback();
    answerInput.value = '';
    answerInput.focus();
  }

  function updateProgress(){
    if(inAttempt){
      progressEl.textContent = `問題 ${attemptIndex+1} / ${attemptQuestions.length}`;
    } else {
      progressEl.textContent = `問題 ${normalQuestionCount}`;
    }
  }

  function endAttempt(){
    const durationSec = Math.round((Date.now() - attemptStart)/1000);
    const attemptRecord = { startedAt: attemptStart, durationSec, correct: attemptCorrect, incorrect: attemptIncorrect, total: attemptQuestions.length, mode: 'attempt' };
    state.attempts = (state.attempts || []).concat([attemptRecord]).slice(-5);
    state.correct += attemptCorrect;
    state.incorrect += attemptIncorrect;
    saveState();
    updateStats();
    stopTimer();
    inAttempt = false;
    startAttemptBtn.disabled = false;
    startAttemptBtn.style.display = ''; // show start button again after attempt ends
    startAttemptBtn.classList.add('pulse'); // add pulse animation
    submitBtn.classList.remove('green'); // remove green color from submit button
    // show mode toggle again
    document.querySelector('.mode-toggle').classList.remove('hidden');
    // clear input field
    answerInput.value = '';
    // show celebration or encouraging message in question card
    const celebrationRate = attemptCorrect / attemptQuestions.length;
    if(celebrationRate >= 0.7){
      let celebrationEmoji = '🏅'; // default trophy
      if(celebrationRate >= 0.9) celebrationEmoji = '🏆'; // perfect/near perfect
      else if(celebrationRate >= 0.8) celebrationEmoji = '🥇'; // gold medal
      else celebrationEmoji = '🥈'; // silver medal
      questionEl.innerHTML = `${celebrationEmoji}<br/><br/>おめでとう！<br/>挑戦完了！`;
      questionEl.style.fontSize = '2.8rem';
    } else {
      // encouraging UI for <70%: animated emoji + friendly message
      questionEl.innerHTML = `
        <style>
          @keyframes bounce_kuku{0%{transform:translateY(0)}50%{transform:translateY(-12px)}100%{transform:translateY(0)}}
          .encourage_kuku{font-size:2.0rem;display:flex;flex-direction:column;align-items:center;gap:0.6rem}
          .encourage_kuku .emoji{animation:bounce_kuku 1s infinite}
          .encourage_kuku .msg{font-size:1.0rem}
        </style>
        <div class="encourage_kuku"><div class="emoji">😊</div><div class="msg">今回はちょっと難しかったね。<br/>もう一度チャレンジしよう！</div></div>
      `;
      questionEl.style.fontSize = '';
      feedbackEl.textContent = `${attemptCorrect}/${attemptQuestions.length} 正解 — ${durationSec}s — もう一度チャレンジしよう！`;
    }
    if(currentMode === 'normal'){
      nextBtn.style.display = '';
      showBtn.style.display = '';
      startAttemptBtn.style.display = 'none';
      cardEl.style.display = '';
      cardPlaceholderEl.style.display = 'none';
    } else {
      nextBtn.style.display = 'none';
      showBtn.style.display = 'none';
      startAttemptBtn.style.display = '';
      cardEl.style.display = '';
      cardPlaceholderEl.style.display = 'none';
    }
    submitBtn.disabled = true;
    showBtn.disabled = true;
    modeNormalBtn.disabled = false; modeChallengeBtn.disabled = false;
    if(celebrationRate >= 0.7){
      feedbackEl.textContent = `挑戦終了！ ${attemptCorrect}/${attemptQuestions.length} 正解 — ${durationSec}s`;
      feedbackEl.className = 'feedback';
    } else {
      // keep encouraging message already set above
      feedbackEl.className = 'feedback';
    }
  }

  function submitAnswer(){
    const raw = answerInput.value.trim();
    if(raw === ''){ feedbackEl.textContent = '数字を入力してください。'; feedbackEl.classList.add('wrong'); return }
    const num = Number(raw);
    const q = inAttempt ? attemptQuestions[attemptIndex] : currentQuestion;
    const correct = q.a * q.b;
    const ok = num === correct;
    if(ok){
      feedbackEl.textContent = 'よくできたね！ 🎉'; feedbackEl.className='feedback correct';
      if(inAttempt) attemptCorrect += 1; else state.correct += 1;
    } else {
      feedbackEl.textContent = `ちょっと違うね — ${q.a}×${q.b} = ${correct}`; feedbackEl.className='feedback wrong';
      if(inAttempt) attemptIncorrect += 1; else state.incorrect += 1;
    }

    if(inAttempt){
      attemptIndex += 1;
      if(attemptIndex >= attemptQuestions.length){ endAttempt(); }
      else { renderQuestion(attemptQuestions[attemptIndex]); updateProgress(); answerInput.value = ''; answerInput.focus(); }
    } else {
      setTimeout(()=>{ const newQ = genQuestion(); normalQuestionCount += 1; renderQuestion(newQ); clearFeedback(); answerInput.value = ''; answerInput.focus(); updateProgress(); }, 700);
    }

    saveState(); updateStats();
  }

  function showAnswer(){ const q = inAttempt ? attemptQuestions[attemptIndex] : currentQuestion; const correct = q.a * q.b; feedbackEl.textContent = `答え：${correct}`; feedbackEl.className='feedback'; }

  let currentMode = 'normal';
  function setMode(mode){ 
    if(inAttempt) return; 
    currentMode = mode; 
    // reset per-mode counters so correct/incorrect start at 0 for each mode
    state.correct = 0;
    state.incorrect = 0;
    saveState();
    updateStats();
    // stop/reset any running timers when changing mode; normal timer will be started by user in normal mode
    try{ stopTimer(); }catch(e){}
    try{ stopNormalTimer(); }catch(e){}
    // initialize/clear normal-mode progress and question display
    if(mode === 'normal'){
      normalQuestionCount = 0;
      clearFeedback();
      const q = genQuestion();
      renderQuestion(q);
      answerInput.value = '';
      answerInput.focus();
      updateProgress();
    }
    if(mode === 'normal'){ 
      modeNormalBtn.classList.add('active'); 
      modeChallengeBtn.classList.remove('active'); 
      nextBtn.style.display = ''; 
      showBtn.style.display = ''; 
      startAttemptBtn.style.display = 'none'; 
      startAttemptBtn.classList.remove('pulse');
      cardEl.style.display = '';
      cardPlaceholderEl.style.display = 'none';
      // hide timer in normal mode
      timerEl.style.display = 'none';
      // keep accuracy visible in normal mode (shows current-session accuracy)
      try{ if(accuracyEl && accuracyEl.parentElement) accuracyEl.parentElement.style.display = ''; }catch(e){}
      // hide full history in normal mode (leave history details hidden)
      try{ const hd = document.getElementById('historyDetails'); if(hd) hd.style.display = 'none'; }catch(e){}
    } else { 
      modeNormalBtn.classList.remove('active'); 
      modeChallengeBtn.classList.add('active'); 
      nextBtn.style.display = 'none'; 
      showBtn.style.display = 'none'; 
      startAttemptBtn.style.display = ''; 
      startAttemptBtn.classList.add('pulse');
      cardEl.style.display = 'none';
      cardPlaceholderEl.style.display = '';
      // show timer in attempt mode
      timerEl.style.display = '';
      // show accuracy and history in attempt mode
      try{ if(accuracyEl && accuracyEl.parentElement) accuracyEl.parentElement.style.display = ''; }catch(e){}
      try{ const hd = document.getElementById('historyDetails'); if(hd) hd.style.display = ''; }catch(e){}
    } 
  }

  modeNormalBtn.addEventListener('click', ()=> setMode('normal'));
  modeChallengeBtn.addEventListener('click', ()=> setMode('attempt'));

  // events
  submitBtn.addEventListener('click', submitAnswer);
  showBtn.addEventListener('click', showAnswer);
  nextBtn.addEventListener('click', ()=>{ if(inAttempt) return; const q = genQuestion(); normalQuestionCount += 1; renderQuestion(q); clearFeedback(); answerInput.value = ''; answerInput.focus(); updateProgress(); });
  startAttemptBtn.addEventListener('click', startAttempt);
  answerInput.addEventListener('keydown', e=>{ if(e.key === 'Enter') submitAnswer(); });
  // timer click toggles normal-mode timer (ignored during an attempt)
  timerEl.addEventListener('click', ()=>{ if(inAttempt) return; toggleNormalTimer(); });

  // init
  loadState();
  normalQuestionCount = 0;
  renderQuestion(genQuestion());
  updateStats();
  updateProgress();
  timerEl.textContent = '00:00';
  setMode('normal');

})();
