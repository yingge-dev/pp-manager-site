(function () {
  "use strict";

  var tracks = [
    { title: "红尘客栈 (DJ)", src: "audio/hongchen.mp3" },
    { title: "梦的翅膀受了伤 (Remix)", src: "audio/mengdechibang.mp3" },
    { title: "唐人恋曲 (DJ版)", src: "audio/tangren.mp3" },
    { title: "天青色等烟雨", src: "audio/tianqingse.mp3" }
  ];

  var root = document.getElementById("ppMusic");
  if (!root) return;

  var audio = new Audio();
  audio.preload = "metadata";
  audio.loop = false;

  var titleEl = document.getElementById("pmTitle");
  var stateEl = document.getElementById("pmState");
  var playBtn = document.getElementById("pmPlay");
  var prevBtn = document.getElementById("pmPrev");
  var nextBtn = document.getElementById("pmNext");
  var progressEl = document.getElementById("pmProgress");
  var currentEl = document.getElementById("pmCurrent");
  var durationEl = document.getElementById("pmDuration");
  var volumeEl = document.getElementById("pmVolume");
  var toggleBtn = document.getElementById("pmToggle");
  var closeBtn = document.getElementById("pmClose");
  var panel = root.querySelector(".pp-music__panel");

  var index = Math.floor(Math.random() * tracks.length);
  var blocked = false;
  var scrubbing = false;
  var siteTitle = document.title;

  function fmt(seconds) {
    if (!isFinite(seconds) || seconds < 0) return "0:00";
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function setState(text) {
    stateEl.textContent = text;
  }

  function renderTrack() {
    var track = tracks[index];
    titleEl.textContent = track.title;
    document.title = siteTitle;
    if (!audio.paused) document.title = "▶ " + track.title + " · PP管理器";
  }

  function saveVolume(value) {
    try { localStorage.setItem("pp-music-volume", String(value)); } catch (_) {}
  }

  function restoreVolume() {
    var value = 0.7;
    try {
      var saved = parseFloat(localStorage.getItem("pp-music-volume"));
      if (isFinite(saved) && saved >= 0 && saved <= 1) value = saved;
    } catch (_) {}
    audio.volume = value;
    if (volumeEl) volumeEl.value = String(Math.round(value * 100));
  }

  function play() {
    audio.play().then(function () {
      blocked = false;
      playBtn.textContent = "❚❚";
      setState("正在播放");
      renderTrack();
    }).catch(function () {
      blocked = true;
      playBtn.textContent = "▶";
      setState("点击播放");
    });
  }

  function toggle() {
    if (audio.paused) {
      play();
    } else {
      audio.pause();
      playBtn.textContent = "▶";
      setState("已暂停");
      document.title = "PP管理器";
    }
  }

  function load(i, autoplay) {
    index = (i + tracks.length) % tracks.length;
    audio.src = tracks[index].src;
    audio.load();
    renderTrack();
    progressEl.value = "0";
    currentEl.textContent = "0:00";
    durationEl.textContent = "0:00";
    if (autoplay) {
      play();
    } else {
      setState("已暂停");
      playBtn.textContent = "▶";
    }
  }

  function next() {
    load(index + 1, true);
  }

  function prev() {
    if (audio.currentTime > 4) {
      audio.currentTime = 0;
      if (audio.paused) play();
      return;
    }
    load(index - 1, true);
  }

  prevBtn.addEventListener("click", prev);
  nextBtn.addEventListener("click", next);
  playBtn.addEventListener("click", toggle);

  audio.addEventListener("ended", next);
  audio.addEventListener("loadedmetadata", function () {
    durationEl.textContent = fmt(audio.duration);
  });
  audio.addEventListener("timeupdate", function () {
    if (scrubbing) return;
    currentEl.textContent = fmt(audio.currentTime);
    if (audio.duration > 0) {
      progressEl.value = String(Math.round(audio.currentTime / audio.duration * 1000));
    }
  });
  audio.addEventListener("play", function () {
    blocked = false;
    playBtn.textContent = "❚❚";
    setState("正在播放");
    renderTrack();
  });
  audio.addEventListener("pause", function () {
    if (!audio.ended) {
      playBtn.textContent = "▶";
      setState("已暂停");
      document.title = siteTitle;
    }
  });
  audio.addEventListener("error", function () {
    setState("加载失败");
  });

  progressEl.addEventListener("input", function () {
    scrubbing = true;
    if (audio.duration > 0) {
      currentEl.textContent = fmt(audio.currentTime);
    }
  });
  progressEl.addEventListener("change", function () {
    if (audio.duration > 0) {
      audio.currentTime = (parseFloat(progressEl.value) / 1000) * audio.duration;
    }
    scrubbing = false;
  });

  volumeEl.addEventListener("input", function () {
    var v = parseFloat(volumeEl.value) / 100;
    audio.volume = v;
    saveVolume(v);
  });

  toggleBtn.addEventListener("click", function () {
    root.classList.toggle("is-collapsed");
    toggleBtn.textContent = root.classList.contains("is-collapsed") ? "♪" : "×";
  });
  closeBtn.addEventListener("click", function () {
    root.classList.add("is-collapsed");
    toggleBtn.textContent = "♪";
  });

  function unlockAudio(event) {
    if (!blocked) return;
    if (event.target && event.target.closest && event.target.closest(".pp-music")) return;
    play();
  }
  document.addEventListener("pointerdown", unlockAudio, { passive: true });
  audio.addEventListener("playing", function () {
    document.removeEventListener("pointerdown", unlockAudio);
  });

  restoreVolume();
  renderTrack();
  load(index, true);
})();
