/**
 * Поведение лендинга: сворачивание опыта, reveal при скролле, имя в шапке,
 * count-up полосы цифр, лайтбокс фото увлечений. Бандлится Astro (модульный
 * <script>, отложенный — DOM уже готов). Переключение языка — в LangToggle.astro;
 * скрипт первичной установки языка живёт инлайн в <head> (без мигания).
 *
 * Типизация намеренно нестрогая (перенос рабочего DOM-скрипта как есть).
 */
const html = document.documentElement;
const reduce =
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- Сворачивание опыта: всё видимо без JS; здесь сворачиваем и вешаем тоггл.
document.querySelectorAll<HTMLButtonElement>('.tl-toggle').forEach((btn) => {
  const rest = btn.parentElement?.querySelector<HTMLElement>('.tl-rest');
  if (!rest) return;
  rest.classList.add('is-collapsed');
  rest.style.maxHeight = '0px';
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') === 'true';
    if (open) {
      // Свернуть: фиксируем текущую высоту, затем уводим в 0 (для анимации).
      rest.style.maxHeight = rest.scrollHeight + 'px';
      requestAnimationFrame(() => {
        rest.classList.add('is-collapsed');
        rest.style.maxHeight = '0px';
      });
      btn.setAttribute('aria-expanded', 'false');
    } else {
      rest.classList.remove('is-collapsed');
      rest.style.maxHeight = rest.scrollHeight + 'px';
      btn.setAttribute('aria-expanded', 'true');
    }
  });
  // После разворота снимаем фиксированную высоту — чтобы контент мог
  // переразмечаться (напр. при переключении языка).
  rest.addEventListener('transitionend', (ev) => {
    if (ev.propertyName === 'max-height' && !rest.classList.contains('is-collapsed')) {
      rest.style.maxHeight = 'none';
    }
  });
});

// --- Появление при скролле.
const revealables = document.querySelectorAll('.reveal');
if (reduce || !('IntersectionObserver' in window)) {
  revealables.forEach((el) => el.classList.add('in'));
} else {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  revealables.forEach((el) => io.observe(el));
}

// --- Имя в шапке проявляется, когда крупное имя из hero ушло за верх.
const navEl = document.querySelector('.nav');
const heroName = document.querySelector('.hero h1');
if (navEl && heroName) {
  if (!('IntersectionObserver' in window)) {
    navEl.classList.add('scrolled');
  } else {
    const navIo = new IntersectionObserver(
      (entries) => {
        navEl.classList.toggle('scrolled', !entries[0].isIntersecting);
      },
      // Отрицательный top ≈ высоте шапки: срабатывает, когда имя
      // уходит под неё, а не когда полностью покидает вьюпорт.
      { rootMargin: '-64px 0px 0px 0px', threshold: 0 },
    );
    navIo.observe(heroName);
  }
}

// --- Count-up для полосы цифр: докручиваем числовой префикс от 0.
// Без анимации значения уже в DOM (важно для no-JS/reduce-motion/SEO).
const band = document.querySelector('.stats-band');
if (band && !reduce && 'IntersectionObserver' in window) {
  // У каждого числа парсим ведущий целый префикс: «50+»→50, «91%»→91,
  // «10+ лет»→10. Если целого префикса нет («1,5×») — оставляем как есть.
  const counters: { el: Element; target: number; suffix: string }[] = [];
  band.querySelectorAll('[data-count]').forEach((el) => {
    const full = (el.textContent ?? '').trim();
    const m = /^(\d+)/.exec(full);
    if (!m) return;
    const suffix = full.slice(m[1].length); // «+», «%», « лет»…
    // Дробные («1,5×», «1.5×») не крутим — 0→1 смотрится странно.
    if (/^[.,]/.test(suffix)) return;
    counters.push({ el, target: parseInt(m[1], 10), suffix });
    el.textContent = '0' + suffix;
  });
  if (counters.length) {
    const DURATION = 850;
    const animate = (start: number) => {
      const step = (now: number) => {
        const p = Math.min((now - start) / DURATION, 1);
        const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
        counters.forEach((c) => {
          c.el.textContent = Math.round(eased * c.target) + c.suffix;
        });
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const cio = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            cio.unobserve(entry.target);
            requestAnimationFrame((t) => animate(t));
          }
        });
      },
      { threshold: 0.35 },
    );
    cio.observe(band);
  }
}

// --- Лайтбокс фото увлечений.
const lb = document.getElementById('lightbox');
if (lb) {
  const lbImg = lb.querySelector<HTMLImageElement>('.lightbox-img')!;
  const lbCap = lb.querySelector<HTMLElement>('.lightbox-cap')!;
  let lastFocused: HTMLElement | null = null;
  const openLightbox = (src: string | null, capRu: string | null, capEn: string | null, alt: string | null) => {
    lbImg.setAttribute('src', src || '');
    lbImg.setAttribute('alt', alt || '');
    lbCap.innerHTML = '';
    const sru = document.createElement('span');
    sru.className = 'lang-ru';
    sru.textContent = capRu || '';
    const sen = document.createElement('span');
    sen.className = 'lang-en';
    sen.textContent = capEn || '';
    lbCap.appendChild(sru);
    lbCap.appendChild(sen);
    lb.classList.add('open');
    lb.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };
  const closeLightbox = () => {
    lb.classList.remove('open');
    lb.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    lbImg.setAttribute('src', '');
    if (lastFocused) lastFocused.focus();
  };
  document.querySelectorAll<HTMLButtonElement>('.interest-clickable').forEach((btn) => {
    btn.addEventListener('click', () => {
      lastFocused = btn;
      openLightbox(
        btn.getAttribute('data-photo'),
        btn.getAttribute('data-caption-ru'),
        btn.getAttribute('data-caption-en'),
        btn.getAttribute('data-caption-' + (html.dataset.lang || 'ru')),
      );
    });
  });
  lb.addEventListener('click', (ev) => {
    // Клик по фону/крестику (не по самому фото) — закрыть.
    const t = ev.target as HTMLElement;
    if (t === lb || t.classList.contains('lightbox-close')) closeLightbox();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && lb.classList.contains('open')) closeLightbox();
  });
}
