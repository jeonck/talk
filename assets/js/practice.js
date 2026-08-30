/* 하루 한 문장 · 5분 말하기 연습 — practice.js */
(function () {
  'use strict';

  /* ─────────────────────────── 저장소 ─────────────────────────── */
  var KEY = 'talk.progress.v1';

  var Store = {
    read: function () {
      try {
        var raw = localStorage.getItem(KEY);
        var d = raw ? JSON.parse(raw) : null;
        if (!d || typeof d !== 'object') d = {};
        if (!d.sentences) d.sentences = {};
        if (!d.days) d.days = {};
        return d;
      } catch (e) {
        return { sentences: {}, days: {} };
      }
    },
    write: function (d) {
      try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* 용량 초과 등은 무시 */ }
    },
    today: function () {
      var n = new Date();
      var m = String(n.getMonth() + 1).padStart(2, '0');
      var day = String(n.getDate()).padStart(2, '0');
      return n.getFullYear() + '-' + m + '-' + day;
    },
    sentence: function (slug) {
      return this.read().sentences[slug] || null;
    },
    addRep: function (meta, delta) {
      var d = this.read();
      var s = d.sentences[meta.slug] || { reps: 0, sessions: 0 };
      s.title = meta.title;
      s.en = meta.en;
      s.ko = meta.ko;
      s.url = meta.url;
      s.reps = Math.max(0, (s.reps || 0) + delta);
      s.lastAt = new Date().toISOString();
      if (s.reps >= meta.target && !s.completedAt) s.completedAt = s.lastAt;
      d.sentences[meta.slug] = s;

      var t = this.today();
      var day = d.days[t] || { reps: 0, slugs: [] };
      day.reps = Math.max(0, (day.reps || 0) + delta);
      if (day.slugs.indexOf(meta.slug) === -1) day.slugs.push(meta.slug);
      d.days[t] = day;

      this.write(d);
      return s;
    },
    addSession: function (meta) {
      var d = this.read();
      var s = d.sentences[meta.slug] || { reps: 0, sessions: 0 };
      s.title = meta.title;
      s.en = meta.en;
      s.ko = meta.ko;
      s.url = meta.url;
      s.sessions = (s.sessions || 0) + 1;
      s.lastAt = new Date().toISOString();
      d.sentences[meta.slug] = s;
      var t = this.today();
      var day = d.days[t] || { reps: 0, slugs: [] };
      if (day.slugs.indexOf(meta.slug) === -1) day.slugs.push(meta.slug);
      d.days[t] = day;
      this.write(d);
      return s;
    },
    streak: function () {
      var days = this.read().days;
      var n = new Date();
      var count = 0;
      for (var i = 0; i < 3650; i++) {
        var m = String(n.getMonth() + 1).padStart(2, '0');
        var dd = String(n.getDate()).padStart(2, '0');
        var k = n.getFullYear() + '-' + m + '-' + dd;
        if (days[k]) { count++; }
        else if (i > 0) { break; }
        n.setDate(n.getDate() - 1);
      }
      return count;
    },
    clear: function () {
      try { localStorage.removeItem(KEY); } catch (e) { /* noop */ }
    }
  };

  /* ─────────────────────────── 문장 듣기 (TTS) ─────────────────────────── */
  var TTS = {
    supported: typeof window.speechSynthesis !== 'undefined' &&
      typeof window.SpeechSynthesisUtterance !== 'undefined',
    voice: null,
    abort: false,

    pick: function () {
      if (!this.supported) return null;
      var voices = window.speechSynthesis.getVoices() || [];
      if (!voices.length) return null;
      var en = voices.filter(function (v) { return /^en(-|_)/i.test(v.lang || ''); });
      if (!en.length) return null;
      var preferred = ['Google US English', 'Samantha', 'Microsoft Aria', 'Microsoft Jenny', 'Alex', 'Karen', 'Daniel'];
      for (var i = 0; i < preferred.length; i++) {
        for (var j = 0; j < en.length; j++) {
          if ((en[j].name || '').indexOf(preferred[i]) === 0) return en[j];
        }
      }
      var us = en.filter(function (v) { return /^en(-|_)US/i.test(v.lang); });
      return (us[0] || en[0]);
    },

    init: function (cb) {
      if (!this.supported) { cb(false); return; }
      var self = this;
      var tries = 0;
      var tick = function () {
        self.voice = self.pick();
        if (self.voice) { cb(true); return; }
        if (++tries > 20) { cb(false); return; }
        setTimeout(tick, 150);
      };
      if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
        window.speechSynthesis.onvoiceschanged = function () {
          if (!self.voice) { self.voice = self.pick(); }
        };
      }
      tick();
    },

    speak: function (text, rate) {
      var self = this;
      return new Promise(function (resolve) {
        if (!self.supported) { resolve(false); return; }
        try { window.speechSynthesis.cancel(); } catch (e) { /* noop */ }
        var u = new SpeechSynthesisUtterance(text);
        if (self.voice) { u.voice = self.voice; u.lang = self.voice.lang; }
        else { u.lang = 'en-US'; }
        u.rate = rate || 1;
        u.pitch = 1;
        u.volume = 1;
        var done = false;
        var finish = function () { if (!done) { done = true; resolve(true); } };
        u.onend = finish;
        u.onerror = finish;
        // 일부 브라우저가 onend를 누락하는 경우를 대비한 안전장치
        var guard = Math.max(2500, (text.length * 130) / (rate || 1));
        setTimeout(finish, guard);
        window.speechSynthesis.speak(u);
      });
    },

    stop: function () {
      this.abort = true;
      if (this.supported) { try { window.speechSynthesis.cancel(); } catch (e) { /* noop */ } }
    },

    repeat: function (text, rate, times, gap, onTick) {
      var self = this;
      self.abort = false;
      var i = 0;
      var step = function () {
        if (self.abort || i >= times) return Promise.resolve();
        i++;
        if (onTick) onTick(i, times);
        return self.speak(text, rate).then(function () {
          if (self.abort || i >= times) return;
          return new Promise(function (r) { setTimeout(r, gap); }).then(step);
        });
      };
      return step();
    }
  };

  /* ─────────────────────────── 유틸 ─────────────────────────── */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function mmss(sec) {
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  var beepCtx = null;
  function beep(freq) {
    try {
      if (!beepCtx) {
        var C = window.AudioContext || window.webkitAudioContext;
        if (!C) return;
        beepCtx = new C();
      }
      if (beepCtx.state === 'suspended') beepCtx.resume();
      var o = beepCtx.createOscillator(), g = beepCtx.createGain();
      o.type = 'sine';
      o.frequency.value = freq || 880;
      g.gain.setValueAtTime(0.0001, beepCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.12, beepCtx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, beepCtx.currentTime + 0.28);
      o.connect(g); g.connect(beepCtx.destination);
      o.start(); o.stop(beepCtx.currentTime + 0.3);
    } catch (e) { /* noop */ }
  }

  /* ─────────────────────────── 문장 연습 페이지 ─────────────────────────── */
  function initSentence() {
    var dataEl = $('#p-data');
    if (!dataEl) return;

    var data;
    try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }

    var meta = {
      slug: data.slug, title: data.title, en: data.en, ko: data.ko,
      url: data.url, target: data.target || 30
    };
    var rate = 1;

    /* ── 듣기 ── */
    var playBtn = $('#p-play');
    var repeatBtn = $('#p-repeat');
    var statusEl = $('#p-listen-status');
    var fallback = $('#p-tts-fallback');

    function setStatus(msg) { if (statusEl) statusEl.textContent = msg || ''; }

    // 음성 목록을 늦게 넘겨주는 브라우저(특히 iOS)가 있으므로 버튼을 막지 않고 안내만 띄웁니다.
    TTS.init(function (ok) {
      if (!ok && fallback) fallback.hidden = false;
    });

    function hideFallbackIfVoiceFound() {
      if (!TTS.voice) TTS.voice = TTS.pick();
      if (TTS.voice && fallback) fallback.hidden = true;
    }

    function playOnce(text, btn) {
      TTS.abort = false;
      hideFallbackIfVoiceFound();
      if (btn) btn.classList.add('is-playing');
      return TTS.speak(text, rate).then(function () {
        if (btn) btn.classList.remove('is-playing');
      });
    }

    if (playBtn) {
      playBtn.addEventListener('click', function () {
        setStatus('');
        playOnce(meta.en, playBtn);
      });
    }

    if (repeatBtn) {
      repeatBtn.addEventListener('click', function () {
        if (repeatBtn.dataset.on === '1') {
          TTS.stop();
          repeatBtn.dataset.on = '0';
          repeatBtn.classList.remove('is-on');
          repeatBtn.textContent = '10회 연속 듣기';
          setStatus('');
          return;
        }
        hideFallbackIfVoiceFound();
        repeatBtn.dataset.on = '1';
        repeatBtn.classList.add('is-on');
        repeatBtn.textContent = '멈추기';
        TTS.repeat(meta.en, rate, 10, 900, function (i, n) {
          setStatus(i + ' / ' + n + '회 듣는 중');
        }).then(function () {
          repeatBtn.dataset.on = '0';
          repeatBtn.classList.remove('is-on');
          repeatBtn.textContent = '10회 연속 듣기';
          if (!TTS.abort) setStatus('10회 듣기를 마쳤습니다. 이제 따라 말해 보세요.');
        });
      });
    }

    $$('.p-speed button').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('.p-speed button').forEach(function (x) { x.classList.remove('is-on'); });
        b.classList.add('is-on');
        rate = parseFloat(b.dataset.rate);
      });
    });

    $$('.p-chunk').forEach(function (c) {
      c.addEventListener('click', function () {
        TTS.abort = false;
        hideFallbackIfVoiceFound();
        $$('.p-chunk').forEach(function (x) { x.classList.remove('is-playing'); });
        c.classList.add('is-playing');
        TTS.speak(c.dataset.en, Math.min(rate, 0.85)).then(function () {
          c.classList.remove('is-playing');
        });
      });
    });

    $$('.p-mini-play').forEach(function (b) {
      b.addEventListener('click', function () {
        TTS.abort = false;
        hideFallbackIfVoiceFound();
        TTS.speak(b.dataset.en, rate);
      });
    });

    /* ── 문장 가리기 ── */
    var hideBtn = $('#p-hide');
    var enEl = $('#p-en');
    if (hideBtn && enEl) {
      hideBtn.addEventListener('click', function () {
        var on = enEl.classList.toggle('is-hidden');
        hideBtn.classList.toggle('is-on', on);
        hideBtn.textContent = on ? '문장 보기' : '문장 가리기';
        hideBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    /* ── 반복 카운터 ── */
    var tap = $('#p-tap');
    var numEl = $('#p-count');
    var barEl = $('#p-bar');
    var labelEl = $('#p-count-label');
    var undoBtn = $('#p-undo');
    var resetBtn = $('#p-count-reset');
    var stickyEl = $('#p-sticky-info');

    function renderCount(reps) {
      var target = meta.target;
      if (numEl) numEl.textContent = reps;
      if (barEl) barEl.style.width = Math.min(100, (reps / target) * 100) + '%';
      if (tap) tap.classList.toggle('is-done', reps >= target);
      if (labelEl) {
        labelEl.textContent = reps >= target
          ? '목표 ' + target + '회 달성! 소리가 편해질 때까지 더 해도 좋습니다.'
          : '따라 말할 때마다 눌러 주세요 · 목표 ' + target + '회 (스페이스바)';
      }
      if (stickyEl) stickyEl.textContent = '반복 ' + reps + ' / ' + meta.target + '회';
    }

    var saved = Store.sentence(meta.slug);
    renderCount(saved ? (saved.reps || 0) : 0);

    function bump(delta) {
      var s = Store.addRep(meta, delta);
      renderCount(s.reps);
      if (delta > 0 && s.reps === meta.target) beep(1180);
    }

    if (tap) tap.addEventListener('click', function () { bump(1); });
    if (undoBtn) undoBtn.addEventListener('click', function () { bump(-1); });
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        var cur = Store.sentence(meta.slug);
        if (cur && cur.reps) bump(-cur.reps);
      });
    }

    document.addEventListener('keydown', function (e) {
      var t = e.target || {};
      var tag = (t.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || t.isContentEditable) return;
      if (e.code === 'Space' || e.key === ' ') {
        if (tag === 'button') return;
        e.preventDefault();
        bump(1);
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        playOnce(meta.en, playBtn);
      }
    });

    /* ── 5분 타이머 ── */
    var phases = [
      { name: '1단계 · 듣기', sec: 60, hint: '화면을 보지 말고 소리에만 집중해서 10번 들어 보세요. 뜻은 아직 생각하지 않습니다.' },
      { name: '2단계 · 이해', sec: 60, hint: '상황과 뜻을 읽고, 이 문장을 말하는 장면을 머릿속에 하나 그려 두세요.' },
      { name: '3단계 · 따라 말하기', sec: 120, hint: '소리를 들은 직후 바로 따라 말하세요. 아래 버튼으로 횟수를 세면서 목표 ' + meta.target + '회를 채웁니다.' },
      { name: '4단계 · 녹음 비교', sec: 60, hint: '내 목소리를 녹음해 원어민 소리와 번갈아 들어 보세요. 다른 곳이 들리면 그 부분만 다시 반복합니다.' }
    ];
    var totalSec = phases.reduce(function (a, p) { return a + p.sec; }, 0);

    var startBtn = $('#p-timer-start');
    var timerResetBtn = $('#p-timer-reset');
    var progCircle = $('#p-prog');
    var timeEl = $('#p-time');
    var phaseLabel = $('#p-phase-total');
    var phaseName = $('#p-phase-name');
    var phaseHint = $('#p-phase-hint');
    var stepEls = $$('.p-step');
    var autoPlayBox = $('#p-autoplay');

    var CIRC = 0;
    if (progCircle) {
      var r = parseFloat(progCircle.getAttribute('r'));
      CIRC = 2 * Math.PI * r;
      progCircle.style.strokeDasharray = CIRC;
      progCircle.style.strokeDashoffset = CIRC;
    }

    var elapsed = 0, running = false, tickId = null, lastPhase = -1, sessionLogged = false;

    function phaseAt(sec) {
      var acc = 0;
      for (var i = 0; i < phases.length; i++) {
        acc += phases[i].sec;
        if (sec < acc) return i;
      }
      return phases.length - 1;
    }

    function renderTimer() {
      var remain = Math.max(0, totalSec - elapsed);
      if (timeEl) timeEl.textContent = mmss(remain);
      if (progCircle) progCircle.style.strokeDashoffset = CIRC * (1 - elapsed / totalSec);
      var idx = phaseAt(Math.min(elapsed, totalSec - 1));
      if (idx !== lastPhase) {
        lastPhase = idx;
        if (phaseName) phaseName.textContent = phases[idx].name;
        if (phaseHint) phaseHint.textContent = phases[idx].hint;
        if (phaseLabel) phaseLabel.textContent = (idx + 1) + '/' + phases.length;
        stepEls.forEach(function (el, i) {
          el.classList.toggle('is-on', i === idx);
          el.classList.toggle('is-done', i < idx);
        });
        if (running) {
          beep(idx === 0 ? 760 : 900);
          if (idx === 0 && autoPlayBox && autoPlayBox.checked) {
            TTS.repeat(meta.en, 0.8, 10, 1400);
          }
          if (idx === 1) TTS.stop();
        }
      }
    }

    function finish() {
      running = false;
      clearInterval(tickId);
      TTS.stop();
      if (startBtn) startBtn.textContent = '다시 시작';
      if (phaseName) phaseName.textContent = '5분 연습 완료';
      if (phaseHint) phaseHint.textContent = '오늘 몫은 끝났습니다. 내일 이 문장을 30초만 다시 말해 보고, 막힘없이 나오면 다음 문장으로 넘어가세요.';
      stepEls.forEach(function (el) { el.classList.remove('is-on'); el.classList.add('is-done'); });
      beep(1320);
      setTimeout(function () { beep(1580); }, 220);
      if (!sessionLogged) { Store.addSession(meta); sessionLogged = true; }
    }

    function tick() {
      elapsed += 1;
      if (elapsed >= totalSec) {
        elapsed = totalSec;
        renderTimer();
        finish();
        return;
      }
      renderTimer();
    }

    if (startBtn) {
      startBtn.addEventListener('click', function () {
        beep(660);
        if (running) {
          running = false;
          clearInterval(tickId);
          TTS.stop();
          startBtn.textContent = '이어서 하기';
          return;
        }
        if (elapsed >= totalSec) { elapsed = 0; lastPhase = -1; sessionLogged = false; }
        running = true;
        startBtn.textContent = '일시정지';
        lastPhase = -1;
        renderTimer();
        clearInterval(tickId);
        tickId = setInterval(tick, 1000);
      });
    }

    if (timerResetBtn) {
      timerResetBtn.addEventListener('click', function () {
        running = false;
        clearInterval(tickId);
        TTS.stop();
        elapsed = 0;
        lastPhase = -1;
        sessionLogged = false;
        if (startBtn) startBtn.textContent = '5분 연습 시작';
        renderTimer();
      });
    }
    renderTimer();

    /* ── 녹음 ── */
    var recBtn = $('#p-rec');
    var recPlayBtn = $('#p-rec-play');
    var recNativeBtn = $('#p-rec-native');
    var recAudio = $('#p-rec-audio');
    var recCard = $('#p-rec-card');
    var recNote = $('#p-rec-note');
    var recorder = null, stream = null, chunks = [], blobUrl = null;

    var canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    if (!canRecord && recNote) {
      recNote.textContent = '이 브라우저에서는 녹음 기능을 사용할 수 없습니다. 휴대폰 기본 녹음 앱으로 녹음한 뒤 비교해 보세요.';
      if (recBtn) recBtn.disabled = true;
    }

    function pickMime() {
      var list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      for (var i = 0; i < list.length; i++) {
        if (window.MediaRecorder.isTypeSupported && window.MediaRecorder.isTypeSupported(list[i])) return list[i];
      }
      return '';
    }

    function stopStream() {
      if (stream) {
        stream.getTracks().forEach(function (t) { t.stop(); });
        stream = null;
      }
    }

    if (recBtn && canRecord) {
      recBtn.addEventListener('click', function () {
        if (recorder && recorder.state === 'recording') {
          recorder.stop();
          return;
        }
        TTS.stop();
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
          stream = s;
          chunks = [];
          var mime = pickMime();
          recorder = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s);
          recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
          recorder.onstop = function () {
            stopStream();
            if (blobUrl) URL.revokeObjectURL(blobUrl);
            var blob = new Blob(chunks, { type: chunks.length && chunks[0].type ? chunks[0].type : 'audio/webm' });
            blobUrl = URL.createObjectURL(blob);
            if (recAudio) { recAudio.src = blobUrl; recAudio.hidden = false; }
            if (recPlayBtn) recPlayBtn.disabled = false;
            if (recNativeBtn) recNativeBtn.disabled = false;
            if (recCard) recCard.classList.remove('is-recording');
            recBtn.textContent = '다시 녹음하기';
            if (recNote) recNote.textContent = '내 목소리와 원어민 소리를 번갈아 들으며 다른 곳을 찾아보세요.';
          };
          recorder.start();
          if (recCard) recCard.classList.add('is-recording');
          recBtn.innerHTML = '<span class="p-rec-dot"></span>녹음 멈추기';
          if (recNote) recNote.textContent = '지금 문장을 소리 내어 말해 보세요.';
        }).catch(function () {
          if (recNote) recNote.textContent = '마이크 권한이 필요합니다. 브라우저 주소창의 권한 설정에서 마이크를 허용해 주세요.';
        });
      });
    }

    if (recPlayBtn) {
      recPlayBtn.addEventListener('click', function () {
        TTS.stop();
        if (recAudio && recAudio.src) { recAudio.currentTime = 0; recAudio.play(); }
      });
    }
    if (recNativeBtn) {
      recNativeBtn.addEventListener('click', function () {
        if (recAudio) recAudio.pause();
        playOnce(meta.en, null);
      });
    }

    window.addEventListener('pagehide', function () {
      TTS.stop();
      stopStream();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    });
  }

  /* ─────────────────────────── 목록의 완료 표시 ─────────────────────────── */
  function markIndex() {
    var items = $$('[data-slug]');
    if (!items.length) return;
    var d = Store.read();
    items.forEach(function (el) {
      var s = d.sentences[el.dataset.slug];
      var badge = el.querySelector('.p-index-state');
      if (!badge) return;
      if (s && s.reps) {
        badge.textContent = s.completedAt ? '✓ 연습 완료 · ' + s.reps + '회' : '진행 중 · ' + s.reps + '회';
        badge.className = 'p-index-state' + (s.completedAt ? ' p-done' : '');
      }
    });
  }

  /* ─────────────────────────── 오늘의 문장 ─────────────────────────── */
  function initToday() {
    var el = $('#p-today');
    if (!el) return;
    var list;
    try { list = JSON.parse($('#p-all').textContent); } catch (e) { return; }
    if (!list.length) return;

    var now = new Date();
    var start = new Date(now.getFullYear(), 0, 0);
    var doy = Math.floor((now - start) / 86400000);
    var pick = list[doy % list.length];

    $('#p-today-en').textContent = pick.en;
    $('#p-today-ko').textContent = pick.ko;
    $('#p-today-situation').textContent = pick.situation;
    var link = $('#p-today-link');
    link.href = pick.url;
    el.dataset.slug = pick.slug;

    var s = Store.sentence(pick.slug);
    var state = $('#p-today-state');
    if (state && s && s.reps) {
      state.textContent = s.completedAt ? '오늘까지 ' + s.reps + '회 반복했습니다.' : '지금까지 ' + s.reps + '회 반복했습니다.';
    }

    var streak = Store.streak();
    var streakEl = $('#p-streak');
    if (streakEl && streak > 0) {
      streakEl.textContent = streak + '일 연속 연습 중';
      streakEl.hidden = false;
    }
  }

  /* ─────────────────────────── 기록 페이지 ─────────────────────────── */
  function initRecord() {
    var root = $('#p-record');
    if (!root) return;
    var d = Store.read();
    var slugs = Object.keys(d.sentences);
    var totalReps = 0, done = 0, sessions = 0;
    slugs.forEach(function (k) {
      var s = d.sentences[k];
      totalReps += (s.reps || 0);
      sessions += (s.sessions || 0);
      if (s.completedAt) done++;
    });

    $('#p-r-streak').textContent = Store.streak();
    $('#p-r-done').textContent = done;
    $('#p-r-reps').textContent = totalReps;
    $('#p-r-sessions').textContent = sessions;

    var listEl = $('#p-r-list');
    var emptyEl = $('#p-r-empty');
    var rows = slugs.map(function (k) { return d.sentences[k]; })
      .filter(function (s) { return s && (s.reps || s.sessions); })
      .sort(function (a, b) { return (b.lastAt || '').localeCompare(a.lastAt || ''); });

    if (!rows.length) {
      if (emptyEl) emptyEl.hidden = false;
    } else {
      if (emptyEl) emptyEl.hidden = true;
      listEl.innerHTML = rows.map(function (s) {
        var when = s.lastAt ? new Date(s.lastAt).toLocaleDateString('ko-KR') : '';
        return '<li><a href="' + (s.url || '/sentences/') + '">' +
          '<div class="p-index-en"></div><div class="p-index-ko"></div>' +
          '<div class="p-index-foot"><span class="' + (s.completedAt ? 'p-done' : '') + '">' +
          (s.completedAt ? '✓ 연습 완료' : '진행 중') + '</span><span>반복 ' + (s.reps || 0) + '회</span>' +
          '<span>5분 세션 ' + (s.sessions || 0) + '회</span><span>' + when + '</span></div></a></li>';
      }).join('');
      // 텍스트는 innerHTML 대신 안전하게 주입
      $$('#p-r-list li').forEach(function (li, i) {
        li.querySelector('.p-index-en').textContent = rows[i].en || rows[i].title || '';
        li.querySelector('.p-index-ko').textContent = rows[i].ko || '';
      });
      listEl.hidden = false;
    }

    var clearBtn = $('#p-r-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (window.confirm('연습 기록을 모두 지웁니다. 되돌릴 수 없습니다. 계속할까요?')) {
          Store.clear();
          window.location.reload();
        }
      });
    }
  }

  function boot() {
    initToday();
    initSentence();
    markIndex();
    initRecord();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
