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
  const lbClose = lb.querySelector<HTMLButtonElement>('.lightbox-close')!;
  let lastFocused: HTMLElement | null = null;
  const openLightbox = (
    src: string | null,
    capRu: string | null,
    capEn: string | null,
    alt: string | null,
  ) => {
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
    lbClose.focus(); // фокус в диалог для клавиатуры
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
    if (!lb.classList.contains('open')) return;
    if (ev.key === 'Escape') {
      closeLightbox();
    } else if (ev.key === 'Tab') {
      // Единственный фокусируемый элемент в диалоге — крестик: держим фокус на нём
      // (aria-modal="true" обещает, что фокус не уходит на фон под лайтбоксом).
      ev.preventDefault();
      lbClose.focus();
    }
  });
}

// --- Фильтр навыков по компании (SkillsSection). Клик по компании подсвечивает
// навыки с data-co, где встречается её ключ; остальные гаснут (класс на контейнере).
const filterBar = document.querySelector<HTMLElement>('.skill-filter');
const skillGroups = document.querySelector<HTMLElement>('.skill-groups');
if (filterBar && skillGroups) {
  const coBtns = filterBar.querySelectorAll<HTMLButtonElement>('.co-btn');
  const chips = skillGroups.querySelectorAll<HTMLElement>('.tag');
  let activeCo = '';

  const applyFilter = (co: string) => {
    activeCo = co;
    coBtns.forEach((b) => {
      const on = b.dataset.co === co;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    if (!co) {
      skillGroups.classList.remove('co-filtering');
      chips.forEach((c) => c.classList.remove('co-on'));
      return;
    }
    skillGroups.classList.add('co-filtering');
    chips.forEach((c) => {
      const keys = (c.dataset.co || '').split(' ');
      c.classList.toggle('co-on', keys.indexOf(co) >= 0);
    });
  };

  coBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      // Повторный клик по активной компании — сброс к «Все».
      applyFilter(btn.dataset.co === activeCo ? '' : btn.dataset.co || '');
    });
  });

  // Ссылка «по группам →» из карточки опыта: якорь #skills сам скроллит, здесь —
  // включаем фильтр навыков по компании этой карточки (структурированный просмотр).
  document.querySelectorAll<HTMLAnchorElement>('.tl-stack-skills').forEach((a) => {
    a.addEventListener('click', () => {
      const coBtn = filterBar.querySelector<HTMLButtonElement>(
        `.co-btn[title="${a.dataset.company}"]`,
      );
      if (coBtn && coBtn.getAttribute('aria-pressed') !== 'true') coBtn.click();
    });
  });
}

// --- Поповер «где применялся навык» у чипов с доказательствами (SkillsSection).
// Содержимое пререндерено на сборке в <template> рядом с кнопкой-чипом; здесь —
// единственный всплывающий элемент: клон шаблона, позиционирование, открытие/закрытие.
const popButtons = document.querySelectorAll<HTMLButtonElement>('.tag.has-pop');
if (popButtons.length) {
  const pop = document.createElement('div');
  pop.className = 'skill-pop';
  pop.id = 'skill-pop';
  pop.setAttribute('role', 'dialog');
  let openBtn: HTMLButtonElement | null = null;

  const close = () => {
    if (!openBtn) return;
    openBtn.setAttribute('aria-expanded', 'false');
    openBtn.removeAttribute('aria-controls'); // #skill-pop уходит из DOM — ссылка не должна виснуть
    openBtn.closest('.skill-group')?.classList.remove('pop-open');
    openBtn = null;
    pop.remove();
  };

  const open = (btn: HTMLButtonElement, byKeyboard: boolean) => {
    const tpl = btn.nextElementSibling;
    const group = btn.closest<HTMLElement>('.skill-group');
    if (!(tpl instanceof HTMLTemplateElement) || !group) return;
    close();
    pop.innerHTML = '';
    pop.appendChild(tpl.content.cloneNode(true));
    // Доступное имя диалога — название навыка (иначе SR читает просто «dialog»).
    pop.setAttribute('aria-label', btn.textContent?.trim() ?? '');
    group.appendChild(pop);
    group.classList.add('pop-open');
    // Имя компании в строке — полное; если не влезает (строка переполнена) — короткое.
    pop.querySelectorAll<HTMLElement>('.skill-pop-list li').forEach((li) => {
      const a = li.querySelector<HTMLAnchorElement>('a[data-short]');
      if (a && li.scrollWidth > li.clientWidth)
        a.textContent = a.dataset.short ?? a.textContent;
    });
    // Под кнопкой, прижимаясь к границам карточки; не влезает в вьюпорт — над ней.
    pop.style.left =
      Math.max(0, Math.min(btn.offsetLeft, group.clientWidth - pop.offsetWidth - 12)) +
      'px';
    pop.style.top = btn.offsetTop + btn.offsetHeight + 8 + 'px';
    if (pop.getBoundingClientRect().bottom > window.innerHeight - 12) {
      pop.style.top = btn.offsetTop - pop.offsetHeight - 8 + 'px';
    }
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-controls', 'skill-pop'); // валидна, только пока #skill-pop в DOM
    openBtn = btn;
    // Фокус в поповер — только при открытии с клавиатуры (у клика мышью
    // ev.detail > 0); иначе после клика виден лишний focus-ring на ссылке.
    if (byKeyboard) pop.querySelector<HTMLElement>('a')?.focus();
  };

  popButtons.forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation(); // не даём document-обработчику закрыть только что открытое
      if (openBtn === btn) close();
      else open(btn, ev.detail === 0);
    });
  });

  pop.addEventListener('click', (ev) => {
    ev.stopPropagation(); // клик внутри поповера не закрывает его…
    const a = (ev.target as HTMLElement).closest('a');
    if (!a) return;
    // …кроме перехода к месту работы: закрываем и мигаем целевой карточкой.
    const target = document.querySelector(a.getAttribute('href') ?? '');
    close();
    if (target) {
      target.classList.remove('flash');
      void (target as HTMLElement).offsetWidth; // перезапуск анимации при повторном клике
      target.classList.add('flash');
      window.setTimeout(() => target.classList.remove('flash'), 1600);
    }
  });

  document.addEventListener('click', close);
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && openBtn) {
      const btn = openBtn;
      close();
      btn.focus();
    }
  });
  window.addEventListener('resize', close);
}

// --- Интерактивное свечение фона: мягко ведём голубой блик за курсором.
// Слой — body::after (см. base.css). Инерция: цель tx/ty → текущие cx/cy через lerp.
// Только для точных указателей (мышь/трекпад) и без reduce-motion.
if (!reduce && window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
  let tx = 50;
  let ty = 0;
  let cx = 50;
  let cy = 0;
  let raf = 0;
  const frame = () => {
    cx += (tx - cx) * 0.08;
    cy += (ty - cy) * 0.08;
    html.style.setProperty('--mx', cx.toFixed(2) + '%');
    html.style.setProperty('--my', cy.toFixed(2) + '%');
    // Крутим кадры, пока блик не «догнал» курсор; затем засыпаем до нового движения.
    raf =
      Math.abs(tx - cx) > 0.1 || Math.abs(ty - cy) > 0.1
        ? requestAnimationFrame(frame)
        : 0;
  };
  window.addEventListener(
    'mousemove',
    (ev) => {
      tx = (ev.clientX / window.innerWidth) * 100;
      ty = (ev.clientY / window.innerHeight) * 100;
      document.body.classList.add('glow-active');
      if (!raf) raf = requestAnimationFrame(frame);
    },
    { passive: true },
  );

  // --- Tilt/parallax: лёгкий 3D-наклон к курсору у фото и карточек результатов.
  // Наклон ставим инлайн-transform'ом; возврат сглаживает CSS-transition на элементе
  // (portrait-frame / .result уже имеют transition transform). Лифт .result:hover
  // сохраняем, добавляя translateY внутрь transform.
  const attachTilt = (el: HTMLElement, max: number, lift: number) => {
    let raf2 = 0;
    let rx = 0;
    let ry = 0;
    const apply = () => {
      raf2 = 0;
      const t = `perspective(720px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      el.style.transform = lift ? `${t} translateY(${lift}px)` : t;
    };
    // Помечаем элемент на время наведения: .result.tilting ускоряет transform
    // с унаследованных от .reveal 0.5s до ~фото (см. content.css). Появление
    // (opacity-fade) уже прошло к моменту наведения, поэтому его не задеваем.
    // transition-delay зануляем инлайном: стаггер появления (.reveal:nth-child →
    // delay 0.06–0.18s) иначе задерживает и наклон — нижние карточки тормозят.
    el.addEventListener('pointerenter', () => {
      el.classList.add('tilting');
      el.style.transitionDelay = '0s';
    });
    el.addEventListener('pointermove', (ev) => {
      const r = el.getBoundingClientRect();
      const px = (ev.clientX - r.left) / r.width - 0.5; // -0.5..0.5
      const py = (ev.clientY - r.top) / r.height - 0.5;
      rx = -py * max * 2;
      ry = px * max * 2;
      if (!raf2) raf2 = requestAnimationFrame(apply);
    });
    el.addEventListener('pointerleave', () => {
      if (raf2) {
        cancelAnimationFrame(raf2);
        raf2 = 0;
      }
      el.style.transform = ''; // назад к CSS-состоянию (плавно, через transition элемента)
    });
  };
  document
    .querySelectorAll<HTMLElement>('.portrait-frame')
    .forEach((el) => attachTilt(el, 8, 0));
  document
    .querySelectorAll<HTMLElement>('.result')
    .forEach((el) => attachTilt(el, 5, -3));
  // Карточки групп навыков — чуть мягче (крупнее .result): max 4.
  document
    .querySelectorAll<HTMLElement>('.skill-group')
    .forEach((el) => attachTilt(el, 4, -3));
}
