(function () {
  "use strict";

  var root = document.documentElement;
  var header = document.getElementById("siteHeader");
  var themeToggle = document.getElementById("themeToggle");
  var themeMeta = document.querySelector('meta[name="theme-color"]');
  var menuToggle = document.getElementById("menuToggle");
  var mobileMenu = document.getElementById("mobileMenu");
  var cvNoteBtn = document.getElementById("cvNoteBtn");
  var cvNote = document.getElementById("cvNote");
  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Theme */
  function currentTheme() {
    return root.dataset.theme === "light" ? "light" : "dark";
  }

  function applyTheme(theme) {
    if (theme === "light") {
      root.dataset.theme = "light";
    } else {
      delete root.dataset.theme;
    }
    try {
      localStorage.setItem("vallozza-theme", theme);
    } catch {}
    if (themeToggle) {
      themeToggle.setAttribute(
        "aria-label",
        theme === "light" ? "Aktifkan tema gelap" : "Aktifkan tema terang"
      );
    }
    if (themeMeta) {
      themeMeta.setAttribute("content", theme === "light" ? "#f4f1ea" : "#080808");
    }
  }

  if (themeToggle) {
    applyTheme(currentTheme());
    themeToggle.addEventListener("click", function () {
      applyTheme(currentTheme() === "light" ? "dark" : "light");
    });
  }

  /* Header state */
  function onScroll() {
    if (!header) return;
    header.classList.toggle("scrolled", window.scrollY > 12);
  }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* Mobile menu */
  function setMenu(open) {
    if (!mobileMenu || !menuToggle) return;
    mobileMenu.classList.toggle("is-open", open);
    document.body.classList.toggle("menu-open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
    menuToggle.setAttribute("aria-label", open ? "Tutup menu navigasi" : "Buka menu navigasi");
  }

  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener("click", function () {
      setMenu(!mobileMenu.classList.contains("is-open"));
    });
    mobileMenu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        setMenu(false);
      });
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && mobileMenu.classList.contains("is-open")) {
        setMenu(false);
        menuToggle.focus();
      }
    });
    window.matchMedia("(min-width: 901px)").addEventListener("change", function (event) {
      if (event.matches) setMenu(false);
    });
  }

  /* CV note */
  if (cvNoteBtn && cvNote) {
    cvNoteBtn.addEventListener("click", function () {
      cvNote.hidden = !cvNote.hidden;
      cvNoteBtn.setAttribute("aria-expanded", String(!cvNote.hidden));
    });
  }

  /* Reveal on scroll */
  var revealItems = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  if (prefersReduced || !("IntersectionObserver" in window)) {
    revealItems.forEach(function (item) {
      item.classList.add("is-visible");
    });
  } else {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.06 }
    );
    revealItems.forEach(function (item, index) {
      item.style.transitionDelay = Math.min(index % 4, 3) * 55 + "ms";
      revealObserver.observe(item);
    });
  }

  /* Active navigation */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll("[data-nav]"));
  var sections = Array.prototype.slice.call(document.querySelectorAll("main section[id]"));
  if ("IntersectionObserver" in window && navLinks.length && sections.length) {
    var navObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var id = entry.target.id;
          navLinks.forEach(function (link) {
            var active = link.getAttribute("data-nav") === id;
            link.classList.toggle("is-active", active);
            if (active) {
              link.setAttribute("aria-current", "true");
            } else {
              link.removeAttribute("aria-current");
            }
          });
        });
      },
      { rootMargin: "-38% 0px -56% 0px", threshold: 0 }
    );
    sections.forEach(function (section) {
      navObserver.observe(section);
    });
  }

  /* Gallery filter */
  var filterButtons = Array.prototype.slice.call(document.querySelectorAll(".filter-btn"));
  var galleryCards = Array.prototype.slice.call(document.querySelectorAll(".gallery-card"));
  var galleryCount = document.getElementById("galleryCount");

  function updateFilterCounts() {
    var totals = { All: galleryCards.length };
    galleryCards.forEach(function (card) {
      var category = card.getAttribute("data-category") || "Personal";
      totals[category] = (totals[category] || 0) + 1;
    });
    filterButtons.forEach(function (button) {
      var count = button.querySelector(".count");
      if (count) count.textContent = String(totals[button.getAttribute("data-filter")] || 0);
    });
  }

  function applyFilter(filter) {
    filterButtons.forEach(function (button) {
      button.setAttribute("aria-pressed", String(button.getAttribute("data-filter") === filter));
    });
    var shown = 0;
    galleryCards.forEach(function (card) {
      var match = filter === "All" || card.getAttribute("data-category") === filter;
      card.hidden = !match;
      if (match) shown += 1;
    });
    if (galleryCount) galleryCount.textContent = shown + " gambar";
  }

  updateFilterCounts();
  filterButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      applyFilter(button.getAttribute("data-filter") || "All");
    });
  });

  /* Lightbox */
  var lightbox = document.getElementById("lightbox");
  var lbDialog = document.getElementById("lbDialog");
  var lbClose = document.getElementById("lbClose");
  var lbPrev = document.getElementById("lbPrev");
  var lbNext = document.getElementById("lbNext");
  var lbImage = document.getElementById("lbImage");
  var lbCategory = document.getElementById("lbCategory");
  var lbCaption = document.getElementById("lbCaption");
  var lbAlt = document.getElementById("lbAlt");
  var lbCount = document.getElementById("lbCount");
  var lbItems = [];
  var lbIndex = 0;
  var lbTrigger = null;

  var categoryLabels = {
    Personal: "Pribadi",
    Activities: "Kegiatan",
    Achievements: "Pencapaian",
    Projects: "Proyek",
    Technology: "Teknologi",
    Campus: "Kampus",
    Photography: "Fotografi"
  };

  function itemFromButton(button) {
    return {
      src: button.getAttribute("data-src") || "",
      alt: button.getAttribute("data-alt") || "",
      caption: button.getAttribute("data-caption") || "",
      category: button.getAttribute("data-category") || "Personal"
    };
  }

  function renderLightbox() {
    var item = lbItems[lbIndex];
    if (!item || !lbImage) return;
    lbImage.src = item.src;
    lbImage.alt = item.alt;
    if (lbCategory) lbCategory.textContent = categoryLabels[item.category] || item.category;
    if (lbCaption) lbCaption.textContent = item.caption;
    if (lbAlt) lbAlt.textContent = item.alt;
    if (lbCount) {
      lbCount.textContent =
        String(lbIndex + 1).padStart(2, "0") + " / " + String(lbItems.length).padStart(2, "0");
    }
  }

  function openLightbox(items, index, trigger) {
    if (!lightbox || !items.length) return;
    lbItems = items;
    lbIndex = Math.max(0, Math.min(index, items.length - 1));
    lbTrigger = trigger || document.activeElement;
    renderLightbox();
    lightbox.hidden = false;
    document.body.classList.add("no-scroll");
    if (lbClose) lbClose.focus();
  }

  function closeLightbox() {
    if (!lightbox || lightbox.hidden) return;
    lightbox.hidden = true;
    document.body.classList.remove("no-scroll");
    if (lbTrigger && typeof lbTrigger.focus === "function") lbTrigger.focus();
  }

  function moveLightbox(step) {
    if (!lbItems.length) return;
    lbIndex = (lbIndex + step + lbItems.length) % lbItems.length;
    renderLightbox();
  }

  galleryCards.forEach(function (card) {
    card.addEventListener("click", function () {
      var visible = galleryCards.filter(function (entry) {
        return !entry.hidden;
      });
      openLightbox(visible.map(itemFromButton), visible.indexOf(card), card);
    });
  });

  var gameButtons = Array.prototype.slice.call(
    document.querySelectorAll(".trophy-btn, .mythic-btn")
  );
  var gameItems = gameButtons.map(itemFromButton);
  gameButtons.forEach(function (button, index) {
    button.addEventListener("click", function () {
      openLightbox(gameItems, index, button);
    });
  });

  if (lightbox) {
    if (lbClose) lbClose.addEventListener("click", closeLightbox);
    if (lbPrev) lbPrev.addEventListener("click", function () { moveLightbox(-1); });
    if (lbNext) lbNext.addEventListener("click", function () { moveLightbox(1); });
    lightbox.addEventListener("mousedown", function (event) {
      if (event.target === lightbox) closeLightbox();
    });
    document.addEventListener("keydown", function (event) {
      if (lightbox.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeLightbox();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveLightbox(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        moveLightbox(1);
      } else if (event.key === "Tab" && lbDialog) {
        var focusable = Array.prototype.slice.call(
          lbDialog.querySelectorAll("button, a[href]")
        );
        if (!focusable.length) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
  }

  /* Contact form */
  var form = document.getElementById("contactForm");
  var formStatus = document.getElementById("formStatus");
  var contactSubmit = document.getElementById("contactSubmit");

  function setFormStatus(message, state) {
    if (!formStatus) return;
    formStatus.textContent = message;
    formStatus.className = "form-status" + (state ? " " + state : "");
  }

  if (form && formStatus) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      var payload = {};
      new FormData(form).forEach(function (value, key) {
        payload[key] = value;
      });
      if (contactSubmit) contactSubmit.disabled = true;
      setFormStatus("Mengirim pesan...", "");
      fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function (response) {
          return response.json().catch(function () { return null; }).then(function (data) {
            if (!response.ok || !data || !data.ok) {
              throw new Error(
                (data && data.error) ||
                  "Pesan tidak dapat dikirim. Tidak ada yang terkirim. Silakan coba lagi nanti."
              );
            }
            return data;
          });
        })
        .then(function (data) {
          form.reset();
          setFormStatus(data.message || "Pesan Anda berhasil dikirim.", "success");
        })
        .catch(function (error) {
          var message = error && error.message ? error.message : "";
          if (!message || message === "Failed to fetch") {
            message =
              "Formulir tidak dapat menghubungi server. Tidak ada yang terkirim. Buka halaman ini melalui server situs, lalu coba lagi.";
          }
          setFormStatus(message, "error");
        })
        .finally(function () {
          if (contactSubmit) contactSubmit.disabled = false;
        });
    });
  }

  /* Year */
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  /* Tombol AI CTF: default same-origin agar bekerja pada satu server. */
  var ctfFab = document.getElementById("ctfFab");
  if (ctfFab) {
    var ctfOrigin = ctfFab.getAttribute("data-ctf-url");
    if (ctfOrigin) {
      ctfFab.href = ctfOrigin.replace(/\/+$/, "") + "/ctf/login";
    } else if (window.location.protocol === "file:") {
      ctfFab.href = "http://localhost:3000/ctf/login";
    }
  }
})();
