/* Preloader */
const preloader = document.getElementById('preloader');
if (preloader) {
    const progress = document.querySelector('.preloader-progress');
    let loadProgress = 0;
    document.body.style.overflow = 'hidden';

    const preloaderInterval = setInterval(() => {
        loadProgress += Math.random() * 15 + 5;
        if (loadProgress >= 100) {
            loadProgress = 100;
            clearInterval(preloaderInterval);
            setTimeout(() => {
                preloader.classList.add('hidden');
                document.body.style.overflow = 'auto';
                if (document.querySelector('.hero-title')) {
                    initHeroAnimation();
                }
            }, 400);
        }
        progress.style.width = loadProgress + '%';
    }, 200);
} else {
    if (document.querySelector('.hero-title')) {
        initHeroAnimation();
    }
}

/* Sticky header */
const header = document.getElementById('header');

if (header) {
    window.addEventListener('scroll', () => {
        if (window.scrollY > 80) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });
}

/* Hero text animation */
function initHeroAnimation() {
    const title = document.querySelector('.hero-title');
    const html = title.innerHTML;
    const parts = html.split(/<br\s*\/?>/i);
    title.innerHTML = '';

    let wordIndex = 0;
    parts.forEach((line, lineIdx) => {
        const words = line.trim().split(/\s+/);
        words.forEach((word) => {
            if (!word) return;
            const span = document.createElement('span');
            span.classList.add('word');
            span.textContent = word;
            span.style.transitionDelay = (wordIndex * 0.08) + 's';
            title.appendChild(span);
            wordIndex++;
        });
        if (lineIdx < parts.length - 1) {
            title.appendChild(document.createElement('br'));
        }
    });

    setTimeout(() => {
        document.querySelectorAll('.hero-title .word').forEach(w => w.classList.add('visible'));
    }, 200);

    setTimeout(() => {
        const heroButtons = document.querySelector('.hero-buttons');
        if (heroButtons) heroButtons.classList.add('visible');
    }, 600);
}

/* Hero scroll effect */
const heroSection = document.querySelector('.hero');
if (heroSection) {
    const heroContent = document.querySelector('.hero-content');
    const heroOverlay = document.querySelector('.hero-overlay');
    // On narrow screens the content sits close to the hero's bottom edge, so pushing it
    // down would clip the button against overflow:hidden — fade only, no parallax shift
    const parallaxQuery = window.matchMedia('(min-width: 1025px)');

    window.addEventListener('scroll', () => {
        const scrollY = window.scrollY;
        const heroHeight = heroSection.offsetHeight;
        if (scrollY < heroHeight) {
            const progress = scrollY / heroHeight;
            heroContent.style.transform = parallaxQuery.matches ? `translateY(${scrollY * 0.3}px)` : '';
            heroContent.style.opacity = 1 - progress * 1.5;
            heroOverlay.style.background = `linear-gradient(90deg,
                rgba(30,37,48,${0.93 + progress * 0.07}) 0%,
                rgba(30,37,48,${0.8 + progress * 0.2}) 30%,
                rgba(30,37,48,${0.6 + progress * 0.4}) 55%,
                rgba(30,37,48,${0.33 + progress * 0.67}) 100%)`;
        }
    });
}

/* Hero intro (instant on load) */
document.querySelectorAll('.hero-intro').forEach(el => {
    const delay = parseInt(el.dataset.introDelay) || 0;
    setTimeout(() => el.classList.add('hero-visible'), delay);
});

/* Page hero parallax */
const pageHeroBg = document.querySelector('.page-hero__bg');
if (pageHeroBg) {
    window.addEventListener('scroll', () => {
        const scrollY = window.scrollY;
        if (scrollY < 600) {
            pageHeroBg.style.transform = `translateY(${scrollY * 0.35}px) scale(1.1)`;
        }
    }, { passive: true });
    pageHeroBg.style.transform = 'scale(1.1)';
}

/* Scroll animations */
const animatedElements = document.querySelectorAll('[data-animate]');

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const delay = entry.target.dataset.delay || 0;
            setTimeout(() => {
                entry.target.classList.add('animated');
            }, parseInt(delay));
            observer.unobserve(entry.target);
        }
    });
}, {
    threshold: 0.15,
    rootMargin: '0px 0px -50px 0px'
});

animatedElements.forEach(el => observer.observe(el));

/* Counter animation */
function animateCounter(el) {
    const target = parseInt(el.dataset.count);
    const duration = Math.min(800 + target * 8, 2000);
    const start = performance.now();

    function update(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        el.textContent = Math.floor(target * eased);

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            el.textContent = target;
        }
    }

    requestAnimationFrame(update);
}

const counters = document.querySelectorAll('[data-count]');
const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            animateCounter(entry.target);
            counterObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.5 });

counters.forEach(c => counterObserver.observe(c));

/* Marquee duplication */
const marqueeTrack = document.querySelector('.marquee-track');
if (marqueeTrack) {
    const slides = marqueeTrack.innerHTML;
    marqueeTrack.innerHTML = slides + slides;
}

/* Smooth scroll */
document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(link.getAttribute('href'));
        if (target) {
            const headerHeight = 80;
            const top = target.getBoundingClientRect().top + window.scrollY - headerHeight;
            window.scrollTo({ top, behavior: 'smooth' });
        }
    });
});

/* City tags hover */
const cityTags = document.querySelectorAll('.city-tag');
const mapGlows = document.querySelectorAll('.map-glow');

cityTags.forEach(tag => {
    const city = tag.dataset.city;

    tag.addEventListener('mouseenter', () => {
        mapGlows.forEach(g => g.classList.remove('is-highlighted'));
        const glow = document.querySelector(`.map-glow[data-city="${city}"]`);
        if (glow) glow.classList.add('is-highlighted');
        tag.classList.add('is-active');
    });

    tag.addEventListener('mouseleave', () => {
        mapGlows.forEach(g => g.classList.remove('is-highlighted'));
        tag.classList.remove('is-active');
    });

    tag.addEventListener('click', () => {
        cityTags.forEach(t => t.classList.remove('is-active'));
        tag.classList.add('is-active');
        mapGlows.forEach(g => g.classList.remove('is-highlighted'));
        const glow = document.querySelector(`.map-glow[data-city="${city}"]`);
        if (glow) glow.classList.add('is-highlighted');
    });
});

mapGlows.forEach(glow => {
    const city = glow.dataset.city;

    glow.addEventListener('mouseenter', () => {
        glow.classList.add('is-highlighted');
        const tag = document.querySelector(`.city-tag[data-city="${city}"]`);
        if (tag) tag.classList.add('is-active');
    });

    glow.addEventListener('mouseleave', () => {
        glow.classList.remove('is-highlighted');
        const tag = document.querySelector(`.city-tag[data-city="${city}"]`);
        if (tag) tag.classList.remove('is-active');
    });
});

/* Hero video autoplay */
const heroVideo = document.getElementById('hero-video');
if (heroVideo) {
    heroVideo.play().catch(() => {
        document.addEventListener('click', () => heroVideo.play(), { once: true });
    });
}

/* Cert carousel (marquee) */
(() => {
    const track = document.querySelector('.cert-carousel__track');
    if (!track) return;
    const cards = Array.from(track.children);
    cards.forEach(card => {
        const clone = card.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        clone.setAttribute('tabindex', '-1');
        track.appendChild(clone);
    });
})();

/* Partners filter */
const filterTabs = document.querySelectorAll('.partners-filters__tab[data-filter]');
const partnerCards = document.querySelectorAll('.partner-card[data-category]');

if (filterTabs.length && partnerCards.length) {
    filterTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            filterTabs.forEach(t => t.classList.remove('partners-filters__tab--active'));
            tab.classList.add('partners-filters__tab--active');

            const filter = tab.dataset.filter;

            partnerCards.forEach(card => {
                if (filter === 'all' || card.dataset.category === filter) {
                    card.classList.remove('partner-card--hidden');
                    card.classList.add('partner-card--visible');
                } else {
                    card.classList.remove('partner-card--visible');
                    card.classList.add('partner-card--hidden');
                }
            });
        });
    });
}


/* Mobile menu: burger button + full-screen panel built from the desktop .nav */
const desktopNav = document.querySelector('.header .nav');
const headerRight = document.querySelector('.header .header-right');

if (desktopNav && headerRight) {
    const burger = document.createElement('button');
    burger.className = 'burger';
    burger.type = 'button';
    burger.setAttribute('aria-label', 'Открыть меню');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-controls', 'mobileMenu');
    burger.innerHTML = '<i data-lucide="menu"></i>';
    headerRight.appendChild(burger);

    const panel = document.createElement('div');
    panel.className = 'mobile-menu';
    panel.id = 'mobileMenu';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Меню сайта');
    panel.innerHTML = `
        <button class="mobile-menu__close" type="button" aria-label="Закрыть меню"><i data-lucide="x"></i></button>
        <nav class="mobile-menu__nav"></nav>
        <div class="mobile-menu__footer">
            <a href="contacts.html" class="btn-cta mobile-menu__cta">СВЯЗАТЬСЯ</a>
            <a href="tel:+78633200358" class="mobile-menu__contact">+7 (863) 320-03-58</a>
            <a href="mailto:info@ooovsa.ru" class="mobile-menu__contact">info@ooovsa.ru</a>
        </div>`;
    const mobileNav = panel.querySelector('.mobile-menu__nav');
    desktopNav.querySelectorAll('.nav-link').forEach(link => {
        const item = document.createElement('a');
        item.href = link.getAttribute('href');
        item.className = 'mobile-menu__link' + (link.classList.contains('nav-link--active') ? ' mobile-menu__link--active' : '');
        item.textContent = link.textContent.trim();
        mobileNav.appendChild(item);
    });
    document.body.appendChild(panel);

    const closeBtn = panel.querySelector('.mobile-menu__close');

    const openMenu = () => {
        panel.classList.add('is-open');
        document.body.classList.add('menu-open');
        burger.setAttribute('aria-expanded', 'true');
        closeBtn.focus();
    };

    const closeMenu = () => {
        panel.classList.remove('is-open');
        document.body.classList.remove('menu-open');
        burger.setAttribute('aria-expanded', 'false');
    };

    burger.addEventListener('click', openMenu);
    closeBtn.addEventListener('click', () => {
        closeMenu();
        burger.focus();
    });
    // Same-page anchors (e.g. #about on the home page) need the panel closed to be visible
    mobileNav.addEventListener('click', e => {
        if (e.target.closest('a')) closeMenu();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && panel.classList.contains('is-open')) {
            closeMenu();
            burger.focus();
        }
    });
    // Leaving the mobile layout (rotating a tablet, resizing) must not keep the page locked
    window.matchMedia('(min-width: 1025px)').addEventListener('change', e => {
        if (e.matches) closeMenu();
    });
}

/* Lucide icons */
if (typeof lucide !== 'undefined') {
    lucide.createIcons();
}

/* Current year in the footer copyright */
document.querySelectorAll('[data-current-year]').forEach(el => {
    el.textContent = new Date().getFullYear();
});
