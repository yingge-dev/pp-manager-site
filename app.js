(function () {
  "use strict";

  var root = document.documentElement;
  var themeBtn = document.getElementById("themeBtn");
  var navToggle = document.getElementById("navToggle");
  var navLinks = document.getElementById("navLinks");
  var lightbox = document.getElementById("lightbox");
  var lightboxImg = document.getElementById("lightboxImg");
  var lightboxClose = document.getElementById("lightboxClose");
  var year = document.getElementById("year");

  function currentTheme() {
    return root.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function applyTheme(theme, persist) {
    root.setAttribute("data-theme", theme);
    if (themeBtn) {
      themeBtn.setAttribute(
        "aria-label",
        theme === "light" ? "切换到深色主题" : "切换到浅色主题"
      );
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#f6f7fb" : "#070a12");
    if (persist) {
      try {
        localStorage.setItem("pp-theme", theme);
      } catch (e) {
        /* 隐私模式下忽略 */
      }
    }
  }

  applyTheme(currentTheme(), false);

  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      applyTheme(currentTheme() === "light" ? "dark" : "light", true);
    });
  }

  /* 移动端菜单 */
  function closeMenu() {
    if (!navLinks) return;
    navLinks.classList.remove("open");
    if (navToggle) navToggle.setAttribute("aria-expanded", "false");
  }

  if (navToggle && navLinks) {
    navToggle.addEventListener("click", function () {
      var open = navLinks.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    navLinks.addEventListener("click", function (event) {
      if (event.target.closest("a")) closeMenu();
    });
    document.addEventListener("click", function (event) {
      if (!navLinks.classList.contains("open")) return;
      if (navLinks.contains(event.target) || navToggle.contains(event.target)) return;
      closeMenu();
    });
  }

  /* 滚动进入动画 */
  var revealItems = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  if ("IntersectionObserver" in window && revealItems.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.06 }
    );
    revealItems.forEach(function (el) {
      io.observe(el);
    });
  } else {
    revealItems.forEach(function (el) {
      el.classList.add("in");
    });
  }

  /* 复制按钮 */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      try {
        var ok = document.execCommand("copy");
        document.body.removeChild(area);
        ok ? resolve() : reject(new Error("copy failed"));
      } catch (err) {
        document.body.removeChild(area);
        reject(err);
      }
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll("[data-copy]"), function (btn) {
    btn.addEventListener("click", function () {
      var target = document.querySelector(btn.getAttribute("data-copy"));
      if (!target) return;
      var original = btn.textContent;
      copyText(target.textContent.trim()).then(
        function () {
          btn.textContent = "已复制";
          setTimeout(function () {
            btn.textContent = original;
          }, 1600);
        },
        function () {
          btn.textContent = "复制失败";
          setTimeout(function () {
            btn.textContent = original;
          }, 1600);
        }
      );
    });
  });

  /* 截图大图 */
  if (lightbox && lightboxImg) {
    function openLightbox(src, alt) {
      lightboxImg.src = src;
      lightboxImg.alt = alt || "";
      lightbox.classList.add("open");
      document.body.style.overflow = "hidden";
    }

    function closeLightbox() {
      lightbox.classList.remove("open");
      lightboxImg.src = "";
      document.body.style.overflow = "";
    }

    Array.prototype.forEach.call(document.querySelectorAll(".shot img"), function (img) {
      img.addEventListener("click", function () {
        openLightbox(img.currentSrc || img.src, img.alt);
      });
      img.setAttribute("tabindex", "0");
      img.setAttribute("role", "button");
      img.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openLightbox(img.currentSrc || img.src, img.alt);
        }
      });
    });

    lightbox.addEventListener("click", function (event) {
      if (event.target === lightbox) closeLightbox();
    });
    if (lightboxClose) lightboxClose.addEventListener("click", closeLightbox);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && lightbox.classList.contains("open")) closeLightbox();
    });
  }

  /* 年份 */
  if (year) year.textContent = String(new Date().getFullYear());
})();
